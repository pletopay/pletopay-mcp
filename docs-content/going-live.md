---
title: "Going live"
description: "The checklist before you switch from your test key to your live key."
---

Going live means swapping `sk_test_…` for `sk_live_…` on your production servers. Before you do, work through this list.

## Business verification

First, verify your email address with the link we sent when you signed up (you can resend it from the banner at the top of the dashboard). Until you do, test mode works but you can't change anything in live mode, submit your business verification or invite your team.

Complete **Settings → Verification** in the dashboard. **Live mode is available only once your business is approved**: until then, requests with your live key return `403 compliance_verification_required`, live mode is locked in the dashboard, and nothing can be collected or paid out. Test mode never needs approval, so build and test first.

Set your **settlement account** under **Settings → Settlements**, the bank account your balance is paid out to.

## Integration checklist

- [ ] Your server, not the customer's browser or app, creates payments and holds the key.
- [ ] You fulfil orders only after `payment.succeeded`, or after [retrieving the payment](/reference/get-payment) and seeing `succeeded`. Never on a redirect or a client callback.
- [ ] Each order is fulfilled once, keyed by your `reference`, even if you receive the same event twice.
- [ ] Your webhook endpoint [verifies signatures](/webhooks/signatures), answers 2xx within 10 seconds, and is registered **with the live key**, since endpoints belong to one mode.
- [ ] Every create request sends an [`Idempotency-Key`](/idempotency), and retries after a timeout reuse it.
- [ ] You handle `under_review`, `expired` and `failed` payments, not only `succeeded`. See [Payments](/payments).
- [ ] You handle errors by `code`, not by message, and log `request_id`. See [Errors](/errors).
- [ ] You back off on `429` using `Retry-After`. See [Rate limits](/rate-limits).
- [ ] The live key is stored as a secret, never in code or logs.
- [ ] Optional but recommended: the live key is [restricted to your servers' outgoing IP addresses](/authentication#restricting-your-secret-key-by-ip).
- [ ] If you use the [checkout popup](/checkout/popup): your production site is in **Allowed origins**, your pages load `pk_live_…`, and your CSP allows `https://checkout.pletopay.com` in `script-src` and `frame-src`. See [Checkout security](/checkout/security).

## Switch keys

Once you're approved, an owner or admin reveals the live key under **Settings → Developers → API keys** (switch the dashboard to live mode; revealing it needs two-factor authentication). Replace the test key with it (and `pk_test_…` with `pk_live_…` on your site if you use the popup), register your live webhook endpoints, and make a small real payment to yourself to confirm the path end to end.
