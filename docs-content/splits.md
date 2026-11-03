---
title: "Subaccounts and splits"
description: "For marketplaces and platforms. Give sellers their own balance and payout account, and share each payment with them."
---

A **subaccount** is a seller, vendor or branch on your platform. It has its own balance and its own payout bank account. A **split rule** says how each payment's money is shared between you and your subaccounts.

## 1. Create subaccounts

```bash title=cURL
curl -X POST https://api.pletopay.com/api/v1/subaccounts \
  -H "Authorization: Bearer $PLETOPAY_SECRET_KEY" \
  -H "Idempotency-Key: subaccount-v_204" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mama Ngozi Kitchen",
    "bank_code": "058",
    "account_number": "0123456789",
    "metadata": { "vendor_id": "v_204" }
  }'
```

The payout account is verified by name enquiry (`400 account_not_resolved` if it can't be resolved). In live mode, a new or changed payout account is used only after a cooldown (`settlement_account.usable_from`), to protect against account takeover.

## 2. Create a split rule

Splits share a payment's **net amount**, after fees. Whatever isn't allocated stays with you.

```json title=Split rule
{
  "name": "Marketplace 80/20",
  "type": "percentage",
  "allocations": [{ "subaccount": "sub_01J8Z5X7Q9K2M4N6P8R0S2T4V9", "share": 8000 }]
}
```

| `type` | `share` means |
|---|---|
| `percentage` | Basis points of the net amount (8000 = 80%), rounded down. |
| `flat` | Kobo, capped at what's left. |

## 3. Use it

Pass the rule id as `split` when you create a payment, checkout session, payment link, invoice or subscription. The rule is frozen onto each payment, so editing or deactivating a rule later never changes existing payments. The payment's `split_amount` shows how much went to subaccounts.

## Paying subaccounts out

Subaccount shares follow the same path as your money: `pending`, then `available`. They're settled to each subaccount's payout account on your settlement schedule, as separate settlements with `subaccount` set. See a subaccount's [balances](/reference/get-subaccount-balance) at any time.

> [!NOTE]
> Refunds of a split payment come entirely from your balance; subaccount shares aren't reclaimed.
