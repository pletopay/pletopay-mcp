---
title: "Virtual accounts"
description: "Real bank account numbers that route transfers into your Pletopay balance."
---

A **virtual account** is a real 10-digit account number (NUBAN) provided through Pletopay. Money sent to it from any Nigerian bank is credited to your Pletopay balance and matched to your customer or payment. There are two kinds.

| | Dynamic | Dedicated |
|---|---|---|
| Belongs to | One payment | One customer, permanently |
| Amount | Usually exact | Any amount |
| Lifetime | Expires with its payment | Until you close it |
| Each transfer creates | Completes the payment | A new `succeeded` payment (`source: dedicated_virtual_account`) |
| Use it for | Checkout, orders, invoices | Wallet top-ups, repeat billing, collections |

The name payers see in their banking app is based on your business name.

## Dynamic accounts

You don't usually create dynamic accounts directly: [creating a payment](/reference/create-payment) opens one and returns it in `bank_transfer`. `POST /api/v1/virtual-accounts` with `type: dynamic` does the same thing and returns the account instead of the payment. Its `reference` is the payment's, so it's unique in the mode and you can [look the account up by it](/reference/get-virtual-account-by-reference). Dedicated accounts have no reference.

## Dedicated accounts

Create a [customer](/reference/create-customer) first, then a dedicated account for them:

```bash title=cURL
curl -X POST https://api.pletopay.com/api/v1/virtual-accounts \
  -H "Authorization: Bearer $PLETOPAY_SECRET_KEY" \
  -H "Idempotency-Key: dedicated-account-cus_01J8Z5X7Q9K2M4N6P8R0S2T4V7" \
  -H "Content-Type: application/json" \
  -d '{ "type": "dedicated", "customer_id": "cus_01J8Z5X7Q9K2M4N6P8R0S2T4V7" }'
```

- Give the customer `account_number`, `account_name` and `bank_name`. They can save it as a beneficiary.
- Every transfer they make creates a `succeeded` payment for the amount received, so listen for `payment.succeeded` and use the payment's `customer` to credit the right person.
- A customer can have a limited number of dedicated accounts (`409 dedicated_account_limit`).
- If the account can't be opened you get `502 virtual_account_creation_failed`; if the service is temporarily unavailable, `503 service_unavailable`. In both cases nothing is created.

## Account statuses

`requested` (being opened) → `active` → `closed`. Dynamic accounts may also end `expired` or `consumed`, and an account can be `blocked` or `failed`. Changes emit `virtual_account.created`, `virtual_account.updated` and `virtual_account.closed`.

## Closing a dedicated account

[Close it](/reference/close-virtual-account) with a reason when you no longer want to receive money through it. The account is closed first, so it stops receiving money for you. Dynamic accounts close with their payment and can't be closed this way.
