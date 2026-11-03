---
title: "Requests and responses"
description: "The conventions every endpoint follows, from the base URL to money, ids and metadata."
---

## Base URL

```text title=Base URL
https://api.pletopay.com/api/v1
```

Test and live mode share this URL; your [key](/authentication) decides the mode. Every request must use HTTPS.

## Requests

- Send JSON bodies with `Content-Type: application/json`. Bodies are limited to 256 KB.
- **Unknown fields are rejected, not ignored** (`400 unknown_parameter`), so a typo can't silently do nothing.
- Invalid fields return `400 parameter_invalid` with `param` naming the field.
- Query parameters use brackets for ranges and lists: `created[gte]=…`, `expand[]=customer`.

## Responses

Every JSON response has the same envelope:

```json title=Response
{
  "status": true,
  "message": "Customer retrieved",
  "data": {
    "id": "cus_01J8Z5X7Q9K2M4N6P8R0S2T4V7",
    "object": "customer",
    "livemode": false,
    "email": "customer@example.com",
    "metadata": {},
    "created_at": "2026-09-24T18:00:00.000Z",
    "updated_at": "2026-09-24T18:00:00.000Z"
  }
}
```

| Field | Meaning |
|---|---|
| `status` | `true` on success, `false` on error. It always agrees with the HTTP status code. |
| `message` | A short, human-readable outcome. Show or log it; don't branch on it. |
| `data` | The object or result. Actions that return nothing answer `200` with `"data": null`. |
| `meta` | Lists only: paging information. See [Pagination](/pagination). |

Errors use the same envelope with `status: false`; see [Errors](/errors). Two things are **not** wrapped: the [webhook events](/webhooks) Pletopay sends to you, and file downloads such as report CSVs.

Inside `data`:

- `object` names the type. `livemode` says which mode it belongs to.
- **New fields can be added at any time.** Your code must ignore fields it doesn't know.
- Every response has an `X-Request-Id` header (`req_…`). Log it, and quote it when you contact support.

## Money

**Amounts are integers in the smallest currency unit, kobo.** ₦1.00 is `100`; ₦50,000.00 is `5000000`. There are never decimals or floats in amounts. `currency` is always `NGN`.

```javascript title=Displaying kobo
// For display only: keep amounts as integers in your database and arithmetic.
const naira = (kobo) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(kobo / 100);
naira(5000000); // "₦50,000.00"
```

## IDs

Every object has an opaque, prefixed id: `pay_01J8Z5X7Q9K2M4N6P8R0S2T4V6`. The prefix tells you the type:

| Prefix | Object | Prefix | Object |
|---|---|---|---|
| `cus_` | Customer | `trf_` | Transfer |
| `pay_` | Payment | `re_` | Refund |
| `va_` | Virtual account | `stl_` | Settlement |
| `cs_` | Checkout session | `sub_` | Subaccount |
| `plink_` | Payment link | `spl_` | Split rule |
| `inv_` | Invoice | `plan_` | Plan |
| `sbs_` | Subscription | `rpt_` | Report |
| `evt_` | Event | `we_` | Webhook endpoint |
| `whd_` | Webhook delivery | `jrn_` | Ledger transaction |

Ids are permanent and unique: store them. Don't parse them beyond the prefix. An id from another business, or from the other mode, returns `404 resource_missing`, exactly like one that doesn't exist.

## Your references

Most creates accept a `reference`, your own identifier such as an order number. Payment and transfer references must be unique within the mode (`409 duplicate_reference`), and you can [look up a payment by its reference](/reference/get-payment-by-reference).

## Timestamps

Times are ISO 8601 strings in **UTC**, such as `2026-09-24T18:00:00.000Z`. Convert to Lagos time (UTC+1) for display. Timestamps you send must be ISO 8601 with a time zone.

## Metadata

Objects accept `metadata`: your own key–value strings, returned on the object and in its webhooks.

- Up to 50 keys; keys up to 40 characters, values up to 500. Values are strings.
- Updates **merge** into the existing metadata. Set a key to `""` to delete it.
- Don't store secrets or sensitive personal data in metadata.

## Expanding objects

Some fields hold the id of a related object. Where supported, `expand[]` returns the full object instead:

```bash title=cURL
curl "https://api.pletopay.com/api/v1/payments/pay_01J8Z5X7Q9K2M4N6P8R0S2T4V6?expand[]=customer" \
  -H "Authorization: Bearer $PLETOPAY_SECRET_KEY"
```
