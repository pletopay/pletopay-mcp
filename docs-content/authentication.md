---
title: "Authentication"
description: "Authenticate every request with your secret API key as a bearer token."
---

Pletopay authenticates API requests with a **secret key**, sent as a bearer token:

```http title=HTTP
GET /api/v1/balance HTTP/1.1
Host: api.pletopay.com
Authorization: Bearer sk_test_…
```

A request without a key gets `401 missing_credentials`. A wrong, revoked or expired key gets `401 invalid_api_key`.

## Test and live keys

Every business has exactly two keys, created when you sign up:

| Key | Prefix | Acts on |
|---|---|---|
| Test key | `sk_test_` | Test data only, in the Pletopay sandbox. No real money. |
| Live key | `sk_live_` | Live data and real money. |

The key decides the mode: there's one API host for both, and a test key can never read or change live data. See [Test and live mode](/test-and-live).

## Finding and managing your keys

Keys live in the dashboard under **Settings → Developers → API keys**.

- **Who can see them:** owners, admins and developers manage the test key. The live key can move money, so only members who hold every permission it carries (owners and admins by default) can reveal or regenerate it.
- **Reveal:** showing a key asks for your password again, and every reveal is recorded in the activity log. For the live key you also enter a code from your authenticator app, so turn on two-factor authentication under **Settings → Security** first.
- **Regenerate:** creates a new key and retires the old one, with the same checks as revealing. You can give the old key a grace period (24 hours by default, up to 7 days) so you can deploy the new key without downtime. After the grace period the old key gets `401 invalid_api_key`.
- **Permissions:** a key reaches the whole merchant API for its mode. There are no restricted keys, so treat the secret key as full access to your business.

## Restricting your secret key by IP

You can limit each secret key to your servers' IP addresses. Once a mode's list has an entry, any request with that mode's secret key from another address is refused with `403 ip_address_not_allowed`, even though the key itself is valid. The error message includes the address the request came from, so you can see which IP to add.

- **Where:** **Settings → Developers → API keys**, under *Test key IP allowlist* and *Live key IP allowlist*. Test and live have separate lists.
- **Entries:** single addresses (`203.0.113.7`, `2001:db8::1`) or CIDR ranges (`203.0.113.0/24`). A range can be at most `/16` wide for IPv4 and `/32` for IPv6. Each mode can have up to 25 entries. A label like "Production server" is optional.
- **Off by default:** with no entries, the key works from any IP. Removing the last entry turns the restriction off again.
- **Kept when you regenerate:** the list belongs to the mode, not the key, so a regenerated key gets the same restriction straight away.
- **Who can change it:** the same people who can manage the key. For the live list that means owners and admins, and you confirm the change with your authenticator code. Every change is recorded in the activity log, and changes to the live list email your administrators.
- **What it doesn't affect:** your dashboard, your publishable keys, hosted checkout and the popup. A mistake in the list can always be fixed from the dashboard.

Refused requests show up under **Settings → Developers → Request logs** with the code `ip_address_not_allowed` and the source IP.

> [!WARNING]
> List the address your server **sends requests from**, which is not always the address it receives traffic on. Serverless functions and many container platforms use changing outbound IPs. Use a NAT gateway or a static egress IP before you turn this on, or your own calls will be refused.

## Publishable keys

Each mode also has a **publishable key** (`pk_test_…` / `pk_live_…`), shown in full on the same page. It is for one thing only: the [checkout popup](/checkout/popup) on your website, where it identifies your integration together with your allowed origins. It cannot authenticate API requests (`401 publishable_key_not_allowed`), create sessions, read data or move money, so it is safe in browser code. Regenerating it keeps the old key working for 24 hours. See [Checkout security](/checkout/security).

## Keeping your key safe

- Call the API **only from your server**. Never embed the key in a mobile app, browser JavaScript, or anything a customer can download.
- Keep it out of source control: read it from an environment variable or a secret manager.
- Regenerate it immediately if it might have leaked, for example if it appeared in logs or was committed to a repository.
- Restrict the live key to your servers' IP addresses, so a leaked key can't be used from anywhere else. See [Restricting your secret key by IP](#restricting-your-secret-key-by-ip).
- Use your test key everywhere except production.

> [!NOTE]
> Customers never need a key. Hosted checkout, payment links and invoice pages are opened by URL, and the unguessable token in the URL is their only credential. The popup adds your publishable key, which identifies you, not them.
