import { randomUUID } from 'node:crypto';
import type { Server as NodeHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { hostHeaderValidation } from '@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import type { ErrorRequestHandler, Express, Request, RequestHandler, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ConfigError, parseFlag, parseToolsets, secretKeyMode } from './config';
import type { PletopayMcpOptions } from './config';
import type { Toolset } from './policy';
import { createPletopayMcpServer } from './server';
import { VERSION } from './version';

/** Per-request switches a client can send. They can only narrow the server's own settings, except money movement. */
export const HEADER_TOOLSETS = 'x-pletopay-mcp-toolsets';
export const HEADER_READ_ONLY = 'x-pletopay-mcp-read-only';
export const HEADER_MONEY_MOVEMENT = 'x-pletopay-mcp-money-movement';

export interface HttpOptions {
  /** Server-wide settings (API URL, toolsets, read-only, …); every request uses its own key. */
  defaults?: Omit<PletopayMcpOptions, 'secretKey'>;
  /** The address the server binds to. Loopback addresses get DNS rebinding protection automatically. */
  host?: string;
  /**
   * Hostnames the Host header may name. Required when binding to a non-loopback address; `['*']`
   * turns the check off (only behind a proxy that already pins the Host).
   */
  allowedHosts?: string[];
  /** Browser origins allowed to call the server. Requests with any other Origin header are refused. */
  allowedOrigins?: string[];
  /** Reverse proxies in front of the server, for the client IP the rate limit uses. Default 0. */
  trustProxyHops?: number;
  /** Requests per minute per client IP, counted before authentication. Default 300. */
  rateLimitPerMinute?: number;
  /** Receives one structured line per request. Never contains keys or bodies. Default: JSON on stderr. */
  log?: (entry: Record<string, unknown>) => void;
}

const LOOPBACK = ['localhost', '127.0.0.1', '::1', '[::1]'];

const jsonRpcError = (res: Response, status: number, code: number, message: string): void => {
  res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null });
};

/** Reads the per-request switches. Headers may narrow toolsets and force read-only; they may enable money movement. */
export function optionsFromHeaders(
  headers: Request['headers'],
  defaults: Omit<PletopayMcpOptions, 'secretKey'>,
): Omit<PletopayMcpOptions, 'secretKey'> {
  const header = (name: string): string | undefined => {
    const value = headers[name];
    return Array.isArray(value) ? value.join(',') : value;
  };
  const base = defaults.toolsets ?? 'all';
  const requested = parseToolsets(header(HEADER_TOOLSETS));
  let toolsets: 'all' | Toolset[];
  if (requested === 'all') toolsets = base === 'all' ? 'all' : [...base];
  else toolsets = base === 'all' ? requested : requested.filter((toolset) => base.includes(toolset));
  return {
    ...defaults,
    toolsets,
    readOnly: defaults.readOnly === true || parseFlag(header(HEADER_READ_ONLY)),
    enableMoneyMovement: defaults.enableMoneyMovement === true || parseFlag(header(HEADER_MONEY_MOVEMENT)),
  };
}

function bearerKey(req: Request): string | undefined {
  const match = /^Bearer[ ]+(\S+)\s*$/i.exec(req.headers.authorization ?? '');
  return match?.[1];
}

/**
 * The Streamable HTTP app: `POST /mcp` (stateless; each request authenticates with its own
 * `Authorization: Bearer sk_…`), `GET /healthz`. Mount it behind TLS.
 */
