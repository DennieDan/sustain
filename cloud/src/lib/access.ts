// CLD-01: who may see and change a repository's space. Roles follow the user's GitHub permission:
// read makes a viewer, write a member, admin an owner. Access is rechecked at sign-in and when it
// is over an hour old.
import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { access, memberships, organizations, repositories, users } from "../db/schema";
import type { GitHubApi, GitHubPermissions } from "./github";
import { upsertRepository, type Repository } from "./store";

export type Role = "viewer" | "member" | "owner";

/** How old an access check may be before GitHub is asked again. */
export const ACCESS_TTL_MS = 3_600_000;

const RANK: Record<Role, number> = { viewer: 1, member: 2, owner: 3 };

export function roleFor(permissions: GitHubPermissions): Role | null {
  if (permissions.admin) return "owner";
  if (permissions.maintain || permissions.push) return "member";
  if (permissions.triage || permissions.pull) return "viewer";
  return null;
}

export function atLeast(role: Role | null | undefined, needed: Role): boolean {
  return role !== null && role !== undefined && RANK[role] >= RANK[needed];
}

export interface SignedIn {
  userId: number;
  login: string;
  /** The user's GitHub OAuth token, kept server-side in the session JWT. */
  githubToken: string;
}

/** At sign-in: the user, their organizations mirrored, and every access they had rechecked. */
export async function signIn(db: Database, github: GitHubApi, token: string, now = new Date()): Promise<SignedIn> {
  const profile = await github.user(token);
  const [user] = await db
    .insert(users)
    .values({ githubId: profile.id, login: profile.login, name: profile.name })
    .onConflictDoUpdate({ target: users.githubId, set: { login: profile.login, name: profile.name } })
    .returning();
  const orgs = await github.organizations(token);
  await db.delete(memberships).where(eq(memberships.userId, user!.id));
  for (const org of orgs) {
    const [row] = await db.insert(organizations).values({ githubId: org.id, login: org.login }).onConflictDoUpdate({ target: organizations.githubId, set: { login: org.login } }).returning();
    await db.insert(memberships).values({ userId: user!.id, orgId: row!.id }).onConflictDoNothing();
  }
  const signedIn = { userId: user!.id, login: profile.login, githubToken: token };
  const held = await db.select({ owner: repositories.owner, name: repositories.name }).from(access).innerJoin(repositories, eq(access.repoId, repositories.id)).where(eq(access.userId, user!.id));
  for (const repo of held) await checkAccess(db, github, signedIn, repo.owner, repo.name, now, true);
  return signedIn;
}

/**
 * The user's role on `owner/name`, from the record when it is under an hour old, else from GitHub.
 * Returns the repository too, created when the user can see it on GitHub.
 */
export async function checkAccess(
  db: Database,
  github: GitHubApi,
  user: SignedIn,
  owner: string,
  name: string,
  now = new Date(),
  force = false,
): Promise<{ repo: Repository; role: Role } | null> {
  const [held] = await db
    .select({ repo: repositories, role: access.role, checkedAt: access.checkedAt })
    .from(access)
    .innerJoin(repositories, eq(access.repoId, repositories.id))
    .where(and(eq(access.userId, user.userId), eq(repositories.owner, owner), eq(repositories.name, name)));
  if (held && !force && now.getTime() - held.checkedAt.getTime() < ACCESS_TTL_MS) return { repo: held.repo, role: held.role };

  const seen = await github.repository(user.githubToken, owner, name);
  const role = seen === null ? null : roleFor(seen.permissions);
  if (seen === null || role === null) {
    if (held) await db.delete(access).where(and(eq(access.userId, user.userId), eq(access.repoId, held.repo.id)));
    return null;
  }
  const repo = await upsertRepository(db, { githubId: seen.id, owner: seen.owner, name: seen.name, private: seen.private, defaultBranch: seen.defaultBranch });
  await db
    .insert(access)
    .values({ userId: user.userId, repoId: repo.id, role, checkedAt: now })
    .onConflictDoUpdate({ target: [access.userId, access.repoId], set: { role, checkedAt: now } });
  return { repo, role };
}

/** The organizations a user belongs to, by login. */
export async function organizationsOf(db: Database, userId: number): Promise<string[]> {
  const rows = await db.select({ login: organizations.login }).from(memberships).innerJoin(organizations, eq(memberships.orgId, organizations.id)).where(eq(memberships.userId, userId));
  return rows.map((row) => row.login).sort();
}

/** Repositories a user may see in the cloud, with their roles. */
export async function spacesOf(db: Database, userId: number): Promise<{ repo: Repository; role: Role }[]> {
  const rows = await db.select({ repo: repositories, role: access.role }).from(access).innerJoin(repositories, eq(access.repoId, repositories.id)).where(eq(access.userId, userId));
  return rows.sort((a, b) => `${a.repo.owner}/${a.repo.name}`.localeCompare(`${b.repo.owner}/${b.repo.name}`));
}

