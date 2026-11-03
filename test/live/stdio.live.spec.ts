import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API_URL, LIVE, SECRET_KEY, callJson, poll, unique } from './setup';

interface Page<T> {
  data: T[];
  meta?: { has_more: boolean; next_cursor: string | null };
}
type Obj = Record<string, unknown> & { id: string };

// The built bin, as merchants run it (pnpm test:live builds first).
const BIN = fileURLToPath(new URL('../../dist/bin.js', import.meta.url));

describe.skipIf(!LIVE)('stdio server against the live API (test mode)', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ name: 'live-test', version: '0.0.0' });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [BIN],
        env: { PLETOPAY_SECRET_KEY: SECRET_KEY, PLETOPAY_API_URL: API_URL, PATH: process.env.PATH ?? '' },
        stderr: 'ignore',
      }),
    );
  });
  afterAll(async () => {
    await client?.close();
  });

  it('lists every tool, money movement included, for a test key', async () => {
    const names = (await client.listTools()).tools.map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(['create_transfer', 'simulate_transfer', 'search_docs']));
    expect(client.getInstructions()).toMatch(/test-mode secret key/);
  });

  it('collects a simulated bank transfer, then pays out and refuses to pay twice', async () => {
    const values = await callJson<{ data: { recipient_accounts: unknown[] } }>(client, 'list_sandbox_test_values');
    expect(values.data.recipient_accounts.length).toBeGreaterThan(0);

    const { data: customer } = await callJson<{ data: Obj }>(client, 'create_customer', {
      email: `${unique('mcp-live')}@example.com`,
      name: 'MCP Live Test',
    });
    const { data: account } = await callJson<{ data: Obj & { account_number: string } }>(
      client,
      'create_virtual_account',
      { type: 'dedicated', customer_id: customer.id },
    );
    expect(account.account_number).toMatch(/^\d{10}$/);

    await callJson(client, 'simulate_transfer', { account_number: account.account_number, amount: 1000000 });
    const payment = await poll(async () => {
      const page = await callJson<Page<Obj & { status: string }>>(client, 'list_payments', {
        virtual_account: account.id,
        limit: 5,
      });
      return page.data.find((candidate) => candidate.status === 'succeeded');
    });
    expect(payment.id).toMatch(/^pay_/);

    const balance = await poll(async () => {
      const { data } = await callJson<{ data: { available: number } }>(client, 'get_balance');
      return data.available >= 200000 ? data : undefined;
    });
    expect(balance.available).toBeGreaterThanOrEqual(200000);

    const { data: banks } = await callJson<{ data: Array<{ code: string }> }>(client, 'list_banks');
    const bankCode = banks.find((bank) => bank.code === '058')?.code ?? (banks[1] ?? banks[0])?.code;
    const beneficiary = { bank_code: bankCode, account_number: '0123456789' };
    const resolved = await callJson<{ data: { account_name: string } }>(client, 'resolve_account', beneficiary);
    expect(resolved.data.account_name).toBeTruthy();

    const transferArgs = {
      amount: 100000,
      currency: 'NGN',
      reference: unique('MCP-PAYOUT'),
      narration: 'MCP live test',
      beneficiary,
      idempotency_key: unique('mcp-idem'),
    };
    const first = await callJson<{ data: Obj & { status: string }; idempotency_key: string }>(
      client,
      'create_transfer',
      transferArgs,
    );
    expect(first.data.id).toMatch(/^trf_/);
    expect(first.idempotency_key).toBe(transferArgs.idempotency_key);

    // An agent retrying the same call with the same key gets the original transfer back.
    const retry = await callJson<{ data: Obj; idempotent_replayed?: boolean }>(client, 'create_transfer', transferArgs);
    expect(retry.data.id).toBe(first.data.id);
    expect(retry.idempotent_replayed).toBe(true);

    const settled = await poll(async () => {
      const { data } = await callJson<{ data: Obj & { status: string } }>(client, 'get_transfer', {
        id: first.data.id,
      });
      return data.status === 'succeeded' || data.status === 'failed' ? data : undefined;
    });
    expect(settled.status).toBe('succeeded');
    const byReference = await callJson<{ data: Obj }>(client, 'get_transfer_by_reference', {
      reference: transferArgs.reference,
    });
    expect(byReference.data.id).toBe(first.data.id);
  });

  it('returns API errors as tool errors', async () => {
    const result = (await client.callTool({
      name: 'get_payment',
      arguments: { id: 'pay_00000000000000000000000000' },
    })) as CallToolResult;
    expect(result.isError).toBe(true);
    const [first] = result.content;
    const body = JSON.parse(first?.type === 'text' ? first.text : '{}') as { error: Record<string, unknown> };
    expect(body.error).toMatchObject({ status: 404, type: 'not_found' });
    expect(body.error.request_id).toMatch(/^req_/);
  });

  it('serves the resources from the built package', async () => {
    const [spec] = (await client.readResource({ uri: 'pletopay://openapi/public.v1.yaml' })).contents;
    expect(spec && 'text' in spec ? spec.text : '').toMatch(/^openapi: 3\.1/);
  });
});
