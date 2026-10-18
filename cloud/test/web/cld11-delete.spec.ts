// CLD-11 [web]: an owner deletes a map, then the repository's data, then the account, each at once.
import { expect, test } from "@playwright/test";
import { MAP, signInAsDev, upload } from "./support";

test("CLD-11 deleting a map, a repository's data and the account takes effect at once", async ({ page, request }) => {
  await upload(request, "acme/gone", { branch: "main", kind: "map", map: MAP, meta: { defaultBranch: "main" } });
  await upload(request, "acme/gone", { branch: "main", kind: "map", map: MAP, meta: { defaultBranch: "main" } });
  await signInAsDev(page, "/settings/acme/gone");
  const alerts: string[] = [];
  page.on("dialog", (dialog) => {
    if (dialog.type() === "alert") alerts.push(dialog.message());
    void dialog.accept();
  });

  await expect(page.locator(".maps li")).toHaveCount(2);
  await page.locator(".maps li").first().getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".maps li")).toHaveCount(1);
  expect(alerts).toEqual([]);

  await page.getByRole("button", { name: "Create upload token" }).click();
  await expect(page.locator(".new-token")).toContainText("sus_");

  await page.getByRole("button", { name: "Delete all data" }).click();
  await page.waitForURL("**/settings");
  await page.goto("/acme/gone");
  await expect(page.locator("main")).toContainText("No map from main yet");

  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.waitForURL("**/api/auth/signout");
});
