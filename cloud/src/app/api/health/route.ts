// CLD-10: GET answers 200 once the database answers, and 503 otherwise, for health checks.
import { sql } from "drizzle-orm";
import { services } from "../../../lib/services";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await (await services().db()).execute(sql`select 1`);
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
