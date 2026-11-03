---
title: "MCP server"
description: "Let AI agents such as Claude, Cursor and VS Code work with your Pletopay account through the Model Context Protocol."
---

The Pletopay MCP server lets AI agents work with your Pletopay account. It speaks the [Model Context Protocol](https://modelcontextprotocol.io), so any MCP client can use it: Claude Desktop, Claude Code, Cursor, VS Code and others. Ask in plain words ("why is ORDER-12345 still pending?", "reconcile last week's collections", "create a payment link for ₦25,000") and the agent calls the Pletopay API for you.

It gives agents:

- **One tool per API operation**: payments, virtual accounts, customers, transfers, refunds, settlements, checkout, payment links, invoices, subscriptions, reports, webhooks, balance and the sandbox. Each tool takes the same fields as the [API reference](/reference) and returns the same objects.
- **Docs search**: `search_docs` and `get_doc` read these guides, offline.
- **Reference resources**: webhook event types, error codes and the schema of every object.
- **Prompts**: ready-made workflows for reconciling collections, investigating a payment or a failed transfer, and setting up webhooks.

> [!IMPORTANT]
> Start with your **test key** (`sk_test_…`). In test mode nothing touches real money, and you can [simulate customer transfers](/test-and-live#simulating-a-customers-transfer) to see the whole flow. In live mode, the tools that send money are switched off unless you turn them on (see [Money movement](#money-movement)).

## Run it on your machine

The server runs locally with `npx` (Node.js 24 or later). Your key stays on your machine and is sent only to the Pletopay API. Pass it in the `PLETOPAY_SECRET_KEY` environment variable.

```bash tab="Claude Code"
claude mcp add pletopay --env PLETOPAY_SECRET_KEY=sk_test_… -- npx -y @pletopay/mcp
```

```json tab="Claude Desktop"
{
  "mcpServers": {
    "pletopay": {
      "command": "npx",
      "args": ["-y", "@pletopay/mcp"],
      "env": { "PLETOPAY_SECRET_KEY": "sk_test_…" }
    }
  }
}
```

```json tab=Cursor
{
  "mcpServers": {
    "pletopay": {
      "command": "npx",
      "args": ["-y", "@pletopay/mcp"],
      "env": { "PLETOPAY_SECRET_KEY": "sk_test_…" }
    }
  }
}
```

```json tab="VS Code"
{
  "inputs": [
    { "id": "pletopay-key", "type": "promptString", "description": "Pletopay secret key", "password": true }
  ],
  "servers": {
    "pletopay": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@pletopay/mcp"],
      "env": { "PLETOPAY_SECRET_KEY": "${input:pletopay-key}" }
    }
  }
}
```

- **Claude Desktop**: add the block to `claude_desktop_config.json` (Settings → Developer → Edit Config) and restart the app.
- **Cursor**: add it to `.cursor/mcp.json` in your project, or `~/.cursor/mcp.json` for every project.
- **VS Code**: add it to `.vscode/mcp.json`. VS Code asks for the key once and stores it securely.

Don't commit a file that contains your key. Prefer the environment variable to the `--api-key` flag: command-line arguments are visible to other users of the machine.

## Use the hosted server

If your client connects to remote MCP servers, use the hosted server instead of running one. It is stateless and keeps nothing: every request sends your key in the `Authorization` header, and the server uses it only for that request.

```bash tab="Claude Code"
claude mcp add --transport http pletopay https://mcp.pletopay.com/mcp \
  --header "Authorization: Bearer sk_test_…"
```

```json tab="Other clients"
{
  "mcpServers": {
    "pletopay": {
      "type": "http",
      "url": "https://mcp.pletopay.com/mcp",
      "headers": { "Authorization": "Bearer sk_test_…" }
    }
  }
}
```

> [!NOTE]
> If you use an [IP allowlist](/authentication) for live mode, API calls made through the hosted server come from the hosted server's address, not yours, and are refused. Run the server on your machine (or your own server) instead, so the calls come from an address you allowed.

## Options

| Option | Environment variable | Hosted server header | Default |
|---|---|---|---|
| `--toolsets payments,transfers` | `PLETOPAY_MCP_TOOLSETS` | `X-PletoPay-MCP-Toolsets` | `all` |
| `--read-only` | `PLETOPAY_MCP_READ_ONLY=true` | `X-PletoPay-MCP-Read-Only: true` | Off |
| `--enable-money-movement` | `PLETOPAY_MCP_ENABLE_MONEY_MOVEMENT=true` | `X-PletoPay-MCP-Money-Movement: enabled` | Off for live keys |
| `--no-docs` | | | Docs tools and prompts on |

- **Toolsets** narrow the tools to the parts of the API you need, which also keeps the agent's context small: `customers`, `payments`, `virtual_accounts`, `subaccounts`, `transfers`, `settlements`, `refunds`, `checkout`, `payment_links`, `invoices`, `risk`, `subscriptions`, `reports`, `webhooks`, `balance`, `sandbox` and `docs`.
- **Read-only** exposes only the tools that change nothing: lists, lookups, the balance and reports.
- **`--no-docs`** leaves out the docs tools, the guide resources and the prompts.

For example, a read-only agent for your support team that can only look up payments and customers:

```bash
PLETOPAY_SECRET_KEY=sk_live_… npx -y @pletopay/mcp --read-only --toolsets payments,customers,docs
```

## Money movement

Secret keys can do everything in their mode (there are [no restricted keys](/authentication)), so the MCP server adds its own safeguards:

- **With a live key, money movement is off.** The tools that send money or change where it goes are not offered at all: `create_transfer`, `create_refund`, `create_subaccount`, `update_subaccount`, `create_split_rule` and `update_split_rule`. Turn them on with `--enable-money-movement` (or the `X-PletoPay-MCP-Money-Movement: enabled` header) only when you mean to. With a test key they are always available.
- **Transfers and refunds need an `idempotency_key`.** The agent chooses it and sends the same key if it retries, so a retried call returns the original transfer instead of sending money twice. See [Idempotency](/idempotency).
- **Tools are labelled.** Read-only, destructive and money-moving tools carry MCP annotations, so clients can ask you to approve a call before it runs. Keep approvals on for live keys.
- **Read-only beats everything.** A server started with `--read-only` stays read-only, whatever a request's headers say.

The agent works with your key's full access within what these switches allow. Review what it proposes before approving a change in live mode, as you would for a colleague.

## Resources and prompts

| Resource | What it holds |
|---|---|
| `pletopay://webhooks/events` | Every [webhook](/webhooks) event type and the object it carries |
| `pletopay://errors` | Every [error](/errors) code, its HTTP status and when it happens |
| `pletopay://schemas/{name}` | The JSON Schema of an object, such as `Payment` or `Transfer` |
| `pletopay://docs/{slug}` | A guide from this site, as markdown |
| `pletopay://openapi/public.v1.yaml` | The full API contract (large) |

| Prompt | What it does |
|---|---|
| `reconcile_collections` | Matches the payments received in a period against settlements and the balance statement |
| `investigate_payment` | Explains what happened to a payment: amounts, status, events and webhook deliveries |
| `investigate_failed_transfer` | Finds out why a transfer failed and checks the funds came back |
| `set_up_webhooks` | Registers an endpoint, sends it a test event and shows how to verify signatures |

## Try it in test mode

With your test key connected, ask the agent:

1. "Create a customer called Ada Obi and give her a dedicated virtual account."
2. "Simulate a ₦10,000 transfer into that account, then show me the payment and my balance."
3. "List the sandbox test values, then send ₦1,000 to account 0100000003 at GTBank and tell me what happens."
4. "Set up a webhook endpoint at https://example.com/webhooks for payment events."

## Troubleshooting

- **The server doesn't start**: check the key starts with `sk_test_` or `sk_live_`. Publishable keys (`pk_…`) can't call the API.
- **A tool is missing**: it may be outside the toolsets you chose, change something while the server is read-only, move money with a live key, or (for the sandbox tools) need a test key. Calling it by name returns the reason.
- **`401 authentication_error`**: the key was rolled or is wrong. Copy it again from **Settings → Developers → API keys**.
- **`403 ip_address_not_allowed`**: your IP allowlist doesn't include the address the calls come from. See the note under [Use the hosted server](#use-the-hosted-server).
- **Errors in general**: tool errors carry the API's `type`, `code` and `request_id`. Quote the `request_id` if you contact support. See [Errors](/errors).
