---
title: "Settlements and reconciliation"
description: "How money moves through your balances, how it's paid out to your bank, and how to reconcile it."
---

## Your balances

Pletopay keeps a double-entry ledger for your account. [Your balance](/reference/get-balance) is computed from it, never stored as a single number that could drift.

| Balance | Holds |
|---|---|
| `pending` | Payments received but not yet available. |
| `available` | Money you can send as transfers and refunds, or settle to your bank. |
| `held` | Money on hold. |
| `unapplied` | Money received that is under review (for example a late transfer). |
| `settling` | Money reserved by a settlement that's in progress. |

A payment's net amount lands in `pending`. It moves to `available` once Pletopay has confirmed the credit and your account's availability delay has passed.

## Settlements

A **settlement** pays your available balance out to your **settlement account**, the bank account you set under **Settings → Settlements** in the dashboard.

- **Schedule:** daily, weekly, monthly or manual, at a time you choose (Lagos time). You can set a minimum amount and a reserve to always keep available.
- **On demand:** "Settle now" in the dashboard pays out immediately.
- **Changing the settlement account** starts a cooldown before the new account is used, to protect you if someone gains access to your dashboard.
- Each settlement reports `amount` (what reached your bank), its fees and `total_deducted` from your balance. Statuses: `pending`, `processing`, `completed`, `failed`. A failed settlement returns the money to your available balance.

Events: `settlement.created`, `settlement.completed`, `settlement.failed`. Settlements don't appear in the transfer list.

## Reconciling

| To answer | Use |
|---|---|
| "Which payments and fees make up this payout?" | [Settlement items](/reference/list-settlement-items): every balance movement the settlement accounts for, each linked to its payment, transfer or refund. |
| "What moved my balance, and why?" | [Ledger transactions](/reference/list-transactions): every journal with its signed effect on each balance and the object that caused it. |
| "What were my opening and closing balances this month?" | [The statement](/reference/get-statement). |
| "I need it in a spreadsheet." | [A CSV report](/reference/create-report) of payments, transfers, refunds, settlements, customers, invoices, subscriptions or the balance statement. Amounts are exact decimal naira; times are UTC. |

Every object carries your `reference` and `metadata` alongside Pletopay's `id`, so you can match records in both directions.
