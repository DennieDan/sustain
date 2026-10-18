// Session-authenticated changes (CLD-11): same-site requests from a signed-in owner only.
import { checkAccess, type SignedIn } from "./access";
import { services } from "./services";
import type { Repository } from "./store";

export function refuse(status: number, message: string): Response {
  return Response.json({ status: "refused", message }, { status });
}

/**
 * Whether the request comes from this site: its Origin (or Referer) names the host it was sent to,
 * from the Host header or, behind a proxy, X-Forwarded-Host.
 */
export function sameSite(request: Request): boolean {
  const from = request.headers.get("origin") ?? request.headers.get("referer");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  if (from === null) return false;
  try {
    return new URL(from).host === host;
  } catch {
    return false;
  }
}

/** The signed-in user, or a refusal. */
export async function signedIn(request: Request): Promise<SignedIn | Response> {
  if (!sameSite(request)) return refuse(403, "Changes must come from this site.");
  const user = await services().user();
  return user ?? refuse(401, "Sign in first.");
}

/** The repository when the signed-in user owns it on GitHub, or a refusal. */
export async function ownedRepository(request: Request, owner: string, name: string): Promise<{ user: SignedIn; repo: Repository } | Response> {
  const user = await signedIn(request);
  if (user instanceof Response) return user;
  const { db, github, now } = services();
  const access = await checkAccess(await db(), github(), user, owner, name, now());
  if (access === null || access.role !== "owner") return refuse(403, "Only the repository's owners can do that.");
  return { user, repo: access.repo };
}
