// CLD-06: DELETE revokes a share link at once.
import { ownedRepository, refuse } from "../../../../../../../../lib/requests";
import { services } from "../../../../../../../../lib/services";
import { revokeShare } from "../../../../../../../../lib/shares";

export async function DELETE(request: Request, { params }: { params: Promise<{ owner: string; repo: string; id: string }> }): Promise<Response> {
  const { owner, repo, id } = await params;
  const owned = await ownedRepository(request, owner, repo);
  if (owned instanceof Response) return owned;
  const { db, now } = services();
  if (!(await revokeShare(await db(), owned.repo.id, Number(id), now()))) return refuse(404, "No such link.");
  return Response.json({ status: "revoked" });
}
