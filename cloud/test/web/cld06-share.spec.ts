// CLD-06 [web]: an owner makes a 7-day link to a private map; anyone with it sees the map read-only
// without signing in, until the owner revokes it.
import { expect, test } from "@playwright/test";
import { MAP, signInAsDev, upload } from "./support";

test("CLD-06 a share link opens a private map to anyone signed out, and stops once revoked", async ({ page, browser, request }) => {
  await upload(request, "acme/shared", { branch: "main", kind: "map", map: MAP, meta: { defaultBranch: "main" } });
  await signInAsDev(page, "/settings/acme/shared");
  await page.getByRole("button", { name: "Share for 7 days" }).click();
  const link = page.locator(".new-share");
  await expect(link).toContainText("/s/shr_");
  const url = (await link.textContent())!.trim();
  await expect(page.locator(".shares li")).toHaveCount(1);
  await expect(page.locator(".shares li")).toContainText("expires");

  const stranger = await browser.newPage();
  await stranger.goto(url);
  await expect(stranger.locator("#sustain-viewer .node").first()).toBeVisible();
  await expect(stranger.locator(".shared-note")).toContainText("read-only");
  await expect(stranger.locator(".site-header .account")).not.toContainText("dev");

  page.on("dialog", (dialog) => void dialog.accept());
  await page.locator(".shares li").getByRole("button", { name: "Revoke" }).click();
  await expect(page.locator(".shares li")).toHaveCount(0);
  const gone = await stranger.goto(url);
  expect(gone?.status()).toBe(404);
  await stranger.close();
});
