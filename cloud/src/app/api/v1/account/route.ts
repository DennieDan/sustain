// CLD-11: DELETE the signed-in account: the user, their access and memberships, and every repository
// space the account owns, with its uploads, checks and tokens.
import { signedIn } from "../../../../lib/requests";
import { services } from "../../../../lib/services";
import { deleteAccount } from "../../../../lib/store";

export async function DELETE(request: Request): Promise<Response> {
  const user = await signedIn(request);
  if (user instanceof Response) return user;
  await deleteAccount(await services().db(), user.userId, user.login);
  return Response.json({ status: "deleted" });
}
