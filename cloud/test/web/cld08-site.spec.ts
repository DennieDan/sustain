// CLD-08 [web]: the public site, with no request leaving it.
import { expect, test } from "@playwright/test";

test("CLD-08 landing, docs, privacy and gallery render without any third-party request", async ({ page }) => {
  const hosts = new Set<string>();
  page.on("request", (request) => hosts.add(new URL(request.url()).host));
  await page.goto("/");
  await expect(page.locator("main")).toContainText("Free during beta.");
  await page.goto("/docs");
  await expect(page.locator(".markdown h2").first()).toBeVisible();
  await page.getByRole("link", { name: "Architecture" }).first().click();
  await expect(page.locator(".markdown")).toContainText("Sustain architecture");
  await page.goto("/privacy");
  await expect(page.locator("main")).toContainText("Maps, not code");
  await expect(page.locator("pre")).toContainText('"title": "Sustain Cloud upload"');
  await page.goto("/gallery");
  await expect(page.locator("h1")).toHaveText("Gallery");
  expect([...hosts]).toEqual(["127.0.0.1:3210"]);
});
