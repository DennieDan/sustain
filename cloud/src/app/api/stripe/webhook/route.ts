// CLD-07: Stripe's webhook. An event changes a plan only when its signature checks out with the
// webhook's secret; without billing configured, the route does not exist.
import { billingConfig } from "../../../../../plans";
import { applyEvent, signatureValid } from "../../../../lib/billing";
import { refuse } from "../../../../lib/requests";
import { services } from "../../../../lib/services";

export async function POST(request: Request): Promise<Response> {
  const config = billingConfig();
  if (config === null) return refuse(404, "Billing is off on this server.");
  const payload = await request.text();
  const { db, now } = services();
  if (!signatureValid(payload, request.headers.get("stripe-signature"), config.webhookSecret, now())) return refuse(400, "The signature does not match.");
  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    return refuse(400, "The event is not JSON.");
  }
  await applyEvent(await db(), event, now());
  return Response.json({ received: true });
}
