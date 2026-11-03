import { request as httpRequest } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError } from '../../src/config';
import { createHttpApp, startHttpServer } from '../../src/http';
import type { HttpOptions } from '../../src/http';
import { LIVE_KEY, TEST_KEY, fakeFetch, resultJson } from './helpers';

const running: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(running.splice(0).map((close) => close()));
});

async function start(options: Partial<HttpOptions> = {}) {
  const api = fakeFetch(() => ({ data: { object: 'balance', available: 100 } }));
  const logs: Record<string, unknown>[] = [];
  const { url, close } = await startHttpServer({
    port: 0,
    log: (entry) => logs.push(entry),
    ...options,
    defaults: { apiUrl: 'https://api.example.test', maxRetries: 0, fetch: api.fetch, ...options.defaults },
  });
  running.push(close);
  return { url, endpoint: `${url}/mcp`, api, logs };
}

async function mcpClient(endpoint: string, headers: Record<string, string>) {
  const client = new Client({ name: 'http-test', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint), { requestInit: { headers } }));
  running.push(() => client.close());
  return client;
}

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'raw', version: '0' } },
};

function post(endpoint: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

/** node:http, because fetch won't let a test choose the Host header. */
function rawPost(endpoint: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(endpoint, { method: 'POST', headers }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => (body += chunk.toString()));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end(JSON.stringify(initialize));
  });
}

