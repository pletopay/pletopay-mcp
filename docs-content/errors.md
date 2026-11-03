---
title: "Errors"
description: "Every error has the same envelope, a stable machine-readable code and a request id."
---

Pletopay uses HTTP status codes for the class of failure, and returns the [response envelope](/conventions) with `status: false` and the details in `error`:

```json title=Error
{
  "status": false,
  "message": "amount must not be less than 1",
  "error": {
    "type": "invalid_request",
    "code": "parameter_invalid",
    "param": "amount"
  },
  "request_id": "req_01J8Z5X7Q9K2M4N6P8R0S2T4WE"
}
```

| Field | Meaning |
|---|---|
| `status` | Always `false` for an error. |
| `message` | A human-readable explanation. It may change; don't parse it. |
| `error.type` | The broad category (below). |
| `error.code` | A stable, machine-readable code, such as `insufficient_funds`. **Program against this.** |
| `error.param` | The field or header at fault, when there is one. |
| `error.details` | Extra facts for some codes, such as the available balance for `insufficient_funds`. |
| `request_id` | The request's id, also in the `X-Request-Id` header. Quote it to support. |

Codes are part of the API contract: new codes may be added, but an existing code never changes meaning. The complete list is in the [error code reference](/reference/errors).

## HTTP statuses and types

| Status | `type` | What to do |
|---|---|---|
| `400` | `invalid_request` | Fix the request: `param` and `code` say what's wrong. Don't retry unchanged. |
| `401` | `authentication_error` | Check the `Authorization` header and your key. |
| `403` | `permission_error` | The action isn't allowed for your account now, for example live money-out before verification or a risk limit. |
| `404` | `not_found` | The object doesn't exist in your data for this mode. |
| `409` | `conflict`, `idempotency_error` | The object's state doesn't allow this, or a reference or key is already in use. |
| `422` | `idempotency_error` | The `Idempotency-Key` was used for a different request. |
| `429` | `rate_limit_error` | Slow down; wait for `Retry-After` seconds. See [Rate limits](/rate-limits). |
| `500` | `api_error` | Something went wrong on our side. Retry with the same `Idempotency-Key`. |
| `502` | `api_error` | The request was definitively refused, for example opening an account. |
| `503` | `api_error` | The service is temporarily unavailable; **nothing was sent or created**. Retry later with the same key. |

## Handling errors well

```javascript title=Node.js
const res = await fetch(url, options);
if (!res.ok) {
  const { message, error, request_id } = await res.json();
  console.error(`Pletopay ${res.status} ${error.code} (${request_id}): ${message}`);
  if (res.status === 429 || res.status >= 500) {
    // Retryable: back off, then retry with the SAME Idempotency-Key.
  } else if (error.code === 'insufficient_funds') {
    // Tell the user; error.details has the figures.
  }
}
```

- Retry `429`, `500` and `503` with backoff, reusing the idempotency key. Don't retry other `4xx` unchanged.
- An id that belongs to another business, or to the other mode, returns `404 resource_missing`, the same as one that doesn't exist.
