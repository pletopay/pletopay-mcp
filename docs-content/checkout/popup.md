---
title: "The popup"
description: "Open Pletopay checkout over your own page with a script tag, your publishable key and a session token."
---

The popup shows the same checkout as the hosted page, inside your page. Your server still creates the session; the browser only opens it.

## Install

```html title=HTML
<script src="https://checkout.pletopay.com/v1/pletopay.js"></script>
```

The SDK is about 4 KB gzipped, has no dependencies and defines one global, `Pletopay`. `/v1/` is the major version; see the [SDK changelog](/checkout/sdk-changelog). An ES module build (`/v1/pletopay.esm.js`) and types (`/v1/pletopay.d.ts`) are served next to it.

## Open a session

```html tab=HTML
<button id="pay">Pay with bank transfer</button>

<script src="https://checkout.pletopay.com/v1/pletopay.js"></script>
<script>
  const pletopay = Pletopay({ publicKey: "pk_test_YOUR_PUBLISHABLE_KEY" });

  document.getElementById("pay").addEventListener("click", async () => {
    // 1. Ask your server for a checkout session (it calls Pletopay with your secret key).
    const res = await fetch("/api/checkout-session", { method: "POST" });
    const { token } = await res.json();

    // 2. Open the popup. The amount was fixed on your server.
    pletopay.checkout({
      session: token,
      onSuccess: ({ session }) => {
        // Pletopay saw the transfer. Confirm on your server before fulfilling.
        window.location.href = "/orders/thank-you?session=" + session;
      },
      onPending: () => console.log("Transfer received, confirming…"),
      onError: (error) => console.error(error.code, error.message),
      onClose: ({ reason }) => console.log("Checkout closed:", reason),
    });
  });
</script>
```

```javascript tab=React
import { useEffect, useRef, useState } from "react";

export function PayButton() {
  const client = useRef(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.pletopay.com/v1/pletopay.js";
    script.async = true;
    script.onload = () => {
      client.current = window.Pletopay({ publicKey: "pk_test_YOUR_PUBLISHABLE_KEY" });
    };
    document.body.appendChild(script);
    return () => script.remove();
  }, []);

  async function pay() {
    if (!client.current) return;
    setBusy(true);
    const res = await fetch("/api/checkout-session", { method: "POST" });
    const { token } = await res.json();
    client.current.checkout({
      session: token,
      onSuccess: ({ session }) => (window.location.href = `/orders/thank-you?session=${session}`),
      onClose: () => setBusy(false),
    });
  }

  return <button onClick={pay} disabled={busy}>Pay with bank transfer</button>;
}
```

```typescript tab=Next.js
// app/components/PayButton.tsx
"use client";
import Script from "next/script";
import { useRef, useState } from "react";

export function PayButton() {
  const client = useRef<ReturnType<typeof window.Pletopay> | null>(null);
  const [busy, setBusy] = useState(false);

  async function pay() {
    if (!client.current) return;
    setBusy(true);
    const res = await fetch("/api/checkout-session", { method: "POST" });
    const { token } = await res.json();
    client.current.checkout({
      session: token,
      onSuccess: ({ session }) => (window.location.href = `/orders/thank-you?session=${session}`),
      onClose: () => setBusy(false),
    });
  }

  return (
    <>
      <Script
        src="https://checkout.pletopay.com/v1/pletopay.js"
        strategy="afterInteractive"
        onLoad={() => (client.current = window.Pletopay({ publicKey: "pk_test_YOUR_PUBLISHABLE_KEY" }))}
      />
      <button onClick={pay} disabled={busy}>Pay with bank transfer</button>
    </>
  );
}

// app/api/checkout-session/route.ts (server only: uses your secret key)
export async function POST() {
  const res = await fetch("https://api.pletopay.com/api/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.PLETOPAY_SECRET_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ amount: 250000, currency: "NGN", reference: "ORDER-12345" }),
  });
  const { data } = await res.json();
  return Response.json({ token: data.token });
}
```

Your publishable key is under **Settings → Developers → API keys** in the dashboard (the **Checkout integration** page there shows these examples with your key filled in). Use `pk_test_…` while building and `pk_live_…` in production, matching the secret key your server uses.

## The SDK

```typescript title=pletopay.d.ts
Pletopay({ publicKey, checkoutUrl? }): PletopayClient

client.checkout(options): CheckoutHandle | null
client.redirectToCheckout({ session }): void   // the hosted page instead
client.close(): void
client.isOpen(): boolean
client.version: string

interface CheckoutOptions {
  session: string;                              // the session's token (or its url)
  onSuccess?(result: { session: string; status: "complete" }): void;
  onPending?(result: { session: string; paymentStatus: "processing" | "under_review" }): void;
  onError?(error: { code: string; message: string; retryable: boolean }): void;
  onClose?(result: { reason: "user" | "complete" | "expired" | "error" }): void;
  appearance?: { zIndex?: number };            // default 2147483000
}
```

- `checkout()` returns `null` when a popup is already open (a second click is ignored) or the options are invalid; then `onError` is called synchronously with `invalid_options`.
- `onSuccess` means Pletopay saw the transfer and the session is `complete`. **Confirm on your server before fulfilling.** If you leave `onSuccess` out, the SDK sends the customer to the session's `success_url` instead.
- `onPending` fires once when a transfer has arrived and is being confirmed or reviewed. The popup stays open.
- `onError` receives the same codes the API uses (`publishable_key_invalid`, `origin_not_allowed`, `livemode_mismatch`, `checkout_session_not_open`, `rate_limited`, `service_unavailable`, …) plus the SDK's own `invalid_options` and `embed_timeout`. After a non-retryable error the popup closes; after a retryable one the customer can try again inside it. See [Troubleshooting](/checkout/troubleshooting).
- `onClose` always fires when the popup goes away, with why. After a successful payment the popup shows an animated confirmation and closes itself after a few seconds (`reason: "complete"`). Closing never cancels a transfer the customer already sent: if the money arrives, the session still completes and you receive `checkout.session.completed`.
- `checkoutUrl` is only needed when you bundle the SDK instead of loading it from its `<script>` tag.

## What the customer experiences

The popup is a Pletopay-controlled frame over a dimmed backdrop: your business name, the amount, the account to transfer to with copy buttons, a countdown, a live status and an "I've sent the money" button that turns the popup into a checking screen while Pletopay watches for the transfer (the details stay one click away). When the money arrives an animated check mark confirms it, and the popup closes itself a few seconds later (`onClose` with `reason: "complete"`). Escape or the close button closes it (a click outside the popup does nothing, so a stray click never interrupts a transfer); while a transfer may be in flight the customer is asked to confirm first. Focus stays inside the popup and returns to your button afterwards. On phones it fills the screen.

## Duplicate clicks and retries

- Create one session per order on your server, with an `Idempotency-Key` derived from the order, so a retried request never makes a second session.
- The SDK opens one popup at a time; extra clicks while it is open are ignored.
- Reopening the same session (the customer closed the popup, then clicked again) shows the same account: a session has at most one payment.
