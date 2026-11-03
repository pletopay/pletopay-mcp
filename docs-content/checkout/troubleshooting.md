---
title: "Troubleshooting checkout"
description: "What each popup and hosted-checkout error means, and what to do about it."
---

## Errors the popup reports

These reach your `onError` callback and are shown to the customer in plain words.

| `code` | Meaning | What to do |
|---|---|---|
| `invalid_options` | `checkout()` was called without a usable `session`, with a non-function callback, or `Pletopay()` without a valid `pk_…` key | Fix the call. The popup never opened |
| `publishable_key_invalid` | The key is unknown, was regenerated (and its grace period passed), or the business is suspended | Copy the current key from **Settings → Developers → API keys** |
| `origin_not_allowed` | The page's origin isn't in your allowed origins | Add it under **Checkout integration**. `localhost` is always allowed in test mode |
| `livemode_mismatch` | A `pk_test_` key with a session created by `sk_live_`, or the reverse | Use matching keys |
| `checkout_session_mismatch` | The session belongs to another business | Check which account's secret key created it |
| `not_found` | No such session: the token is wrong or incomplete | Pass `data.token` from the create response unchanged |
| `checkout_session_not_open` | The session is complete or expired | Create a new session for a new attempt |
| `merchant_unavailable` | Your business can't accept payments right now (suspended, or not yet approved for live mode) | See **Settings → Verification** |
| `rate_limited` | Too many requests from this customer's network | Retryable: the customer can try again |
| `service_unavailable`, `network_error` | Pletopay couldn't be reached | Retryable; nothing was created |
| `embed_timeout` | The popup didn't load within 15 seconds | Check the customer's connection and your CSP (`frame-src`) |

## Nothing happens when the button is clicked

- `checkout()` returned `null`: a popup is already open, or the options were invalid and `onError` was called. Log it.
- `Pletopay is not defined`: the `<script>` tag hasn't loaded yet. Initialise after it loads (`onload`, or place your code after the tag).
- The browser console shows a CSP error: allow `https://checkout.pletopay.com` in `script-src` and `frame-src`. See [Security](/checkout/security).

## The popup shows "This website is not allowed"

Add the site's origin, exactly as the browser reports it (scheme and host, no path), under **Settings → Developers → Checkout integration**. `https://www.example.com` and `https://example.com` are different origins; `https://*.example.com` covers both subdomains but not the apex.

## `onSuccess` fired but the webhook hasn't arrived

`onSuccess` runs as soon as the popup sees the session `complete`; the webhook is sent within moments but delivered independently, with retries. Always confirm with the event or by retrieving the session, and fulfil only once.

## The customer sent the money but the page still says "Waiting"

- A different amount can't be matched automatically and goes to review; the customer sees "We received a transfer and are reviewing it" once it arrives. See [Payments](/payments#payment-statuses).
- Transfers from some banks take minutes. The page keeps polling, also after the customer switches tabs.
- If the session expired first, the money is still matched and reviewed. Nothing is lost.

## The hosted page says "We can't find this payment"

The `url` or `token` was altered or truncated. Use the values from the create response unchanged; tokens are case-sensitive.

## Regenerated the publishable key and the popup stopped working

Your site is still using the old key after its grace period (24 hours by default). Deploy the new key. Hosted checkout links are unaffected by publishable keys.
