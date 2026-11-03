---
title: "Refunds"
description: "Return money for a payment by bank transfer, in full or in part."
---

A **refund** returns money for a [payment](/payments) by bank transfer from your available balance. It's linked to the original payment and never changes the payment until the money has actually been paid out.

```bash title=cURL
curl -X POST https://api.pletopay.com/api/v1/refunds \
  -H "Authorization: Bearer $PLETOPAY_SECRET_KEY" \
  -H "Idempotency-Key: refund-ORDER-12345-1" \
  -H "Content-Type: application/json" \
  -d '{
    "payment": "pay_01J8Z5X7Q9K2M4N6P8R0S2T4V6",
    "amount": 1000000,
    "reason": "Customer returned the item"
  }'
```

- **`Idempotency-Key` is required.** Without your own `reference`, the refund's reference is derived from the key, so a retried request can never create a second refund. Either way the refund's `reference` is unique in the mode, and you can [look the refund up by it](/reference/get-refund-by-reference).
- Leave out `amount` to refund everything still refundable. Partial refunds are fine; you can make several.
- Only `succeeded` and `partially_refunded` payments can be refunded (`409 payment_not_refundable`). You can't refund more than what's left (`400 amount_exceeds_refundable`, with `error.details.refundable`).
- The amount plus bank transfer costs are reserved from your available balance (`400 insufficient_funds` otherwise).

## Where the money goes

| The sender's account is known | What to send |
|---|---|
| Yes (the usual case) | Omit `destination`: the refund goes back to the account that paid. A different `destination` is refused (`400 refund_destination_mismatch`). |
| No | Pass `destination` with `bank_code` and `account_number` (`400 refund_destination_required` otherwise). It's verified by name enquiry. In live mode this needs transfers enabled for your account (`403 transfers_disabled`). |

> [!NOTE]
> In test mode, the refund goes back to the simulated sender: the default test sender, or the `sender_account_number` you passed when you [simulated the transfer](/test-and-live#simulating-a-customers-transfer). Use a [test value](/test-and-live#test-values) there to test a failed refund.

## Statuses and the payment

`pending` → `processing` → `succeeded` or `failed`. When a refund **succeeds**, and only then, the payment becomes `partially_refunded` (refunded less than it received) or `refunded` (fully), and `amount_refunded` goes up. A failed refund releases its reserved funds and leaves the payment unchanged.

Events: `refund.created`, `refund.succeeded`, `refund.failed`, and `payment.partially_refunded` / `payment.refunded` on the payment.

If a payment was split with subaccounts, your balance bears the whole refund; subaccount shares aren't reclaimed.
