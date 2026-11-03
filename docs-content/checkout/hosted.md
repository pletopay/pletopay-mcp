---
title: "Hosted checkout"
description: "Send customers to a Pletopay-hosted page that shows the transfer details and confirms the payment."
---

The simplest integration: after [creating a session](/checkout#1-create-a-checkout-session) on your server, send the customer to its `url`.

```html title=HTML
<!-- After your server created the session -->
<a href="https://checkout.pletopay.com/c/SESSION_TOKEN">Pay now</a>
```

```javascript title=Express
app.post("/pay", async (req, res) => {
  const session = await createCheckoutSession(req.body.orderId); // POST /api/v1/checkout/sessions
  res.redirect(302, session.url);
});
```

`SESSION_TOKEN` stands for the session's `token`; `url` is the full link. The link works on any device, with nothing of yours to load.

## What the customer sees

1. Your trading name (and brand colour and support contact, if you [set them](/checkout/customization)), the amount and the description.
2. The account to transfer to: bank name, account number with a copy button, account name, the exact amount and a countdown to the account's expiry.
3. A live status: "Waiting for your transfer", then "Transfer received, confirming…", then "Payment received". The page polls Pletopay; the customer never has to refresh. An "I've sent the money" button switches to a checking screen (the details stay one click away) and, if the transfer takes more than a minute or two, reassures the customer that it is still confirmed when it lands.
4. On success, an animated check mark, "Return to *your business*", and an automatic redirect to `success_url` after a few seconds. A `cancel_url`, when given, is offered while the transfer is still pending.

The page never shows your metadata, references, ids or customer details, and it is served from Pletopay's checkout origin with its own strict Content Security Policy.

## `success_url` and `cancel_url`

- Both are optional and must be `http(s)` URLs. Pletopay only ever redirects to the URLs you supplied when creating the session.
- `success_url` is used only once the session is `complete`. A customer can bookmark it, so treat arriving there as a hint, not a confirmation.
- `cancel_url` is a way back for a customer who changes their mind. Leaving the page, or returning to you, never cancels a transfer the customer already sent: if the money arrives later it is still matched, the session completes and you receive `checkout.session.completed`.

## Expired, failed and late payments

- When the session or its account expires, the page says so and offers the support contact. Money that arrives after expiry is matched and reviewed; nothing is lost.
- If the account could not be set up, the page says no money has moved and asks the customer to start again.
- A transfer of a different amount can't be matched automatically and goes to review (see [Payments](/payments#payment-statuses)).

## Invoices

Invoices have their own hosted page (`hosted_invoice_url`) that lists the items and totals and starts a checkout session when the customer pays. See [Invoices and subscriptions](/invoices-and-subscriptions).
