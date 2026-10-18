// Who may open a repository's pages (CLD-01, CLD-03): anyone when its maps are public, otherwise a
// signed-in user with GitHub access. A space that is neither is reported as not found.
import { currentUser } from "../auth";
import { checkAccess, type Role, type SignedIn } from "./access";
import { services } from "./services";
import { findRepository, type Repository } from "./store";

export type Space = { repo: Repository; user: SignedIn | null; role: Role | null };

export async function openSpace(owner: string, name: string): Promise<Space | "sign-in" | "not-found"> {
  const { db: openDb, github, now } = services();
  const db = await openDb();
  const repo = await findRepository(db, owner, name);
  const user = await currentUser();
  const role = user === null ? null : ((await checkAccess(db, github(), user, owner, name, now()))?.role ?? null);
  if (repo && repo.publicMaps && !repo.private) return { repo, user, role };
  if (user === null) return "sign-in";
  if (role === null) return "not-found";
  return { repo: (await findRepository(db, owner, name))!, user, role };
}
