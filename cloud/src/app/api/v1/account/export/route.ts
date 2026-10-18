// CLD-13: GET downloads everything Sustain Cloud holds for the signed-in user as one JSON file.
import { exportData } from "../../../../../lib/exportData";
import { refuse } from "../../../../../lib/requests";
import { services } from "../../../../../lib/services";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const { db, now, user: currentUser } = services();
  const user = await currentUser();
  if (user === null) return refuse(401, "Sign in first.");
  const data = await exportData(await db(), user.userId, now());
  return new Response(`${JSON.stringify(data, null, 2)}\n`, {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="sustain-${user.login}.json"`, "cache-control": "no-store" },
  });
}
