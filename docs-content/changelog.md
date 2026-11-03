---
title: "Changelog"
description: "Changes to the Pletopay API, newest first."
---

Changes that don't need a new dated version (new endpoints, new fields, new events and new error codes) are listed here as they ship. See [Versioning](/versioning) for what counts as breaking.

## 2026-10-28

**Added: restrict secret keys by IP**
- In **Settings → Developers → API keys** you can list the IP addresses and CIDR ranges allowed to use each mode's secret key. Once a mode's list has entries, requests with that key from any other address get `403 ip_address_not_allowed`. Lists are empty by default, so nothing changes until you add an address. See [Authentication](/authentication#restricting-your-secret-key-by-ip).

## 2026-10-19

**Changed: new dashboard accounts verify their email**
- Signing up sends a verification link. Until you open it, test mode works as before, but you can't change anything in live mode, submit your business verification or invite your team. Accepting a team invitation verifies your email too. Your API keys and existing accounts are not affected. See [Going live](/going-live).

## 2026-10-18

**Added: the checkout popup and publishable keys**
- A browser SDK, `https://checkout.pletopay.com/v1/pletopay.js`, opens a checkout session in a popup over your own site. See [The popup](/checkout/popup) and the [SDK changelog](/checkout/sdk-changelog).
- Every business has a **publishable key** per mode (`pk_test_…` / `pk_live_…`) for the popup. It identifies your integration and authorizes nothing: sent as a bearer token it returns `401 publishable_key_not_allowed`. See [Authentication](/authentication#publishable-keys).
- The [checkout session](/reference/schemas/CheckoutSession) object carries `token`, the value the SDK opens; `url` is unchanged.
- **Checkout settings** in the dashboard (**Settings → Developers → Checkout integration**): brand colour, support contact and the origins allowed to open the popup. See [Customising checkout](/checkout/customization).
- Hosted checkout, payment-link and invoice pages moved to `https://checkout.pletopay.com`. Old `api.pletopay.com/c/…`, `/l/…` and `/i/…` links redirect there.

**Fixed: documented expiry**
- Checkout sessions and payments expire after at most 3 hours (a one-time account can't live longer), not 7 days as previously documented.

## 2026-09-26

**Added: retrieve resources by your reference**
- [`GET /api/v1/virtual-accounts/reference/{reference}`](/reference/get-virtual-account-by-reference) (dynamic accounts)
- [`GET /api/v1/checkout/sessions/reference/{reference}`](/reference/get-checkout-session-by-reference)
- [`GET /api/v1/transfers/reference/{reference}`](/reference/get-transfer-by-reference)
- [`GET /api/v1/refunds/reference/{reference}`](/reference/get-refund-by-reference)

These join [`GET /api/v1/payments/reference/{reference}`](/reference/get-payment-by-reference). Each needs the same permission as retrieving the resource by id and returns `404 resource_missing` for an unknown reference.

**Changed: checkout session references are unique**
- A checkout session's `reference`, when given, must now be unique among your sessions in the mode, like payment, transfer and refund references. Reusing one returns `409 duplicate_reference`. Sessions created without a reference are unaffected.

## 2026-09-25

**Changed: every response uses one envelope** (dated version `2026-09-25`)
- Success: `{ "status": true, "message": "…", "data": … }`. Lists put the array in `data` and paging in `meta` (`has_more`, `next_cursor`, `url`); pass `next_cursor` as `starting_after`.
- Errors: `{ "status": false, "message": "…", "error": { "type", "code", "param", "details" }, "request_id": "req_…" }`. `message` and `request_id` moved to the top level.
- Actions that returned no body now return `200` with `"data": null`.
- This was changed before launch and applies to every version. Webhook event payloads and file downloads are unchanged.

**Changed: live mode needs an approved business**
- Live keys work only once your business verification is approved; before that they return `403 compliance_verification_required`. Test mode is unaffected.
- Revealing or regenerating the live key needs owner- or admin-level access and a two-factor code.

**Added**
- Refunds always return to the original sender when the sender's account is known (`400 refund_destination_mismatch` for a different destination).
- Money-out is refused during an operator hold (`403 funds_on_hold`).
- Limits: up to 16 webhook endpoints per mode (`400 webhook_endpoint_limit_reached`), at most two reports generating at once (`429 reports_in_progress`), and rate limits on webhook test sends and replays.
- Metadata updates can delete a key by setting it to `""`; merged metadata is limited to 50 keys (`400 metadata_too_large`).
- A request body in an unsupported charset or encoding returns `400 unsupported_body`.

**Changed**
- A refund created without a `reference` takes one derived from its `Idempotency-Key`, so a retried request can't create a second refund.
- Live name enquiries need an approved business verification and count toward the money-movement rate limit.
- Webhook delivery `error` values are short codes such as `connection_failed`.

## 2026-09-24

**Added**
- `v1` of the API and the first dated version, `2026-09-24`: payments by bank transfer, dedicated and dynamic virtual accounts, customers, hosted checkout, payment links, invoices, plans and subscriptions, transfers, refunds, settlements, subaccounts and split rules, balances and ledger transactions, reports and statements, risk limits and events, signed webhooks, and the test-mode transfer simulator.