export function createHttpApp(options: HttpOptions = {}): Express {
  const defaults = options.defaults ?? {};
  const host = options.host ?? '127.0.0.1';
  const log = options.log ?? ((entry) => process.stderr.write(`${JSON.stringify(entry)}\n`));
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', options.trustProxyHops ?? 0);

  // Request id and access log first, so refused requests are logged too.
  app.use((req, res, next) => {
    const started = Date.now();
    const requestId = randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.on('finish', () => {
      log({
        time: new Date().toISOString(),
        request_id: requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: Date.now() - started,
        ip: req.ip,
        ...(res.locals.mode ? { mode: res.locals.mode as string } : {}),
        ...(res.locals.rpcMethod ? { rpc_method: res.locals.rpcMethod as string } : {}),
      });
    });
    next();
  });

  // Before the Host check: platform and container health probes call it by IP. It reveals only the version.
  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', version: VERSION });
  });

  // DNS rebinding: the Host header must name this server.
  const allowedHosts = options.allowedHosts?.filter(Boolean);
  if (allowedHosts?.length) {
    if (!allowedHosts.includes('*')) app.use(hostHeaderValidation(allowedHosts));
  } else if (LOOPBACK.includes(host)) {
    app.use(hostHeaderValidation(['localhost', '127.0.0.1', '[::1]']));
  } else {
    throw new ConfigError(
      `Binding to ${host} needs MCP_ALLOWED_HOSTS (the public hostname, e.g. mcp.pletopay.com) to protect against DNS rebinding.`,
    );
  }

  // Browsers always send Origin; MCP clients don't. Refuse pages we didn't allow.
  const allowedOrigins = new Set(options.allowedOrigins?.filter(Boolean) ?? []);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin !== undefined && !allowedOrigins.has(origin)) {
      jsonRpcError(res, 403, -32000, 'Origin not allowed');
      return;
    }
    next();
  });

  const limiter = rateLimit({
    windowMs: 60000,
    limit: options.rateLimitPerMinute ?? 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => jsonRpcError(res, 429, -32000, 'Too many requests. Retry after the indicated delay.'),
  });

  const authenticate: RequestHandler = (req, res, next) => {
    const secretKey = bearerKey(req);
    try {
      res.locals.mode = secretKeyMode(secretKey);
    } catch (error) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="pletopay-mcp", error="invalid_token"');
      const message =
        error instanceof ConfigError && secretKey !== undefined
          ? error.message
          : 'Send your Pletopay secret key as "Authorization: Bearer sk_test_…" (or sk_live_…).';
      jsonRpcError(res, 401, -32001, message);
      return;
    }
    res.locals.secretKey = secretKey;
    next();
  };

  app.post('/mcp', limiter, authenticate, express.json({ limit: '1mb' }), async (req, res) => {
    let serverOptions: PletopayMcpOptions;
    try {
      serverOptions = {
        ...optionsFromHeaders(req.headers, defaults),
        secretKey: res.locals.secretKey as string,
        correlationId: res.locals.requestId as string,
      };
    } catch (error) {
      if (error instanceof ConfigError) {
        jsonRpcError(res, 400, -32602, error.message);
        return;
      }
      throw error;
    }
    const body: unknown = req.body;
    const first: unknown = Array.isArray(body) ? body[0] : body;
    if (first && typeof first === 'object' && 'method' in first && typeof first.method === 'string') {
      res.locals.rpcMethod = first.method;
    }

    // Stateless: a fresh server and transport per request, bound to this request's key only.
    const server = createPletopayMcpServer(serverOptions);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  });

  // No sessions and no server-initiated streams.
  app.all('/mcp', (_req, res) => {
    res.setHeader('Allow', 'POST');
    jsonRpcError(res, 405, -32000, 'Method not allowed. This server is stateless: send JSON-RPC requests with POST.');
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found. The MCP endpoint is POST /mcp.' });
  });

  const onError: ErrorRequestHandler = (error: { type?: string; status?: number }, _req, res, _next) => {
    if (res.headersSent) return;
    if (error.type === 'entity.too.large') jsonRpcError(res, 413, -32600, 'Request body too large (limit 1 MB).');
    else if (error.type === 'entity.parse.failed') jsonRpcError(res, 400, -32700, 'Parse error: invalid JSON.');
    else jsonRpcError(res, 500, -32603, 'Internal error.');
  };
  app.use(onError);

  return app;
}

/** Starts the HTTP server. Resolves once it is listening. */
export async function startHttpServer(
  options: HttpOptions & { port: number },
): Promise<{ url: string; server: NodeHttpServer; close: () => Promise<void> }> {
  const app = createHttpApp(options);
  const host = options.host ?? '127.0.0.1';
  const server = await new Promise<NodeHttpServer>((resolve, reject) => {
    const listening = app.listen(options.port, host, () => resolve(listening));
    listening.once('error', reject);
  });
  // Tool calls may wait on the API (with retries); keep connections longer than a proxy's idle timeout.
  server.requestTimeout = 120000;
  server.keepAliveTimeout = 65000;
  const { port } = server.address() as AddressInfo;
  const urlHost = host.includes(':') ? `[${host}]` : host;
  return {
    url: `http://${urlHost}:${port}`,
    server,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
