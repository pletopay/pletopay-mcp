---
title: "Test and live mode"
description: "Build and test in the sandbox with your test key, then switch keys to go live."
---

Pletopay has two fully separate modes. Your **key** chooses the mode on every request; the base URL is the same.

| | Test mode | Live mode |
|---|---|---|
| Secret key | `sk_test_…` | `sk_live_…` |
| Publishable key (popup) | `pk_test_…` | `pk_live_…` |
| Money | None: the sandbox | Real naira |
| Data | Its own customers, payments, accounts, balances, webhooks and events | Its own |
| `livemode` on every object | `false` | `true` |
| Paying a payment | [Simulate a transfer](/reference/simulate-transfer) | A customer transfers from their bank |
| Checkout popup origins | `localhost` always allowed | Only your [allowed origins](/checkout/security) |

Nothing crosses between modes: a test customer can't be used in live mode, test webhooks go only to endpoints you registered with the test key, and the dashboard has a mode switch for viewing each.

## Simulating a customer's transfer

In test mode, [`POST /api/v1/sandbox/simulate-transfer`](/reference/simulate-transfer) asks the sandbox to send money into one of your test virtual accounts:

```bash title=cURL
curl -X POST https://api.pletopay.com/api/v1/sandbox/simulate-transfer \
  -H "Authorization: Bearer $PLETOPAY_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "account_number": "9000002140", "amount": 5000000 }'
```

- It returns `202`: the simulation was accepted. The payment then moves to `succeeded` and webhooks are sent, exactly as with live money, usually within seconds.
- Simulating the wrong amount into an exact-amount account is refused (`400 simulation_rejected`, with the expected amount in the message), just as a real transfer would be.
- Simulating into an account that is not `active` (for example a one-time account that has already received its payment) is refused with `409 virtual_account_not_active`. Create a new account instead.
- The account must be one of your test accounts (`400 resource_missing` otherwise). With a live key the endpoint returns `403 test_mode_only`.
- You can name the sender with `sender_name` and `sender_account_number` (10 digits). Refunds go back to the sender, so this is how you test refund outcomes (see below). Without them, the transfer comes from a default test sender.

## Test values

In test mode, payouts and refunds to these account numbers get a fixed outcome, so you can test failures on purpose. Any other number succeeds straight away. [`GET /api/v1/sandbox/test-values`](/reference/list-sandbox-test-values) and the dashboard's Sandbox page list the same table.

| Recipient account number | Outcome |
|---|---|
| `0000000000` (any number starting `000`) | Account lookup fails: the account is not found. |
| `0100000001` | The payout is declined when sent and fails straight away. |
| `0100000002` | The payout stays `processing` for about a minute, then succeeds. |
| `0100000003` | The payout stays `processing` for about a minute, then fails and the funds are returned. |
| `0100000004` | Sending times out, then a status check confirms the payout succeeded. It is never sent twice. |

Use them as the recipient of a payout, or as `sender_account_number` when you simulate a transfer, then refund that payment.

A payout to one of your own test virtual accounts, or another business's, behaves as it would in live mode. Use the account's `bank_code` from its `bank_transfer` details. The account lookup returns the account's real name. The money arrives as a payment on that account, with its webhooks, and an account that can't take the transfer (for example the wrong amount for an exact-amount account) declines it. Webhooks for each step (`processing`, then `succeeded` or `failed`) are sent as in live mode.

## Things that differ in test mode

- **Refunds go back to the simulated sender**: the default test sender, or the `sender_account_number` you passed. See [Refunds](/refunds).
- **Bank fees are applied as in live mode**, so the net amounts and fees you see in test mode match what live payments will show.
- **No verification is needed.** Business verification only gates live mode. See [Going live](/going-live).
