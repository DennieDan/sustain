// CLD-07: POST {account} answers a Stripe Checkout page that subscribes the account to Team.
import { checkoutUrl, seatsOf } from "../../../../../lib/billing";
import { billedAccount } from "../../../../../lib/billingRequests";
import { refuse } from "../../../../../lib/requests";
import { services } from "../../../../../lib/services";

export async function POST(request: Request): Promise<Response> {
  const billed = await billedAccount(request);
  if (billed instanceof Response) return billed;
  const seats = await seatsOf(await services().db(), billed.account);
  try {
    return Response.json({ url: await checkoutUrl(billed.config, billed.account, seats, billed.site) });
  } catch (error) {
    return refuse(502, `Stripe could not start the checkout: ${(error as Error).message}`);
  }
}
