---
title: "Rate limits"
description: "How many requests you can make, and what to do when you hit a limit."
---

Rate limits protect the API for everyone. They're counted per secret key in fixed windows. The default limits are:

| Requests | Limit |
|---|---|
| All API requests | 200 per 10 seconds per key |
| Money movement: [transfers](/reference/create-transfer), [refunds](/reference/create-refund) and live [name enquiries](/reference/resolve-account) | 120 per minute per key |
| Webhook [test sends](/reference/test-webhook-endpoint) and [replays](/reference/replay-event) | Limited per business |
| Report generation | At most 2 [reports](/reference/create-report) generating at once per mode (`429 reports_in_progress`) |

Every response reports where you stand:

| Header | Meaning |
|---|---|
| `RateLimit-Limit` | Requests allowed in the current window. |
| `RateLimit-Remaining` | Requests left in it. |
| `RateLimit-Reset` | Seconds until the window resets. |

Over the limit you get `429 rate_limited` with a `Retry-After` header in seconds.

## Staying within limits

- Honour `Retry-After`, then retry with the same `Idempotency-Key`. Add jitter if many workers retry together.
- Use [webhooks](/webhooks) instead of polling for status changes.
- Fetch lists with `limit=100` rather than many small pages.
- If your volume needs more headroom, contact Pletopay support.
