// CLD-11: DELETE a repository's data: its maps, checks, tokens and access.
import { ownedRepository } from "../../../../../../lib/requests";
import { services } from "../../../../../../lib/services";
import { deleteRepositoryData } from "../../../../../../lib/store";

export async function DELETE(request: Request, { params }: { params: Promise<{ owner: string; repo: string }> }): Promise<Response> {
  const { owner, repo } = await params;
  const owned = await ownedRepository(request, owner, repo);
  if (owned instanceof Response) return owned;
  await deleteRepositoryData(await services().db(), owned.repo.id);
  return Response.json({ status: "deleted" });
}
