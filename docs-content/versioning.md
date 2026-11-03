---
title: "Versioning"
description: "How the API changes, and how your integration stays stable while it does."
---

The API has two version markers:

| Marker | Where | Current |
|---|---|---|
| **Major version** | The URL: `/api/v1` | `v1` |
| **Dated version** | The `PletoPay-Version` header | `2026-09-25` |

## Dated versions

Your business is **pinned** to a dated version. Requests without a `PletoPay-Version` header use it, and every response echoes the version used in its own `PletoPay-Version` header. Webhook events carry it too, as `api_version`.

To try a newer version on a single request, send the header:

```bash title=cURL
curl https://api.pletopay.com/api/v1/balance \
  -H "Authorization: Bearer $PLETOPAY_SECRET_KEY" \
  -H "PletoPay-Version: 2026-09-25"
```

An unknown version returns `400 invalid_api_version`.

## What counts as a breaking change

These can happen at any time, without a new version, so build for them:

- New endpoints, new optional request fields, and new fields in responses and events.
- New values in `status` and other enums you read, new event types, and new error codes.

A **breaking** change ships only in a new dated version, such as removing or renaming a field, changing a field's type or meaning, or making an optional field required. Your pinned version keeps its behaviour until you choose to upgrade.

> [!NOTE]
> One exception happened before launch: the [response envelope](/conventions) introduced with `2026-09-25` applies to every version, including `2026-09-24`.

## Deprecation

When an endpoint or field is going to be removed, the change is announced in the [changelog](/changelog) at least six months before removal, and affected responses will carry `Deprecation` and `Sunset` headers. Nothing is deprecated today.
