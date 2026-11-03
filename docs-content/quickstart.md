---
title: "Quickstart"
description: "Create a test payment, pay it with a simulated bank transfer, and confirm it on your server. About ten minutes."
---

You'll create a payment, pay it in the sandbox, and see it confirmed. Everything here runs in **test mode**, so no real money moves.

## 1. Get your test secret key

Sign up for Pletopay and open **Settings → Developers → API keys** in the dashboard. Every business has one test key (`sk_test_…`) and one live key (`sk_live_…`). Reveal the test key and store it in an environment variable on your server:

```bash title=Terminal
export PLETOPAY_SECRET_KEY="sk_test_…"
```

> [!WARNING]
> The secret key acts as your business. Keep it on your server: never put it in a mobile app, browser code or a repository.

## 2. Create a payment

A payment asks your customer for an exact amount by bank transfer. Amounts are in **kobo**: ₦50,000.00 is `5000000`.

```bash tab=cURL
curl -X POST https://api.pletopay.com/api/v1/payments \
  -H "Authorization: Bearer $PLETOPAY_SECRET_KEY" \
  -H "Idempotency-Key: create-payment-ORDER-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5000000,
    "currency": "NGN",
    "reference": "ORDER-12345",
    "customer": { "email": "customer@example.com" }
  }'
```

```javascript tab=Node.js
const response = await fetch('https://api.pletopay.com/api/v1/payments', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.PLETOPAY_SECRET_KEY}`,
    'Idempotency-Key': 'create-payment-ORDER-12345',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    amount: 5000000,
    currency: 'NGN',
    reference: 'ORDER-12345',
    customer: { email: 'customer@example.com' },
  }),
});
const { data: payment } = await response.json();
```

```python tab=Python
import os

import requests

response = requests.post(
    "https://api.pletopay.com/api/v1/payments",
    headers={
        "Authorization": f"Bearer {os.environ['PLETOPAY_SECRET_KEY']}",
        "Idempotency-Key": "create-payment-ORDER-12345",
    },
    json={
        "amount": 5000000,
        "currency": "NGN",
        "reference": "ORDER-12345",
        "customer": {"email": "customer@example.com"},
    },
)
payment = response.json()["data"]
```

Every response is wrapped in an envelope: `status`, a short `message`, and the result in `data`. Here `data` is a `pending` payment with `bank_transfer` details:

```json title=Response
{
  "status": true,
  "message": "Payment created",
  "data": {
    "id": "pay_01J8Z5X7Q9K2M4N6P8R0S2T4V6",
    "object": "payment",
    "status": "pending",
    "amount": 5000000,
    "reference": "ORDER-12345",
    "bank_transfer": {
      "account_number": "9000002140",
      "account_name": "Ada Stores Ltd",
      "bank_name": "Example Bank",
      "bank_code": "000000",
      "expires_at": "2026-09-24T18:30:00.000Z"
    }
  }
}
```

## 3. Show the transfer details

Show your customer `data.bank_transfer.account_number`, `bank_name` and the amount (₦50,000.00), and tell them when it expires. The account is single-use: it exists only for this payment and accepts only this amount.

Prefer not to build that screen? Create a [checkout session](/checkout) instead and redirect the customer to Pletopay's hosted page.

## 4. Pay it in the sandbox

In test mode no one can pay with a real bank app, so simulate the customer's transfer with the account number from step 2:

```bash title=cURL
curl -X POST https://api.pletopay.com/api/v1/sandbox/simulate-transfer \
  -H "Authorization: Bearer $PLETOPAY_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "account_number": "9000002140", "amount": 5000000 }'
```

The sandbox sends the transfer, and it goes through the same pipeline as live money. You can also do this from **Settings → Developers → Sandbox** in the dashboard.

## 5. Get notified

Register a webhook endpoint so Pletopay can tell your server when the payment succeeds:

```bash title=cURL
curl -X POST https://api.pletopay.com/api/v1/webhook-endpoints \
  -H "Authorization: Bearer $PLETOPAY_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "url": "https://example.com/webhooks/pletopay", "enabled_events": ["payment.succeeded"] }'
```

Store the `secret` (`whsec_…`) in the response: it's shown only once and you need it to [verify signatures](/webhooks/signatures). Your endpoint then receives a `payment.succeeded` event. See [Receiving webhooks](/webhooks) for how to handle it.

## 6. Confirm before you fulfil

Before you deliver the order, retrieve the payment from your server and check its state:

```bash title=cURL
curl https://api.pletopay.com/api/v1/payments/pay_01J8Z5X7Q9K2M4N6P8R0S2T4V6 \
  -H "Authorization: Bearer $PLETOPAY_SECRET_KEY"
```

Fulfil only when `data.status` is `succeeded`, and fulfil each `reference` once.

## Next steps

- [Payments](/payments): statuses, expiry, amount rules and what happens when a customer sends the wrong amount.
- [Test and live mode](/test-and-live): how the two modes are separated.
- [Going live](/going-live): the checklist before you switch to your live key.
