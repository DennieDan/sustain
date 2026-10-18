// A stand-in for Stripe in the [web] tests: Checkout sessions whose page sends the app a signed
// `checkout.session.completed` webhook and returns to the success page, and Customer Portal sessions.
import { createHmac } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 3212);
const secret = process.argv[3] ?? "whsec_web";
const sessions = new Map();

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readForm(request) {
  let text = "";
  for await (const chunk of request) text += chunk;
  return new URLSearchParams(text);
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/health") {
    json(response, 200, { ok: true });
  } else if (request.method === "POST" && url.pathname === "/v1/checkout/sessions") {
    const form = await readForm(request);
    const id = `cs_test_${sessions.size + 1}`;
    sessions.set(id, { account: form.get("metadata[account]"), success: form.get("success_url") });
    json(response, 200, { id, url: `http://127.0.0.1:${port}/checkout/${id}` });
  } else if (url.pathname.startsWith("/checkout/")) {
    const session = sessions.get(url.pathname.slice("/checkout/".length));
    if (!session) return json(response, 404, { error: { message: "No such session" } });
    const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: { client_reference_id: session.account, metadata: { account: session.account }, customer: "cus_test", subscription: "sub_test" } } });
    const time = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", secret).update(`${time}.${payload}`).digest("hex");
    await fetch(new URL("/api/stripe/webhook", session.success), { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${time},v1=${signature}` }, body: payload });
    response.writeHead(302, { location: session.success });
    response.end();
  } else if (request.method === "POST" && url.pathname === "/v1/billing_portal/sessions") {
    json(response, 200, { id: "bps_test", url: `http://127.0.0.1:${port}/portal` });
  } else if (url.pathname === "/portal") {
    response.writeHead(200, { "content-type": "text/html" });
    response.end("<h1>Billing portal</h1>");
  } else {
    json(response, 404, { error: { message: "Not found" } });
  }
}).listen(port, "127.0.0.1");
