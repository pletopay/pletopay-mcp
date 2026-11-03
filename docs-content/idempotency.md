---
title: "Idempotency"
description: "Retry safely. The same request, sent twice with the same key, acts once."
---

Networks fail. If a request to create a payment or send a transfer times out, you can't tell whether it happened. An **`Idempotency-Key`** makes the retry safe: Pletopay remembers the first response for that key and returns it again instead of acting twice.

```bash title=cURL
curl -X POST https://api.pletopay.com/api/v1/transfers \
  -H "Authorization: Bearer $PLETOPAY_SECRET_KEY" \
  -H "Idempotency-Key: payout-PAYOUT-2026-0001" \
  -H "Content-Type: application/json" \
  -d '{ "amount": 2500000, "currency": "NGN", "reference": "PAYOUT-2026-0001", "narration": "Vendor payout", "beneficiary": { "bank_code": "058", "account_number": "0123456789" } }'
```

## Where it applies

| Endpoints | Idempotency-Key |
|---|---|
| [Create a transfer](/reference/create-transfer), [create a refund](/reference/create-refund) | **Required** (`400 idempotency_key_required`) |
| Creating payments, customers, virtual accounts, checkout sessions, payment links, invoices, plans, subscriptions, subaccounts, split rules and webhook endpoints; updating a customer; closing a virtual account; replaying an event | Supported: send one |

Each endpoint's reference page shows whether it takes the header. Other requests ignore it.

## How it behaves

| Situation | Result |
|---|---|
| First request with a key | Processed normally; the response is stored. |
| Same key, same method, path and body | The stored response, with header `Idempotent-Replayed: true`. Nothing happens twice. |
| Same key, different body or endpoint | `422 idempotency_key_reused`. Use a new key for a new request. |
| Same key while the first request is still running | `409 idempotency_request_in_progress`. Wait and retry. |
| The first request failed with a 4xx error | The same error is replayed. Fix the request and use a new key. |
| The first request failed with a 5xx error | The key is released: retrying with it runs the request again. |

Keys are kept for **24 hours** and are scoped to your business and mode. A key is 1 to 255 printable ASCII characters (`400 idempotency_key_invalid` otherwise).

## Choosing keys

Derive the key from **your own record**, so every retry of the same operation naturally uses the same key, and a different operation never does:

- `payout-PAYOUT-2026-0001` for the transfer behind your payout record,
- `create-payment-ORDER-12345` for the payment of order 12345.

A random UUID works too, if you **store it before sending** and reuse it on retry. Generating a fresh random key for each attempt defeats the purpose.

## Timeouts

Money-moving requests are safe to retry even when processing is slow. A transfer that isn't confirmed yet stays `processing` and is never reported `failed` until its outcome is confirmed, so retrying with the same key returns that same transfer. If the service was unavailable before anything was sent, you get `503 service_unavailable` and nothing exists: retrying with the same key sends it.
