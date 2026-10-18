// CLD-07 [web]: on an app with billing on, an owner upgrades an account from Free to Team through
// Stripe Checkout (mocked), whose signed webhook sets the plan, and can then manage billing.
import { expect, test } from "@playwright/test";
import { BILLED_APP, MAP, signInAsDev, upload } from "./support";

test.use({ baseURL: `http://127.0.0.1:${BILLED_APP}` });

test("CLD-07 an owner upgrades an account to Team through Checkout, and Team unlocks pull request pages", async ({ page, request }) => {
  await upload(request, "acme/paid", { branch: "main", kind: "map", map: MAP, meta: { defaultBranch: "main" } });
  await signInAsDev(page, "/acme/paid");
  await page.goto("/acme/paid/pull/1");
  await expect(page.locator(".plan-note")).toHaveText("Pull request pages come with the Team plan. acme is on Free.");

  await page.goto("/settings");
  const plan = page.locator(".plans li", { hasText: "acme" });
  await expect(plan.locator(".plan-name")).toHaveText("Free");
  await expect(plan).toContainText("Team is $8 per seat a month.");
  await plan.getByRole("button", { name: "Upgrade to Team" }).click();
  await page.waitForURL("**/settings?upgraded=acme");
  await expect(plan.locator(".plan-name")).toHaveText("Team");
  await expect(plan.getByRole("button", { name: "Manage billing" })).toBeVisible();

  await page.goto("/acme/paid/pull/1");
  await expect(page.locator("main")).toContainText("No check uploaded for this pull request yet.");
});
