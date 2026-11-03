---
title: "Testing checkout"
description: "Pay a test checkout session end to end in the sandbox, hosted or in the popup."
---

Everything works the same in test mode, with no real money. You need your test secret key (for your server) and, for the popup, your test publishable key.

## 1. Create a test session

On your server, with `sk_test_…`:

```bash title=cURL
curl -X POST https://api.pletopay.com/api/v1/checkout/sessions \
  -H "Authorization: Bearer $PLETOPAY_SECRET_KEY" \
  -H "Idempotency-Key: test-checkout-1" \
  -H "Content-Type: application/json" \
  -d '{ "amount": 150000, "currency": "NGN", "description": "Test order" }'
```

## 2. Open it

- **Hosted:** open `data.url` in a browser.
- **Popup:** on your page, call `pletopay.checkout({ session: data.token })` with your `pk_test_…` key. On `localhost` nothing else is needed; the dashboard's **Checkout integration** page also previews the popup without a session.

Either way the customer view shows an account number and "Waiting for your transfer". The session now has a payment and a one-time account.

## 3. Pay it

Simulate the customer's transfer with [`POST /api/v1/sandbox/simulate-transfer`](/reference/simulate-transfer), using the account number shown and the exact amount:

```bash title=cURL
curl -X POST https://api.pletopay.com/api/v1/sandbox/simulate-transfer \
  -H "Authorization: Bearer $PLETOPAY_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "account_number": "9000002140", "amount": 150000 }'
```

Or, in the dashboard, **Settings → Developers → Sandbox**: pick the account and send the amount.

Within a few seconds the page or popup turns green, `onSuccess` runs, the session is `complete` and your webhook endpoint receives `checkout.session.completed`.

## 4. Check the things that matter

- **Verification:** retrieve the session with your secret key and confirm `status` is `complete` before you fulfil. Do this in your code, not just by hand.
- **Closing the popup** before paying, then simulating the transfer: the session still completes and the webhook still arrives. Closing never cancels a payment.
- **A wrong amount:** simulate a different amount into the same account. The sandbox refuses it (`400 simulation_rejected`), just as a real transfer of the wrong amount is refused.
- **Expiry:** create a session with `expires_in: 300`, open it, and wait. The page shows "This payment session has expired" and you receive `checkout.session.expired`.
- **Live key, test session:** opening a test session with `pk_live_…` fails with `livemode_mismatch`. Keep the two keys together in your configuration.
