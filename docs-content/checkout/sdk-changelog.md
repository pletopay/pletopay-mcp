---
title: "SDK changelog and versioning"
description: "How pletopay.js is versioned, and what changed in each release."
---

## Versioning

- The URL path is the **major** version: `https://checkout.pletopay.com/v1/pletopay.js`. Within `/v1/` the API described in [The popup](/checkout/popup) stays backwards compatible; new options and callbacks may be added, nothing is removed or changed in meaning.
- `/v1/pletopay.js` is updated in place (cached for a few minutes), so you get fixes without redeploying. To pin an exact release, load `https://checkout.pletopay.com/v1.<version>/pletopay.js`; those files never change.
- A breaking change would ship as `/v2/` alongside `/v1/`, with a migration note here. `/v1/` keeps working for at least 12 months after `/v2/` ships.
- `client.version` returns the exact release, for your logs.

## 1.0.0

First release.

- `Pletopay({ publicKey })`, `checkout()`, `redirectToCheckout()`, `close()`, `isOpen()`.
- Callbacks `onSuccess`, `onPending`, `onError`, `onClose`. After a successful payment the popup shows an animated confirmation and closes itself after a few seconds (`onClose` reason `complete`); without `onSuccess` the SDK then sends the customer to `success_url`.
- One popup at a time; Escape and the close button ask for confirmation while a transfer may be in flight, and clicks outside the popup do nothing; focus is trapped inside and restored afterwards; the page's scroll is locked.
- No styles are injected as text, so your `style-src` policy is untouched.
- ES module build and TypeScript declarations served next to the script.
