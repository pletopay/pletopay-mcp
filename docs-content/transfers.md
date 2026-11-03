---
title: "Transfers"
description: "Send money from your available balance to any Nigerian bank account."
---

A **transfer** sends money from your `available` balance to a bank account: pay vendors, staff, or your own accounts. Transfers go out over NIP, the interbank instant-payment rail.

## 1. Find the bank code

[List the supported banks](/reference/list-banks) and let the sender pick one. Use its `code` as `bank_code`.

## 2. Resolve the account name

Before sending, [look up the account name](/reference/resolve-account) and show it to whoever is sending the money, so they can confirm it's the right person:

```bash title=cURL
curl -X POST https://api.pletopay.com/api/v1/transfers/name-enquiry \
  -H "Authorization: Bearer $PLETOPAY_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "bank_code": "058", "account_number": "0123456789" }'
```

An account that can't be resolved returns `400 account_not_resolved`.

## 3. Send the transfer

```bash title=cURL
curl -X POST https://api.pletopay.com/api/v1/transfers \
  -H "Authorization: Bearer $PLETOPAY_SECRET_KEY" \
  -H "Idempotency-Key: payout-PAYOUT-2026-0001" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 2500000,
    "currency": "NGN",
    "reference": "PAYOUT-2026-0001",
    "narration": "Vendor payout September",
    "beneficiary": { "bank_code": "058", "account_number": "0123456789" }
  }'
```

- **`Idempotency-Key` is required** (`400 idempotency_key_required`). If the request times out, send it again with the same key and body: you get the original transfer, never a second one. See [Idempotency](/idempotency).
- The amount plus fees (`total_debit`) is reserved from your available balance immediately. Without enough, you get `400 insufficient_funds` with both figures in `error.details`.
- The minimum transfer is ₦10.00 (`400 amount_below_minimum`).
- `narration` appears on the recipient's statement and is limited to 50 characters.
- `reference` must be unique among your transfers in the mode (`409 duplicate_reference`). If a request times out before you get the transfer's id, [look it up by your reference](/reference/get-transfer-by-reference) instead of sending it again.

## Transfer statuses

| Status | Meaning |
|---|---|
| `pending` | Created; funds reserved. |
| `processing` | Sent for processing; outcome not yet known. |
| `succeeded` | Confirmed as received by the beneficiary. |
| `failed` | Confirmed as failed. The reserved funds are back in your available balance. |
| `reversed` | A succeeded transfer was reversed. |

> [!IMPORTANT]
> A transfer whose outcome is uncertain, for example after a timeout, stays `processing` while Pletopay checks its status. It is **never** marked `failed` until the failure is confirmed, so you can't pay twice by retrying a transfer that actually went through. Listen for `transfer.succeeded` and `transfer.failed`.

## When a transfer is refused

| Error | Why |
|---|---|
| `403 transfers_disabled` | Transfers aren't enabled for your account in this mode. |
| `403 compliance_verification_required` | Live money-out needs an approved business verification. See [Going live](/going-live). |
| `403 risk_limit_exceeded` | A limit such as the maximum single transfer or daily total; `error.details` names it. See your [risk limits](/reference/get-risk-limits). |
| `403 funds_on_hold` | An operator hold has frozen money-out for your account. |
| `503 service_unavailable` | The service is temporarily unavailable; nothing was sent. Retry later with the same key. |

Refunds and settlements aren't transfers and don't appear in the transfer list: they have their own objects. See [Refunds](/refunds) and [Settlements](/settlements).
