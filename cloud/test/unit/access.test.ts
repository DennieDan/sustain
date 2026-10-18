// CLD-01: GitHub permissions become roles, organizations are mirrored at sign-in, and access is
// rechecked at sign-in and once it is an hour old.
import { describe, expect, test } from "vitest";
import { openDatabase } from "../../src/db/client";
import { atLeast, checkAccess, organizationsOf, roleFor, signIn, spacesOf } from "../../src/lib/access";
import type { GitHubApi, GitHubPermissions } from "../../src/lib/github";

/** A GitHub that answers from a table and counts repository lookups. */
function fakeGitHub(permissions: Record<string, GitHubPermissions | null>, orgs = [{ id: 7, login: "acme" }]): GitHubApi & { lookups: number } {
  const api = {
    lookups: 0,
    async user() {
      return { id: 1, login: "dev", name: "Dev" };
    },
    async organizations() {
      return orgs;
    },
    async repository(_token: string, owner: string, name: string) {
      api.lookups++;
      const perms = permissions[`${owner}/${name}`];
      return perms === undefined || perms === null ? null : { id: 100 + Object.keys(permissions).indexOf(`${owner}/${name}`), owner, name, private: true, defaultBranch: "main", permissions: perms };
    },
  };
  return api;
}

describe("CLD-01 permission mapping", () => {
  test.each([
    [{ admin: true, push: true, pull: true }, "owner"],
    [{ maintain: true, pull: true }, "member"],
    [{ push: true, pull: true }, "member"],
    [{ triage: true, pull: true }, "viewer"],
    [{ pull: true }, "viewer"],
    [{}, null],
  ])("%j is %s", (permissions, role) => {
    expect(roleFor(permissions)).toBe(role);
  });

  test("roles rank viewer, member, owner", () => {
    expect(atLeast("owner", "member")).toBe(true);
    expect(atLeast("viewer", "member")).toBe(false);
    expect(atLeast(null, "viewer")).toBe(false);
  });
});

describe("CLD-01 sign-in and rechecks", () => {
  test("sign-in records the user and mirrors their organizations", async () => {
    const db = await openDatabase();
    const user = await signIn(db, fakeGitHub({}, [{ id: 7, login: "acme" }, { id: 8, login: "beta" }]), "gho_token");
    expect(user).toMatchObject({ login: "dev", githubToken: "gho_token" });
    expect(await organizationsOf(db, user.userId)).toEqual(["acme", "beta"]);
    await signIn(db, fakeGitHub({}, [{ id: 8, login: "beta" }]), "gho_token");
    expect(await organizationsOf(db, user.userId)).toEqual(["beta"]);
  });

  test("access comes from GitHub, is reused for an hour, then rechecked; losing it removes it", async () => {
    const db = await openDatabase();
    const perms: Record<string, GitHubPermissions | null> = { "acme/shop": { push: true, pull: true } };
    const github = fakeGitHub(perms);
    const user = await signIn(db, github, "gho_token");
    const t0 = new Date("2026-10-18T10:00:00Z");
    expect(await checkAccess(db, github, user, "acme", "shop", t0)).toMatchObject({ role: "member", repo: { owner: "acme", name: "shop", defaultBranch: "main" } });
    perms["acme/shop"] = { admin: true };
    expect((await checkAccess(db, github, user, "acme", "shop", new Date(t0.getTime() + 30 * 60_000)))?.role).toBe("member");
    expect(github.lookups).toBe(1);
    expect((await checkAccess(db, github, user, "acme", "shop", new Date(t0.getTime() + 61 * 60_000)))?.role).toBe("owner");
    perms["acme/shop"] = null;
    expect(await checkAccess(db, github, user, "acme", "shop", new Date(t0.getTime() + 3 * 3_600_000))).toBeNull();
    expect(await spacesOf(db, user.userId)).toEqual([]);
  });

  test("sign-in rechecks every access the user holds, however fresh", async () => {
    const db = await openDatabase();
    const perms: Record<string, GitHubPermissions | null> = { "acme/shop": { pull: true } };
    const github = fakeGitHub(perms);
    const user = await signIn(db, github, "gho_token");
    await checkAccess(db, github, user, "acme", "shop");
    perms["acme/shop"] = { admin: true };
    await signIn(db, github, "gho_token");
    expect((await spacesOf(db, user.userId)).map((space) => space.role)).toEqual(["owner"]);
  });

  test("a repository the user cannot see gets no access", async () => {
    const db = await openDatabase();
    const github = fakeGitHub({});
    const user = await signIn(db, github, "gho_token");
    expect(await checkAccess(db, github, user, "acme", "secret")).toBeNull();
  });
});
