---
title: "Receiving webhooks"
description: "Get told the moment something happens: a payment succeeds, a transfer lands, a settlement completes."
---

Pletopay sends **events** to your server as signed HTTPS `POST` requests. Webhooks are how you learn that a customer's transfer arrived, without polling.

## Register an endpoint

Register a URL with the events you want, [through the API](/reference/create-webhook-endpoint) or under **Settings → Developers → Webhooks** in the dashboard:

```bash title=cURL
curl -X POST https://api.pletopay.com/api/v1/webhook-endpoints \
  -H "Authorization: Bearer $PLETOPAY_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhooks/pletopay",
    "enabled_events": ["payment.succeeded", "payment.failed", "transfer.succeeded", "transfer.failed"]
  }'
```

- The response includes the endpoint's signing **`secret`** (`whsec_…`). **It's shown only once**: store it with your other secrets. You can [rotate it](/reference/rotate-webhook-secret) later.
- Use `["*"]` to receive every event, including types added in the future.
- Endpoints belong to a mode: register separately with your test and live keys. Live endpoints must use `https`, and private network addresses are refused.
- You can have up to 16 endpoints per mode.
- An endpoint receives events created after it was registered. To deliver an older one, [replay it](/reference/replay-event).

## The event

```json title=payment.succeeded
{
  "id": "evt_01J8Z5X7Q9K2M4N6P8R0S2T4WB",
  "object": "event",
  "type": "payment.succeeded",
  "api_version": "2026-09-25",
  "livemode": false,
  "created_at": "2026-09-24T18:04:12.000Z",
  "data": {
    "object": {
      "id": "pay_01J8Z5X7Q9K2M4N6P8R0S2T4V6",
      "object": "payment",
      "status": "succeeded",
      "reference": "ORDER-12345",
      "amount_received": 5000000
    }
  }
}
```

`data.object` is the object as it was **when the event happened**; retrieve it for its current state. Events are **not** wrapped in the API's response envelope: the event itself is the body. Every event type and its payload is listed under [Webhook events](/reference/webhooks).

## Delivery headers

| Header | Value |
|---|---|
| `X-PletoPay-Signature` | `t=<unix seconds>,v1=<signature>`. [Verify it](/webhooks/signatures). |
| `X-PletoPay-Timestamp` | The same `t`. |
| `X-PletoPay-Event-ID` | The event id: **de-duplicate on it**. |
| `X-PletoPay-Event-Type` | For example `payment.succeeded`. |
| `X-PletoPay-Delivery-ID` | The delivery (`whd_…`). |

## Handling events

1. **Verify the signature** against the raw body. Reject anything that fails.
2. **Respond 2xx quickly**, within 10 seconds. Queue slow work instead of doing it in the request.
3. **Skip events you've already processed**, keyed by `X-PletoPay-Event-ID`.
4. **Act on the state, not the order.** For `payment.succeeded`, fulfil the order once, keyed by your `reference`; optionally [retrieve the payment](/reference/get-payment) first.

```javascript tab=Node.js (Express)
import express from 'express';

const app = express();

// Keep the raw body: the signature is computed over the exact bytes sent.
app.post('/webhooks/pletopay', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.get('X-PletoPay-Signature') ?? '';
  if (!verifyPletopaySignature(process.env.PLETOPAY_WEBHOOK_SECRET, signature, req.body.toString('utf8'))) {
    return res.sendStatus(400);
  }
  const event = JSON.parse(req.body.toString('utf8'));
  res.sendStatus(200); // acknowledge first, then work

  if (await alreadyProcessed(event.id)) return;
  if (event.type === 'payment.succeeded') await fulfilOrder(event.data.object.reference);
  await markProcessed(event.id);
});
```

```python tab=Python (Flask)
import json
import os

from flask import Flask, request

app = Flask(__name__)


@app.post("/webhooks/pletopay")
def pletopay_webhook():
    raw = request.get_data()  # the exact bytes that were signed
    signature = request.headers.get("X-PletoPay-Signature", "")
    if not verify_pletopay_signature(os.environ["PLETOPAY_WEBHOOK_SECRET"], signature, raw):
        return "", 400
    event = json.loads(raw)
    if not already_processed(event["id"]):
        enqueue(event)  # do the work in the background
    return "", 200
```

The `verify…` functions are in [Verifying signatures](/webhooks/signatures).

## Retries and failures

- **At least once:** the same event can arrive more than once, so de-duplicate on the event id.
- **No ordering guarantee:** `payment.succeeded` can arrive before `payment.pending`. Use the object's `status`.
- **Retries:** any response other than 2xx within 10 seconds is retried with exponential backoff: about 10 s, 20 s, 40 s and so on, up to 6 hours between attempts, for 12 attempts. After that the delivery is marked `dead`.
- **Auto-disable:** an endpoint that fails 50 times in a row is disabled (`auto_disabled`). Fix it, then re-enable it with `status: enabled`, which resets its health.
- **Replays:** [re-deliver any event](/reference/replay-event) with the same id and payload. Test sends and replays are rate-limited per business.
- **History:** see each endpoint's [deliveries](/reference/list-endpoint-deliveries) or an event's, with response status, timing and an error code such as `connection_failed`.

Events are recorded in the same database transaction as the change they describe, so you get a webhook if, and only if, the change happened. If your endpoint was down, [list events](/reference/list-events) to catch up.

## Testing

[Send a test event](/reference/test-webhook-endpoint) (`webhook.test`) to one endpoint to check your signature verification and connectivity. In test mode, [simulate a transfer](/reference/simulate-transfer) to receive real `payment.*` events.
