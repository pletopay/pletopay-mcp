# Pletopay MCP server

`@pletopay/mcp` is the official [Model Context Protocol](https://modelcontextprotocol.io) server for the [Pletopay API](https://docs.pletopay.com). It lets AI agents (Claude Desktop, Claude Code, Cursor, VS Code and any other MCP client) work with a Pletopay account: payments, virtual accounts, customers, transfers, refunds, settlements, checkout, payment links, invoices, subscriptions, reports, webhooks and the sandbox.

- **One tool per API operation** (83), generated from the published API contract, grouped into toolsets.
- **Safe by default in live mode**: tools that send money or change where it goes are hidden from live keys until you enable them; transfers and refunds take a required `idempotency_key`, so a retried call never pays twice; `--read-only` exposes lookups only.
- **Docs and reference built in**: `search_docs` / `get_doc` over the Pletopay guides (offline), resources for webhook event types, error codes and object schemas, and prompts for common workflows.
- **Runs locally over stdio** (`npx -y @pletopay/mcp`) or as a **stateless Streamable HTTP** server where every request brings its own key.

Full guide: [docs.pletopay.com/mcp](https://docs.pletopay.com/mcp).

## Quick start

Start with your test key (`sk_test_…`, Dashboard → Settings → Developers → API keys).

**Claude Code**

```bash
claude mcp add pletopay --env PLETOPAY_SECRET_KEY=sk_test_… -- npx -y @pletopay/mcp
```

**Claude Desktop, Cursor and other clients** (`claude_desktop_config.json`, `.cursor/mcp.json`, …)

```json
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

Requires Node.js 24 or newer. Pass the key in the environment rather than with `--api-key`: command-line arguments are visible to other users of the machine.

## Options

| Flag                      | Environment                               | HTTP header                              | Default                                    |
| ------------------------- | ----------------------------------------- | ---------------------------------------- | ------------------------------------------ |
| `--api-key <key>`         | `PLETOPAY_SECRET_KEY`                     | `Authorization: Bearer sk_…` (required)  | –                                          |
| `--toolsets <list>`       | `PLETOPAY_MCP_TOOLSETS`                   | `X-PletoPay-MCP-Toolsets`                | `all`                                      |
| `--read-only`             | `PLETOPAY_MCP_READ_ONLY=true`             | `X-PletoPay-MCP-Read-Only: true`         | off                                        |
| `--enable-money-movement` | `PLETOPAY_MCP_ENABLE_MONEY_MOVEMENT=true` | `X-PletoPay-MCP-Money-Movement: enabled` | off for live keys                          |
| `--no-docs`               | –                                         | –                                        | docs tools, guide resources and prompts on |
| `--api-url <url>`         | `PLETOPAY_API_URL`                        | (server setting)                         | `https://api.pletopay.com`                 |

Toolsets: `customers`, `payments`, `virtual_accounts`, `subaccounts`, `transfers`, `settlements`, `refunds`, `checkout`, `payment_links`, `invoices`, `risk`, `subscriptions`, `reports`, `webhooks`, `balance`, `sandbox`, `docs`.

Run `npx -y @pletopay/mcp --help` for the full list.

## Money movement

Pletopay secret keys have full access within their mode, so the server adds its own guardrails:

|                                                                                                                                | Test key | Live key | Live key + `--enable-money-movement` |
| ------------------------------------------------------------------------------------------------------------------------------ | -------- | -------- | ------------------------------------ |
| Reads (lists, lookups, balance, reports)                                                                                       | ✓        | ✓        | ✓                                    |
| Writes (customers, payments, virtual accounts, invoices, webhooks, …)                                                          | ✓        | ✓        | ✓                                    |
| Money (`create_transfer`, `create_refund`, `create_subaccount`, `update_subaccount`, `create_split_rule`, `update_split_rule`) | ✓        | –        | ✓                                    |
| Sandbox (`simulate_transfer`, `list_sandbox_test_values`)                                                                      | ✓        | –        | –                                    |

`--read-only` removes every write and money tool whatever else is set. Hidden tools are not listed, and calling one by name returns the reason instead of calling the API. Tools carry MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) so clients can ask for approval before a change.

## Tools, resources and prompts

- **Tools**: one per API operation, named after its operationId in snake_case (`list_payments`, `get_payment_by_reference`, `create_virtual_account`, `simulate_transfer`, `create_transfer`, …), with the operation's fields as arguments. List tools take `limit`, `starting_after` and filters such as `created: { gte, lte }`; results include `meta.has_more` and `meta.next_cursor`. Results are the API's `data` plus the `request_id`; errors carry `type`, `code`, `param` and `request_id`. Plus `search_docs` and `get_doc`.
- **Resources**: `pletopay://webhooks/events`, `pletopay://errors`, `pletopay://schemas/{name}`, `pletopay://docs/{slug}` and `pletopay://openapi/public.v1.yaml` (large).
- **Prompts**: `reconcile_collections`, `investigate_payment`, `investigate_failed_transfer`, `set_up_webhooks`.

## Remote (Streamable HTTP)

```bash
npx -y @pletopay/mcp --transport http --port 3010
```

`POST /mcp` is stateless: each request authenticates with its own `Authorization: Bearer sk_…` and gets a fresh server bound to that key; nothing is stored. `GET /healthz` reports health. Headers can narrow the toolsets and force read-only (never undo a server's `--read-only`) and can enable money movement.

Hardening: Host allowlist against DNS rebinding (`MCP_ALLOWED_HOSTS`, required when binding to a non-loopback address), browser Origin allowlist (`MCP_ALLOWED_ORIGINS`, default none), a per-IP rate limit before authentication (`MCP_RATE_LIMIT_PER_MINUTE`, default 300; set `MCP_TRUST_PROXY_HOPS` behind a proxy), a 1 MB body limit, and a structured access log that never contains keys or bodies. Each request id is sent to the API as `X-Correlation-Id`. Put it behind TLS.

The caller's address is not forwarded: if a merchant uses an IP allowlist, API calls through a hosted server come from that server's address.

### Docker

`@pletopay/node` is bundled into the build and not yet on npm, so build from the folder that holds both repos:

```bash
docker build -f pletopay-mcp/Dockerfile -t pletopay-mcp .
docker run -p 3010:3010 -e MCP_ALLOWED_HOSTS=mcp.example.com -e MCP_TRUST_PROXY_HOPS=1 pletopay-mcp
```

Never give the container a `PLETOPAY_SECRET_KEY`. `deploy/do-app.example.yaml` is an App Platform spec for a pre-built image.

## Library use

```ts
import { createPletopayMcpServer, createHttpApp } from '@pletopay/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = createPletopayMcpServer({ secretKey: process.env.PLETOPAY_SECRET_KEY!, readOnly: true });
await server.connect(new StdioServerTransport());
```

`createHttpApp(options)` returns the Express app used by `--transport http`, to mount in your own server.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md). `pnpm verify` runs lint, formatting, types, the spec/docs/generated-code drift checks, the brand check, unit tests and package checks; `pnpm test:live` runs the live suite against a local API in test mode.

## License

MIT
