---
title: "Checkout: hosted pages and the popup"
description: "Let customers pay by bank transfer without building the payment screen: send them to a Pletopay-hosted page, or open the Pletopay popup over your own site."
---

If you'd rather not build the "transfer to this account" screen yourself, Pletopay can show it for you. Either way your server creates a **checkout session** for the order, and Pletopay shows the customer the account details, waits for the transfer and tells you when it arrives.

| | Hosted checkout | Popup on your website |
|---|---|---|
| What the customer sees | A Pletopay page at `checkout.pletopay.com/c/…` | A Pletopay popup over your page; they never leave your site |
| What you integrate | A redirect (or a link) to the session's `url` | A `<script>` tag, your publishable key and the session's `token` |
| Sessions are created | On your server with your secret key | On your server with your secret key |
| When it's done | The customer is sent to your `success_url` | Your `onSuccess` callback runs |
| Branding | Your trading name, brand colour and support contact | The same |
| Best for | The simplest integration, emails, chat, payment links | Carts and checkouts that should stay on your domain |

Both share the same session object, the same webhook (`checkout.session.completed`) and the same rule: **confirm on your server before you fulfil**.

## 1. Create a checkout session

Your server [creates the session](/reference/create-checkout-session) with your secret key. The amount is fixed here; nothing in the browser can change it.

```bash tab=cURL
curl -X POST https://api.pletopay.com/api/v1/checkout/sessions \
  -H "Authorization: Bearer $PLETOPAY_SECRET_KEY" \
  -H "Idempotency-Key: checkout-ORDER-12345" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 5000000,
    "currency": "NGN",
    "reference": "ORDER-12345",
    "description": "Order #12345",
    "customer_email": "customer@example.com",
    "success_url": "https://example.com/orders/12345/thanks",
    "cancel_url": "https://example.com/cart"
  }'
```

```javascript tab=Node.js
const res = await fetch("https://api.pletopay.com/api/v1/checkout/sessions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.PLETOPAY_SECRET_KEY}`,
    "Idempotency-Key": "checkout-ORDER-12345",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    amount: 5000000, // kobo: ₦50,000.00
    currency: "NGN",
    reference: "ORDER-12345",
    description: "Order #12345",
    customer_email: "customer@example.com",
    success_url: "https://example.com/orders/12345/thanks",
    cancel_url: "https://example.com/cart",
  }),
});
const { data: session } = await res.json();
// session.url   → hosted checkout
// session.token → the popup
```

The response carries both front doors:

- `url` is the hosted page. Redirect the customer to it, or put it in a link.
- `token` opens the same session in the popup. Send it to your front end; never the secret key.

Other things to know:

- `reference` is optional. When you give one it must be unique among your checkout sessions in the mode (`409 duplicate_reference`), and you can [look the session up by it](/reference/get-checkout-session-by-reference).
- The session starts `open`. The payment and its account are created only when the customer opens the page or the popup, so abandoned checkouts use no accounts.
- Sessions expire after `expires_in` seconds (default 1 hour, at most 3 hours: a one-time account can't live longer), emitting `checkout.session.expired`. You can [expire one early](/reference/expire-checkout-session).

## 2. Show it to the customer

- **Hosted:** redirect to `url`. See [Hosted checkout](/checkout/hosted).
- **Popup:** load the SDK and call `checkout({ session: token })`. See [The popup](/checkout/popup).

## 3. Confirm, then fulfil

When the payment succeeds the session becomes `complete` and you receive `checkout.session.completed`. The customer is sent to `success_url` (hosted) or your `onSuccess` runs (popup).

> [!IMPORTANT]
> Neither the redirect nor the callback is proof of payment. Before fulfilling, confirm on your server: handle `checkout.session.completed` (after [verifying the signature](/webhooks/signatures)) or [retrieve the session](/reference/get-checkout-session) and check `status` is `complete`. Fulfil each `reference` once.

## Payment links

A [payment link](/reference/create-payment-link) is a reusable hosted page you can share anywhere (WhatsApp, Instagram, an email) with no integration at all.

- Set a fixed `amount`, or leave it out and set `min_amount` / `max_amount` to let the payer choose (useful for donations).
- `max_uses` stops the link after that many completed payments; while a payer has the page open, their use is reserved, so a limited link can't be oversold.
- `expires_at` stops it at a time; `active: false` stops it now.
- Every visit starts its own checkout session. List a link's sessions with `GET /api/v1/checkout/sessions?payment_link=plink_…`.

## Keep reading

- [Hosted checkout](/checkout/hosted): redirects, `success_url` and `cancel_url`, what the page shows.
- [The popup](/checkout/popup): install, the SDK API, HTML, React and Next.js examples.
- [Customising checkout](/checkout/customization): your name, brand colour and support contact.
- [Security](/checkout/security): publishable versus secret keys, allowed origins, Content Security Policy.
- [Testing checkout](/checkout/testing): pay a test session end to end in the sandbox.
- [Troubleshooting](/checkout/troubleshooting) and the [SDK changelog](/checkout/sdk-changelog).
