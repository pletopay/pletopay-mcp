---
title: "Pagination and filters"
description: "List endpoints return pages of objects, newest first, with cursors to walk through them."
---

Every list endpoint returns its objects as an array in `data`, with paging information in `meta`:

```json title=List response
{
  "status": true,
  "message": "Payments retrieved",
  "data": [{ "id": "pay_01J8Z5X7Q9K2M4N6P8R0S2T4V6", "object": "payment" }],
  "meta": {
    "has_more": true,
    "next_cursor": "pay_01J8Z5X7Q9K2M4N6P8R0S2T4V6",
    "url": "/api/v1/payments"
  }
}
```

| `meta` field | Meaning |
|---|---|
| `has_more` | More objects exist after this page. |
| `next_cursor` | Pass it as `starting_after` to get the next page; `null` on the last page. |
| `url` | The list's path. |

Objects are ordered **newest first**.

## Parameters

| Parameter | Meaning |
|---|---|
| `limit` | How many objects to return: 1 to 100, default 10. |
| `starting_after` | An object id. Returns the objects **older** than it: the next page. |
| `ending_before` | An object id. Returns the objects **newer** than it: the previous page. |

Use one cursor at a time (sending both is `400 parameter_invalid`). A cursor that isn't one of your objects returns `400 invalid_cursor`.

## Walking every page

Pass `meta.next_cursor` as `starting_after` until it's `null`:

```javascript tab=Node.js
async function* allPayments() {
  let startingAfter;
  do {
    const url = new URL('https://api.pletopay.com/api/v1/payments');
    url.searchParams.set('limit', '100');
    if (startingAfter) url.searchParams.set('starting_after', startingAfter);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.PLETOPAY_SECRET_KEY}` } });
    const page = await res.json();
    yield* page.data;
    startingAfter = page.meta.next_cursor ?? undefined;
  } while (startingAfter);
}
```

```python tab=Python
import os

import requests


def all_payments():
    params = {"limit": 100}
    while True:
        page = requests.get(
            "https://api.pletopay.com/api/v1/payments",
            headers={"Authorization": f"Bearer {os.environ['PLETOPAY_SECRET_KEY']}"},
            params=params,
        ).json()
        yield from page["data"]
        if not page["meta"]["next_cursor"]:
            return
        params["starting_after"] = page["meta"]["next_cursor"]
```

## Filters

Every list accepts a creation-time range:

| Parameter | Meaning |
|---|---|
| `created[gt]`, `created[gte]` | Created after (or at) this ISO 8601 time. |
| `created[lt]`, `created[lte]` | Created before (or at) this time. |

Many lists add their own filters, such as `status`, `customer` or `reference` on payments, or `amount[gte]` / `amount[lte]` in kobo. Each endpoint's page in the [API reference](/reference) lists exactly which filters it takes.

```bash title=Succeeded payments in September
curl "https://api.pletopay.com/api/v1/payments?status=succeeded&created[gte]=2026-09-01T00:00:00Z&created[lt]=2026-10-01T00:00:00Z&limit=100" \
  -H "Authorization: Bearer $PLETOPAY_SECRET_KEY"
```

A few endpoints return a complete list in `data` without pagination: the [bank list](/reference/list-banks), a [settlement's items](/reference/list-settlement-items) and an [event's deliveries](/reference/list-event-deliveries).
