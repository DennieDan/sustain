// CLD-01 [web]: signing in with the mocked GitHub records the user and mirrors their organizations.
import { expect, test } from "@playwright/test";
import { signInAsDev } from "./support";

test("CLD-01 sign-in through GitHub lands back signed in, with the organizations mirrored", async ({ page }) => {
  await signInAsDev(page);
  await expect(page.locator("h1")).toHaveText("dev");
  await expect(page.locator(".orgs")).toHaveText("acme");
});

test("CLD-01 a signed-out visit to a private space goes to sign-in, and comes back after it", async ({ page }) => {
  await page.goto("/acme/private-space");
  await expect(page).toHaveURL(/\/signin\?callbackUrl=%2Facme%2Fprivate-space/);
  await page.getByRole("button", { name: "Sign in with GitHub" }).click();
  await page.waitForURL("**/acme/private-space");
  await expect(page.locator("main")).toContainText("No map from main yet");
});
