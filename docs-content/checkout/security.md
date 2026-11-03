---
title: "Checkout security"
description: "Publishable keys, allowed origins, Content Security Policy, and why the browser is never the source of truth."
---

## Publishable versus secret keys

| | Secret key `sk_…` | Publishable key `pk_…` |
|---|---|---|
| Where it lives | Your server only | Your website's JavaScript |
| What it can do | Everything in the API for its mode | Identify your checkout integration to the popup. Nothing else |
| If it leaks | Regenerate it immediately | Nothing can be read or moved with it; regenerate at your leisure |
| Where to find it | **Settings → Developers → API keys** (password required) | The same page, shown in full |

A publishable key sent as a bearer token to the API is refused with `401 publishable_key_not_allowed`. It cannot create sessions, read data or move money. Each mode has its own, so `pk_test_…` only opens sessions created with `sk_test_…`, and `pk_live_…` only those created with `sk_live_…` (`livemode_mismatch` otherwise).

## Sessions are created on your server

The browser never chooses the amount. Your server creates the session with the secret key and passes only the `token` to the page. The token is unguessable (192 bits) and is the only thing the popup or the hosted page needs.

## Allowed origins

Under **Settings → Developers → Checkout integration**, list the websites that may open the popup, as origins: `https://shop.example.com`, or `https://*.example.com` for every subdomain. Before the popup renders, Pletopay checks the embedding page's origin (as the browser reports it) against this list, together with your publishable key and the session. A page that isn't listed gets `origin_not_allowed` and sees nothing.

- In test mode, `http://localhost` and `http://127.0.0.1` on any port are always allowed, so you can develop without listing them.
- In live mode only the listed origins work. Add your production site before you go live.
- Hosted checkout links don't depend on this list.

## Content Security Policy

If your site sets a CSP, allow the checkout origin for scripts and frames:

```http title=Content-Security-Policy
script-src 'self' https://checkout.pletopay.com;
frame-src https://checkout.pletopay.com;
```

The SDK sets its styles through the DOM, so it needs no `style-src` allowance, and it makes no network requests of its own: only the popup, from its own origin, talks to Pletopay. Your `connect-src` doesn't need to change.

## What the browser is told, and what it isn't

- The popup and the hosted page receive only what a customer needs: your name and branding, the amount and description, the account details and the status. Never your metadata, references, ids or other customers.
- `onSuccess`, the redirect to `success_url` and any query parameter you add to it are **not** proof of payment. A customer can trigger them. Only your server can confirm, by handling `checkout.session.completed` (after [verifying the signature](/webhooks/signatures)) or by [retrieving the session](/reference/get-checkout-session) with your secret key.
- The popup is a frame on Pletopay's origin. Your page cannot read its contents, and the popup only ever talks to the page that opened it.

## Rate limits

The popup's handshake and the checkout endpoints are rate limited per customer IP (and the handshake per publishable key, generously). A customer who hits the limit sees "Too many requests" with a retry; nothing is created.
