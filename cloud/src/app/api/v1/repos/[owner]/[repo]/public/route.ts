// CLD-03: POST {public} makes a public repository's maps public, or private again.
import { ownedRepository, refuse } from "../../../../../../../lib/requests";
import { services } from "../../../../../../../lib/services";
import { setPublicMaps } from "../../../../../../../lib/store";

export async function POST(request: Request, { params }: { params: Promise<{ owner: string; repo: string }> }): Promise<Response> {
  const { owner, repo } = await params;
  const owned = await ownedRepository(request, owner, repo);
  if (owned instanceof Response) return owned;
  const body = (await request.json().catch(() => ({}))) as { public?: unknown };
  if (typeof body.public !== "boolean") return refuse(400, "Send {public: true} or {public: false}.");
  return (await setPublicMaps(await services().db(), owned.repo, body.public)) ? Response.json({ status: "saved", public: body.public }) : refuse(409, "A private repository's maps stay private.");
}
