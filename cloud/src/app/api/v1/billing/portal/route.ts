// CLD-07: POST {account} answers a Stripe Customer Portal page for an account that has paid.
import { portalUrl, storedPlan } from "../../../../../lib/billing";
import { billedAccount } from "../../../../../lib/billingRequests";
import { refuse } from "../../../../../lib/requests";
import { services } from "../../../../../lib/services";

export async function POST(request: Request): Promise<Response> {
  const billed = await billedAccount(request);
  if (billed instanceof Response) return billed;
  const customer = (await storedPlan(await services().db(), billed.account))?.stripeCustomer;
  if (!customer) return refuse(404, "This account has no billing to manage yet.");
  try {
    return Response.json({ url: await portalUrl(billed.config, customer, billed.site) });
  } catch (error) {
    return refuse(502, `Stripe could not open the portal: ${(error as Error).message}`);
  }
}
