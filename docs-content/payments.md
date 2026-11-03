---
title: "Payments"
description: "Ask a customer for money by bank transfer, and know exactly when it has arrived."
---

A **payment** is a request for money by bank transfer. When you [create one](/reference/create-payment), Pletopay opens a **dynamic virtual account** just for it: a real 10-digit account number that belongs to this payment only. Your customer transfers to that account from any Nigerian bank app, and Pletopay matches the credit to the payment, confirms it, and notifies you.

## Creating a payment

```bash title=cURL
curl -X POST https://api.pletopay.com/api/v1/payments \
  -H "Authorization: Bearer $PLETOPAY_SECRET_KEY" \
  -H "Idempotency-Key: create-payment-ORDER-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5000000,
    "currency": "NGN",
    "reference": "ORDER-12345",
    "customer": { "email": "customer@example.com", "name": "Chidi Okeke" },
    "expires_in": 1800,
    "metadata": { "order_id": "12345" }
  }'
```

- `reference` is **your** identifier, typically the order id. It must be unique among your payments in the mode (`409 duplicate_reference`), and you can [look a payment up by it](/reference/get-payment-by-reference).
- `customer` links the payment to a customer: pass an existing `id`, or an `email` to create or reuse one.
- `expires_in` (seconds) or `expires_at` sets when the account stops accepting money: between 5 minutes and 7 days. Without either, your account's default applies (30 minutes unless changed).
- Show the customer everything in `bank_transfer`: account number, bank name, account name and expiry.

## Amount rules

| `amount_rule` | Behaviour |
|---|---|
| `exact` (default) | Only a transfer of exactly `amount` is accepted; **any other amount is rejected**. The customer sees the transfer fail in their app and can retry with the right amount. |
| `any` | Any amount is accepted, and `amount` may be omitted. `amount_received` tells you what arrived. |

## Payment statuses

| Status | Meaning | Event |
|---|---|---|
| `created` | Created; the account is being opened. | `payment.created` |
| `pending` | The account is open: waiting for the customer's transfer. | `payment.pending` |
| `processing` | A transfer arrived and is being applied. | — |
| `succeeded` | The money is confirmed. **Fulfil the order.** | `payment.succeeded` |
| `expired` | Nothing arrived before `expires_at`. | `payment.expired` |
| `failed` | It can no longer be paid, for example because its account couldn't be opened. | `payment.failed` |
| `under_review` | Money arrived that can't be applied automatically, for example after the payment expired. | `payment.under_review` |
| `reversed` | A succeeded payment was reversed. | `payment.reversed` |
| `partially_refunded`, `refunded` | Set when a [refund](/refunds) has actually been paid out. | `payment.partially_refunded`, `payment.refunded` |

```text title=Lifecycle
created → pending → processing → succeeded → partially_refunded → refunded
                  ↘ expired ↘ under_review → succeeded | failed
                  ↘ failed               succeeded → reversed
```

> [!IMPORTANT]
> Money is never silently dropped or silently accepted. If it arrives late or doesn't match, the payment goes to `under_review`, the money is held in your `unapplied` balance, and Pletopay's operations team either applies it to the payment (`succeeded`) or fails the payment.

## Confirming a payment

Treat a payment as paid only when **your server** sees it `succeeded`:

1. Listen for `payment.succeeded` on your [webhook endpoint](/webhooks), and
2. [retrieve the payment](/reference/get-payment) and check `status` and `amount_received` before delivering value.

Never fulfil on a redirect, a success page or a callback from the customer's device: those can be faked. The payment's state only changes when Pletopay confirms the credit.

## Fees and amounts

Each payment reports the money in kobo:

| Field | Meaning |
|---|---|
| `amount` | What you asked for (`null` with `amount_rule: any` and no amount). |
| `amount_received` | What the customer actually sent. |
| `fee` | Pletopay's fee for this payment. |
| `stamp_duty` | Stamp duty deducted, if any applied. |
| `net_amount` | What reaches your balance: `amount_received − fee − stamp_duty`. |
| `amount_refunded` | Total of successful refunds. |

The net amount lands in your `pending` balance and becomes `available` once the credit is confirmed and your account's availability delay has passed. See [Settlements and reconciliation](/settlements).

## Customers who pay you repeatedly

A dynamic account serves one payment. For customers who pay you again and again (wallet top-ups, rent, school fees) give them a [dedicated virtual account](/virtual-accounts) instead: one permanent account number, where every transfer creates a succeeded payment.
