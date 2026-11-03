# Changelog

## 1.0.0 (2026-11-03)

- First release: a Model Context Protocol server for the Pletopay API.
- One tool per public API operation (83), generated from the API contract, grouped into toolsets.
- Money movement (transfers, refunds, subaccount and split rule changes) is hidden from live keys
  unless explicitly enabled; test keys always have it. `--read-only` exposes reads only.
- Transfers and refunds take a required `idempotency_key`, so a retried tool call never pays twice.
- Runs over stdio (`npx -y @pletopay/mcp`) or stateless Streamable HTTP (`--transport http`), where
  every request authenticates with its own `Authorization: Bearer sk_…` and may narrow the tools
  with `X-PletoPay-MCP-*` headers. Host and Origin allowlists, a per-IP rate limit, a 1 MB body
  limit, and logs that never contain keys or bodies. Dockerfile for the hosted deployment.
- Docs: `search_docs` and `get_doc` tools over the bundled guides (offline), one
  `pletopay://docs/…` resource per guide.
- Resources: webhook event types, error codes, object schemas (`pletopay://schemas/…`) and the
  full API contract.
- Prompts: `reconcile_collections`, `investigate_payment`, `investigate_failed_transfer`,
  `set_up_webhooks`.
