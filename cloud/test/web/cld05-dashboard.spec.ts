// CLD-05 [web]: the team dashboard lists each repository of the organization the user can see, with
// its main map, the latest check's figures, the hotspots and the recent pull requests.
import { expect, test } from "@playwright/test";
import { check, MAP, signInAsDev, upload } from "./support";

test("CLD-05 the organization's dashboard shows each repository's map, figures, hotspots and pull requests", async ({ page, request }) => {
  await upload(request, "acme/board", { branch: "main", kind: "map", map: MAP, meta: { defaultBranch: "main" } });
  await upload(request, "acme/board", check(12));
  await signInAsDev(page, "/acme");
  const row = page.locator(".dashboard tbody tr", { has: page.getByRole("link", { name: "board", exact: true }) });
  await expect(row).toBeVisible();
  const cells = row.locator("td");
  await expect(cells.nth(0)).toContainText("boxes");
  await expect(cells.nth(1)).toHaveText("1");
  await expect(cells.nth(2)).toHaveText("1");
  await expect(cells.nth(4)).toContainText("first (1)");
  await expect(row.getByRole("link", { name: "#12" })).toHaveAttribute("href", "/acme/board/pull/12");
  await expect(page.locator(".dashboard thead")).not.toContainText(/author|who/i);
});
