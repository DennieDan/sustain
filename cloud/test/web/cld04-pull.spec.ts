// CLD-04 [web]: a pull request's latest check on the map: touched boxes, new box candidates as
// ghosts, stale boxes and the counts.
import { expect, test } from "@playwright/test";
import { check, MAP, signInAsDev, upload } from "./support";

test("CLD-04 the pull request page shows the overlay, the candidates and the stale boxes", async ({ page, request }) => {
  await upload(request, "acme/pulls", { branch: "main", kind: "map", map: MAP, meta: { defaultBranch: "main" } });
  await upload(request, "acme/pulls", check(7));
  await signInAsDev(page, "/acme/pulls/pull/7");
  await expect(page.locator("#sustain-viewer .node--change-strong")).toHaveCount(1);
  await expect(page.locator("#sustain-viewer .node--change-weak")).toHaveCount(1);
  await expect(page.locator("#sustain-viewer .node--ghost")).toHaveCount(1);
  await expect(page.locator("#sustain-viewer .node--edited")).toHaveCount(1);
  await expect(page.locator(".changes__summary")).toContainText("Pull request #7: 1 box touched, 1 more in the same files");
  await expect(page.locator(".counts")).toContainText("1 new box candidates");
  await expect(page.locator(".map-side")).toContainText("src/payments/");
});

test("CLD-04 a pull request without a check says so", async ({ page }) => {
  await signInAsDev(page, "/acme/pulls/pull/99");
  await expect(page.locator("main")).toContainText("No check uploaded for this pull request yet.");
});
