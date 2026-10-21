---
status: accepted
date: 2026-10-19
decision-makers: implementer
---

# Plans are enforced on the server and billed through Stripe's API

## Context and Problem Statement

Spec v0.3 CLD-07 adds Free, Team and Enterprise plans, sold through Stripe Checkout and managed in the Customer Portal, with signature-verified webhooks setting the plan. Self-hosting runs without Stripe. How are plans stored and enforced, and how does the cloud reach Stripe without trusting a forged webhook?

## Considered Options

* Plans per account in the database, set only by verified webhooks, and Stripe reached through its REST API with `fetch`
* Stripe's Node SDK
* Plans checked in the browser

## Decision Outcome

Chosen option: "Plans per account in the database, set only by verified webhooks, and Stripe reached through its REST API with `fetch`", because the server alone decides what an account may do, and the cloud gains no dependency.

* An account is the GitHub login that owns repositories. `account_plans` keeps its plan, Stripe customer and subscription ids and seat count. An account without a row is on Free.
* `cloud/plans.ts` defines the plans. Free keeps maps of one private repository and 30 days of history; Team adds any number of private repositories, all history, pull request pages, the dashboard and share links; Enterprise is the self-hosted plan with everything.
* The server enforces each limit where it applies: the upload API refuses another private repository with 402, the share-link API refuses with 402, the pull request page and the dashboard say the feature comes with Team, and the map page shows the plan's history only.
* Checkout and portal sessions are created with form-encoded POSTs to Stripe's API with the secret key. Only an owner of one of the account's repositories, from this site, may start one.
* The webhook accepts an event only when its `Stripe-Signature` header carries an HMAC-SHA256 of `<time>.<body>` with the webhook secret, compared in constant time, and the time is within 5 minutes. `checkout.session.completed` sets Team; a subscription update sets Team while active or trialing and Free otherwise; a deleted subscription sets Free.
* Without `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `STRIPE_TEAM_PRICE`, billing is off: the webhook and billing routes answer 404, and every account is Enterprise.

### Consequences

* Good, because a forged or replayed webhook cannot change a plan, and the browser decides nothing.
* Bad, because Stripe's API is called by hand, so a change to it needs a change here.

### Confirmation

`cloud/test/unit/billing.test.ts` checks signed, wrong, missing and old signatures, the subscription states and each limit. `cloud/test/web/cld07-billing.spec.ts` upgrades an account through a mocked Checkout.
