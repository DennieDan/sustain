// CLD-13 [web]: an owner sees each upload in the repository's audit log, and downloads all their data
// as JSON from Settings.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { MAP, signInAsDev, upload } from "./support";

test("CLD-13 the audit log lists each upload, and Settings exports the owner's data as JSON", async ({ page, request }) => {
  await upload(request, "acme/audited", { branch: "main", kind: "map", map: MAP, meta: { defaultBranch: "main" } });
  await signInAsDev(page, "/settings/acme/audited");
  const entry = page.locator(".audit tbody tr").first();
  await expect(entry).toContainText("GitHub Actions OIDC for acme/audited");
  await expect(entry).toContainText("KB");

  await page.goto("/settings");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export your data" }).click();
  const file = await (await download).path();
  const data = JSON.parse(readFileSync(file, "utf8")) as { user: { login: string }; repositories: { owner: string; name: string; uploads: { kind: string }[] }[] };
  expect(data.user.login).toBe("dev");
  expect(data.repositories.find((repo) => repo.name === "audited")?.uploads.map((row) => row.kind)).toEqual(["map"]);
});
