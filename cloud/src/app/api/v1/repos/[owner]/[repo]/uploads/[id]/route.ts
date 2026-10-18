// CLD-11: DELETE one map or check.
import { ownedRepository, refuse } from "../../../../../../../../lib/requests";
import { services } from "../../../../../../../../lib/services";
import { deleteUpload } from "../../../../../../../../lib/store";

export async function DELETE(request: Request, { params }: { params: Promise<{ owner: string; repo: string; id: string }> }): Promise<Response> {
  const { owner, repo, id } = await params;
  const owned = await ownedRepository(request, owner, repo);
  if (owned instanceof Response) return owned;
  return (await deleteUpload(await services().db(), owned.repo.id, Number(id))) ? Response.json({ status: "deleted" }) : refuse(404, "No such upload.");
}
