// CLD-06: POST makes a read-only link to the repository's map that lasts 1, 7 or 30 days, shown once.
import { planOfAccount } from "../../../../../../../lib/billing";
import { ownedRepository, refuse } from "../../../../../../../lib/requests";
import { services } from "../../../../../../../lib/services";
import { createShare, SHARE_DAYS, type ShareDays } from "../../../../../../../lib/shares";

export async function POST(request: Request, { params }: { params: Promise<{ owner: string; repo: string }> }): Promise<Response> {
  const { owner, repo } = await params;
  const owned = await ownedRepository(request, owner, repo);
  if (owned instanceof Response) return owned;
  const body = (await request.json().catch(() => ({}))) as { days?: unknown };
  if (!(SHARE_DAYS as readonly unknown[]).includes(body.days)) return refuse(400, "A link lasts 1, 7 or 30 days.");
  const { db: openDb, now } = services();
  const db = await openDb();
  const plan = await planOfAccount(db, owner);
  if (!plan.shareLinks) return refuse(402, `Share links come with the Team plan. ${owner} is on ${plan.label}.`);
  const share = await createShare(db, owned.repo.id, body.days as ShareDays, owned.user.userId, now());
  return Response.json({ status: "created", id: share.id, url: `/s/${share.token}`, expiresAt: share.expiresAt.toISOString() }, { status: 201 });
}
