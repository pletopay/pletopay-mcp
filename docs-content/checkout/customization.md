---
title: "Customising checkout"
description: "Your name, brand colour and support contact on the hosted page and in the popup."
---

Checkout looks like Pletopay by default and works without any customisation. You can adjust a few things under **Settings → Developers → Checkout integration** in the dashboard; they apply to the hosted pages, payment links, invoice pages and the popup, in test and live mode alike.

| Setting | What it does | Rules |
|---|---|---|
| Trading name | The name customers see at the top of checkout and on their bank statement | Set under **Settings → Business** |
| Brand colour | The pay button, copy buttons, focus ring and the live status dot | `#rrggbb`; at least 3:1 contrast against white. If the colour is too light for white text, the button text goes dark instead |
| Support email | Shown as "Need help? …" while a payment is pending, expired or failed | Falls back to your business email |
| Support page | An `https://` link shown instead of the email when set | |
| Allowed origins | The websites that may open the popup (see [Security](/checkout/security)) | Up to 20 |

The dashboard previews the result live as you type.

## What you can't change

The amount, the account details, the countdown, the status wording and the "Secured by Pletopay" footer are fixed. Customisation can never obscure what the customer must pay or make the payment status ambiguous, and merchant text is always rendered as text, never as HTML.

## Logos

Uploading a logo isn't supported yet. Checkout shows your trading name in text.
