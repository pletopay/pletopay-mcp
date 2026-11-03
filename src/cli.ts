import { parseArgs } from 'node:util';
import { ConfigError, parseFlag, parseToolsets, secretKeyMode } from './config';
import type { PletopayMcpOptions } from './config';
import type { HttpOptions } from './http';
import { TOOLSETS } from './policy';
import { VERSION } from './version';

export const USAGE = `Pletopay MCP server ${VERSION}

Usage: pletopay-mcp [options]

Runs over stdio by default (for Claude Desktop, Claude Code, Cursor and other MCP clients).

Options:
  --api-key <key>            Secret key, sk_test_… or sk_live_… (prefer the PLETOPAY_SECRET_KEY
                             environment variable: arguments are visible to other local users)
  --toolsets <list>          Comma-separated tool groups, or "all" (default). One of:
                             ${TOOLSETS.join(', ')}
  --read-only                Only expose tools that change nothing
  --enable-money-movement    Let a live key send transfers and refunds and change subaccounts and
                             split rules (always available to test keys)
  --no-docs                  Leave out the docs search tools, docs resources and prompts
  --api-url <url>            API base URL (default https://api.pletopay.com)
  --transport <stdio|http>   stdio (default) or Streamable HTTP; over HTTP every request brings its
                             own key in "Authorization: Bearer sk_…"
  --host <host>              HTTP bind address (default 127.0.0.1)
  --port <port>              HTTP port (default 3010, or PORT)
  -h, --help                 Show this help
  -v, --version              Show the version

Environment:
  PLETOPAY_SECRET_KEY, PLETOPAY_API_URL, PLETOPAY_MCP_TOOLSETS, PLETOPAY_MCP_READ_ONLY,
  PLETOPAY_MCP_ENABLE_MONEY_MOVEMENT

HTTP transport:
  PORT                       Port when --port is not given
  MCP_ALLOWED_HOSTS          Hostnames the Host header may name (required off loopback)
  MCP_ALLOWED_ORIGINS        Browser origins allowed to call the server (default: none)
  MCP_TRUST_PROXY_HOPS       Reverse proxies in front of the server (default 0)
  MCP_RATE_LIMIT_PER_MINUTE  Requests per minute per client IP (default 300)

  Clients send "Authorization: Bearer sk_…" and may add X-PletoPay-MCP-Toolsets,
  X-PletoPay-MCP-Read-Only: true and X-PletoPay-MCP-Money-Movement: enabled.
`;

export type CliCommand =
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'stdio'; options: PletopayMcpOptions }
  | { kind: 'http'; port: number; http: HttpOptions & { host: string } };

const list = (value: string | undefined): string[] | undefined => {
  const items = (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
};

function nonNegativeInteger(name: string, value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new ConfigError(`${name} must be a whole number: ${value}`);
  return number;
}

/** Parses argv and the environment. Throws `ConfigError` with a message that is safe to print. */
export function parseCli(argv: string[], env: NodeJS.ProcessEnv): CliCommand {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        'api-key': { type: 'string' },
        'api-url': { type: 'string' },
        toolsets: { type: 'string' },
        'read-only': { type: 'boolean' },
        'enable-money-movement': { type: 'boolean' },
        'no-docs': { type: 'boolean' },
        transport: { type: 'string' },
        host: { type: 'string' },
        port: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    }));
  } catch (error) {
    throw new ConfigError(`${error instanceof Error ? error.message : String(error)}\nRun pletopay-mcp --help.`);
  }
  if (values.help) return { kind: 'help' };
  if (values.version) return { kind: 'version' };

  const apiUrl = values['api-url'] ?? env.PLETOPAY_API_URL;
  if (apiUrl !== undefined) {
    let url: URL;
    try {
      url = new URL(apiUrl);
    } catch {
      throw new ConfigError(`--api-url is not a URL: ${apiUrl}`);
    }
    const local = ['localhost', '127.0.0.1', '[::1]', 'host.docker.internal'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
      throw new ConfigError('--api-url must use https (plain http is only allowed for localhost).');
    }
  }

  const defaults: Omit<PletopayMcpOptions, 'secretKey'> = {
    ...(apiUrl ? { apiUrl } : {}),
    toolsets: parseToolsets(values.toolsets ?? env.PLETOPAY_MCP_TOOLSETS),
    readOnly: values['read-only'] === true || parseFlag(env.PLETOPAY_MCP_READ_ONLY),
    enableMoneyMovement: values['enable-money-movement'] === true || parseFlag(env.PLETOPAY_MCP_ENABLE_MONEY_MOVEMENT),
    docs: values['no-docs'] !== true,
  };

  const transport = values.transport ?? 'stdio';
  if (transport === 'http') {
    if (values['api-key']) {
      throw new ConfigError('--api-key is not used over HTTP: each request sends its own key as a Bearer token.');
    }
    const portText = values.port ?? env.PORT ?? '3010';
    const port = Number(portText);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new ConfigError(`Invalid port: ${portText}`);
    const allowedHosts = list(env.MCP_ALLOWED_HOSTS);
    const allowedOrigins = list(env.MCP_ALLOWED_ORIGINS);
    const trustProxyHops = nonNegativeInteger('MCP_TRUST_PROXY_HOPS', env.MCP_TRUST_PROXY_HOPS);
    const rateLimitPerMinute = nonNegativeInteger('MCP_RATE_LIMIT_PER_MINUTE', env.MCP_RATE_LIMIT_PER_MINUTE);
    return {
      kind: 'http',
      port,
      http: {
        host: values.host ?? '127.0.0.1',
        defaults,
        ...(allowedHosts ? { allowedHosts } : {}),
        ...(allowedOrigins ? { allowedOrigins } : {}),
        ...(trustProxyHops !== undefined ? { trustProxyHops } : {}),
        ...(rateLimitPerMinute !== undefined ? { rateLimitPerMinute } : {}),
      },
    };
  }
  if (transport !== 'stdio') throw new ConfigError(`Unknown transport "${transport}". Use stdio or http.`);

  const secretKey = values['api-key'] ?? env.PLETOPAY_SECRET_KEY;
  secretKeyMode(secretKey);
  return { kind: 'stdio', options: { ...defaults, secretKey: secretKey as string } };
}
