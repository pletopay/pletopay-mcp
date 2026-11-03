---
title: "Invoices and subscriptions"
description: "Bill customers with itemised invoices, once or on a schedule, paid by bank transfer."
---

## Invoices

An invoice is an itemised bill with a hosted payment page.

1. [Create a draft](/reference/create-invoice) with line items (quantity × unit amount in kobo), optional taxes in basis points (750 = 7.5%), a due date and a memo. Totals are computed for you.
2. Edit the draft as needed.
3. [Finalize](/reference/finalize-invoice) it: the invoice gets its number (for example `INV-000042`), its amounts are frozen, and `hosted_invoice_url` becomes a payable page. Send that URL to your customer.
4. When the customer pays, the invoice becomes `paid` and you receive `invoice.paid`.

| Status | Meaning |
|---|---|
| `draft` | Editable; not payable. |
| `open` | Finalized and payable. |
| `paid` | Paid in full. |
| `void` | Cancelled; can no longer be paid. |
| `uncollectible` | Marked as unlikely to be paid; the customer can still pay it. |

A draft with a zero total or a past due date can't be finalized. Only open or uncollectible invoices can be voided.

## Subscriptions

A subscription bills a customer every period by **issuing an invoice**. Nigerian bank transfers are push payments, so **nothing is ever debited automatically**: each period, the customer pays.

1. [Create a plan](/reference/create-plan): an amount billed every `interval_count` × `interval` (`day`, `week`, `month` or `year`).
2. [Subscribe a customer](/reference/create-subscription) to it. The first invoice is issued at `start_date` (default now), then one per period, each due after `days_until_due` days.

Choose how the customer pays:

| `collection_method` | How each period is paid |
|---|---|
| `invoice` | Through the period's hosted invoice page. |
| `dedicated_account` | The customer also gets a [dedicated account](/virtual-accounts); a transfer of the **exact** amount due pays the oldest matching open invoice. Other amounts stay ordinary payments. |

Monthly billing keeps its day of the month (a subscription started on the 31st bills on the last day of shorter months).

### When a customer doesn't pay

- An invoice past its due date makes the subscription `past_due` (`subscription.past_due`).
- Paying the overdue invoices makes it `active` again.
- After several unpaid invoices the subscription is canceled with reason `unpaid`.

[Cancel](/reference/cancel-subscription) a subscription now, or at the end of the current period with `at_period_end: true`. Open invoices are left for you to collect or void.
