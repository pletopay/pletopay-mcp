# Security

Please report vulnerabilities in this server or in the Pletopay API privately to security@pletopay.com. Do not open a public issue. We acknowledge reports within two business days.

## Using the MCP server safely

- Start with a test key. Give an agent a live key only when you need it, with `--read-only` or narrow `--toolsets` where you can.
- Leave money movement off for live keys unless you mean to send money through the agent, and keep your client's tool-approval prompts on.
- Pass the key in `PLETOPAY_SECRET_KEY`, not `--api-key` (arguments are visible to other local users), and never commit a client config file that contains it.
- When hosting the HTTP transport: serve it over TLS, set `MCP_ALLOWED_HOSTS` to its public hostname, never set `PLETOPAY_SECRET_KEY` on the server, and set `MCP_TRUST_PROXY_HOPS` to the number of proxies in front of it.
- Treat what an agent reads from the API (customer names, descriptions, metadata) as untrusted text: review proposed changes before approving them in live mode.
- Keep the package up to date; releases are published to npm with provenance from this repository's release workflow.
