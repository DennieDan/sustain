// CLD-02: POST creates an upload token, shown once in the response.
import { ownedRepository, refuse } from "../../../../../../../lib/requests";
import { services } from "../../../../../../../lib/services";
import { createTokenRecord } from "../../../../../../../lib/store";
import { newToken } from "../../../../../../../lib/tokens";

export async function POST(request: Request, { params }: { params: Promise<{ owner: string; repo: string }> }): Promise<Response> {
  const { owner, repo } = await params;
  const owned = await ownedRepository(request, owner, repo);
  if (owned instanceof Response) return owned;
  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
  if (name === "") return refuse(400, "Name the token.");
  const token = newToken();
  const id = await createTokenRecord(await services().db(), owned.repo.id, name, token, owned.user.userId);
  return Response.json({ status: "created", id, token }, { status: 201 });
}