describe('the HTTP transport', () => {
  it('serves a stateless round trip with the key of each request', async () => {
    const { endpoint, api, logs } = await start();
    const client = await mcpClient(endpoint, { authorization: `Bearer ${TEST_KEY}`, 'x-forwarded-for': '203.0.113.9' });
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(80);
    const result = (await client.callTool({ name: 'get_balance', arguments: {} })) as CallToolResult;
    expect(resultJson(result)).toMatchObject({ data: { object: 'balance' } });

    const [apiRequest] = api.requests;
    expect(apiRequest?.headers.get('authorization')).toBe(`Bearer ${TEST_KEY}`);
    // The caller's address is never passed on: the API's IP allowlist sees this server, not the client.
    expect(apiRequest?.headers.get('x-forwarded-for')).toBeNull();
    const callLog = logs.find((entry) => entry.rpc_method === 'tools/call');
    expect(apiRequest?.headers.get('x-correlation-id')).toBe(callLog?.request_id);
    expect(callLog).toMatchObject({ status: 200, mode: 'test', path: '/mcp' });
  });

  it('keeps keys apart: a live key never sees what a test key sees', async () => {
    const { endpoint } = await start();
    const [test, live] = await Promise.all([
      mcpClient(endpoint, { authorization: `Bearer ${TEST_KEY}` }),
      mcpClient(endpoint, { authorization: `Bearer ${LIVE_KEY}` }),
    ]);
    const [testTools, liveTools] = await Promise.all([test.listTools(), live.listTools()]);
    expect(testTools.tools.map((tool) => tool.name)).toContain('create_transfer');
    expect(liveTools.tools.map((tool) => tool.name)).not.toContain('create_transfer');
  });

  it('applies the per-request switches, which narrow the server settings but cannot widen them', async () => {
    const { endpoint } = await start({ defaults: { toolsets: ['transfers', 'balance', 'payments'] } });
    const names = async (headers: Record<string, string>) =>
      (await (await mcpClient(endpoint, headers)).listTools()).tools.map((tool) => tool.name);

    const live = { authorization: `Bearer ${LIVE_KEY}` };
    expect(await names(live)).not.toContain('create_transfer');
    expect(await names({ ...live, 'x-pletopay-mcp-money-movement': 'enabled' })).toContain('create_transfer');
    const narrowed = await names({ ...live, 'x-pletopay-mcp-toolsets': 'balance,refunds' });
    expect(narrowed.sort()).toEqual(['get_balance', 'list_transactions']);
    const readOnly = await names({ ...live, 'x-pletopay-mcp-read-only': 'true' });
    expect(readOnly).not.toContain('create_payment');
    expect(readOnly).toContain('list_payments');
  });

  it('keeps a read-only server read-only whatever the headers say', async () => {
    const { endpoint } = await start({ defaults: { readOnly: true } });
    const client = await mcpClient(endpoint, {
      authorization: `Bearer ${TEST_KEY}`,
      'x-pletopay-mcp-read-only': 'false',
      'x-pletopay-mcp-money-movement': 'enabled',
    });
    const { tools } = await client.listTools();
    expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
  });

  it('rejects a bad toolset header', async () => {
    const { endpoint } = await start();
    const res = await post(endpoint, initialize, {
      authorization: `Bearer ${TEST_KEY}`,
      'x-pletopay-mcp-toolsets': 'payments,everything',
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/Unknown toolset everything/);
  });
});

describe('HTTP authentication', () => {
  it.each([
    ['no key', {}, /Send your Pletopay secret key/],
    ['a publishable key', { authorization: 'Bearer pk_test_abc' }, /publishable key/],
    ['a malformed key', { authorization: 'Bearer sk_test_bad key-shape!' }, /secret key/],
    ['a non-bearer scheme', { authorization: `Basic ${TEST_KEY}` }, /Send your Pletopay secret key/],
  ])('refuses %s with 401 and a Bearer challenge', async (_label, headers, message) => {
    const { endpoint, api } = await start();
    const res = await post(endpoint, initialize, headers);
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toMatch(/^Bearer /);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(message);
    expect(api.requests).toHaveLength(0);
  });

  it('never writes a key to the log', async () => {
    const { endpoint, logs } = await start();
    await post(endpoint, initialize, { authorization: `Bearer ${TEST_KEY}` });
    await post(endpoint, initialize, { authorization: 'Bearer pk_live_leaky' });
    expect(logs).toHaveLength(2);
    expect(JSON.stringify(logs)).not.toMatch(/sk_test_|pk_live_/);
  });
});

describe('HTTP hardening', () => {
  it('refuses a Host header that does not name this server (DNS rebinding)', async () => {
    const { endpoint } = await start();
    const res = await rawPost(endpoint, {
      host: 'attacker.example',
      'content-type': 'application/json',
      authorization: `Bearer ${TEST_KEY}`,
    });
    expect(res.status).toBe(403);
    expect(res.body).toMatch(/Invalid Host/);
  });

  it('accepts the configured public hostname', async () => {
    const { endpoint } = await start({ allowedHosts: ['mcp.pletopay.com'] });
    const res = await rawPost(endpoint, {
      host: 'mcp.pletopay.com',
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${TEST_KEY}`,
    });
    expect(res.status).toBe(200);
  });

  it('answers health probes addressed by IP', async () => {
    const { url } = await start({ allowedHosts: ['mcp.pletopay.com'] });
    expect((await fetch(`${url}/healthz`)).status).toBe(200);
    expect((await fetch(`${url}/admin`)).status).toBe(403);
  });

  it('will not bind to a public address without an allowed host list', () => {
    expect(() => createHttpApp({ host: '0.0.0.0' })).toThrow(ConfigError);
    expect(() => createHttpApp({ host: '0.0.0.0', allowedHosts: ['mcp.pletopay.com'] })).not.toThrow();
  });

  it('refuses browser origins it was not told about', async () => {
    const { endpoint } = await start({ allowedOrigins: ['https://dashboard.pletopay.com'] });
    const evil = await post(endpoint, initialize, {
      authorization: `Bearer ${TEST_KEY}`,
      origin: 'https://evil.example',
    });
    expect(evil.status).toBe(403);
    const allowed = await post(endpoint, initialize, {
      authorization: `Bearer ${TEST_KEY}`,
      origin: 'https://dashboard.pletopay.com',
    });
    expect(allowed.status).toBe(200);
  });

  it('answers 405 to GET and DELETE: there are no sessions or server streams', async () => {
    const { endpoint } = await start();
    for (const method of ['GET', 'DELETE']) {
      const res = await fetch(endpoint, { method, headers: { authorization: `Bearer ${TEST_KEY}` } });
      expect(res.status).toBe(405);
      expect(res.headers.get('allow')).toBe('POST');
    }
  });

  it('limits body size and rejects invalid JSON', async () => {
    const { endpoint } = await start();
    const auth = { authorization: `Bearer ${TEST_KEY}` };
    const big = await post(endpoint, { ...initialize, padding: 'x'.repeat(1100000) }, auth);
    expect(big.status).toBe(413);
    const broken = await post(endpoint, '{"jsonrpc":', auth);
    expect(broken.status).toBe(400);
    expect(await broken.text()).toMatch(/Parse error/);
  });

  it('rate-limits each client address before authenticating', async () => {
    const { endpoint } = await start({ rateLimitPerMinute: 2 });
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await post(endpoint, initialize, {})).status);
    expect(statuses).toEqual([401, 401, 429]);
  });

  it('reports health and sends no-store, nosniff and a request id', async () => {
    const { url } = await start();
    const res = await fetch(`${url}/healthz`);
    expect(await res.json()).toEqual({ status: 'ok', version: '1.0.0' });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get('x-powered-by')).toBeNull();
    expect((await fetch(`${url}/admin`)).status).toBe(404);
  });
});
