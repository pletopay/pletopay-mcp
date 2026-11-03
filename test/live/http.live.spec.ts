import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHttpServer } from '../../src/http';
import { API_URL, LIVE, SECRET_KEY, callJson } from './setup';

describe.skipIf(!LIVE)('HTTP server against the live API (test mode)', () => {
  let close: () => Promise<void>;
  let endpoint: URL;

  beforeAll(async () => {
    const started = await startHttpServer({ port: 0, defaults: { apiUrl: API_URL }, log: () => undefined });
    close = started.close;
    endpoint = new URL(`${started.url}/mcp`);
  });
  afterAll(async () => {
    await close?.();
  });

  async function connect(headers: Record<string, string>) {
    const client = new Client({ name: 'live-http-test', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(endpoint, { requestInit: { headers } }));
    return client;
  }

  it('reads the balance and recent transfers with the bearer key', async () => {
    const client = await connect({ authorization: `Bearer ${SECRET_KEY}` });
    const balance = await callJson<{ data: { object: string } }>(client, 'get_balance');
    expect(balance.data.object).toBe('balance');
    const transfers = await callJson<{ data: unknown[]; meta: { has_more: boolean } }>(client, 'list_transfers', {
      limit: 2,
    });
    expect(Array.isArray(transfers.data)).toBe(true);
    expect(transfers.meta).toHaveProperty('has_more');
    await client.close();
  });

  it('honours a read-only header', async () => {
    const client = await connect({ authorization: `Bearer ${SECRET_KEY}`, 'x-pletopay-mcp-read-only': 'true' });
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names).toContain('list_payments');
    expect(names).not.toContain('create_transfer');
    await client.close();
  });

  it('is refused by the API for a revoked or unknown key', async () => {
    const client = await connect({ authorization: `Bearer sk_test_${'x'.repeat(16)}_${'y'.repeat(40)}` });
    const result = await client.callTool({ name: 'get_balance', arguments: {} });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/authentication_error/);
    await client.close();
  });
});
