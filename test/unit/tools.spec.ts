import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';
import { SPEC_OPERATIONS } from '../../src/generated/operations';
import { OPERATION_POLICY } from '../../src/policy';
import { LIVE_KEY, connect, resultJson } from './helpers';

const MONEY_TOOLS = [
  'create_transfer',
  'create_refund',
  'create_subaccount',
  'update_subaccount',
  'create_split_rule',
  'update_split_rule',
];
const SANDBOX_TOOLS = ['simulate_transfer', 'list_sandbox_test_values'];

async function toolNames(options: Parameters<typeof connect>[0]) {
  const { client } = await connect(options);
  const { tools } = await client.listTools();
  return tools.map((tool) => tool.name);
}

describe('tool visibility', () => {
  it('gives a test key every operation, money and sandbox included', async () => {
    const names = await toolNames({});
    expect(names).toHaveLength(SPEC_OPERATIONS.length + 2);
    expect(names).toEqual(expect.arrayContaining(['search_docs', 'get_doc']));
    for (const name of [...MONEY_TOOLS, ...SANDBOX_TOOLS]) expect(names).toContain(name);
  });

  it('hides money movement and sandbox tools from a live key by default', async () => {
    const names = await toolNames({ secretKey: LIVE_KEY });
    for (const name of [...MONEY_TOOLS, ...SANDBOX_TOOLS]) expect(names).not.toContain(name);
    expect(names).toContain('list_transfers');
    expect(names).toContain('create_payment');
    expect(names).toHaveLength(SPEC_OPERATIONS.length - MONEY_TOOLS.length - SANDBOX_TOOLS.length + 2);
  });

  it('lets a live key opt into money movement explicitly', async () => {
    const names = await toolNames({ secretKey: LIVE_KEY, enableMoneyMovement: true });
    for (const name of MONEY_TOOLS) expect(names).toContain(name);
    for (const name of SANDBOX_TOOLS) expect(names).not.toContain(name);
  });

  it('exposes only reads when read-only, even with money movement enabled', async () => {
    const names = await toolNames({ readOnly: true, enableMoneyMovement: true, docs: false });
    const reads = SPEC_OPERATIONS.filter((op) => OPERATION_POLICY[op.id].kind === 'read').map((op) => op.name);
    expect(names.sort()).toEqual(reads.sort());
    expect(names).toContain('resolve_account');
    expect(names).not.toContain('create_customer');
  });

  it('narrows to the chosen toolsets', async () => {
    const names = await toolNames({ toolsets: ['transfers', 'balance'] });
    expect(names.sort()).toEqual(
      [
        'create_transfer',
        'list_transfers',
        'get_transfer',
        'get_transfer_by_reference',
        'resolve_account',
        'list_banks',
        'get_balance',
        'list_transactions',
      ].sort(),
    );
  });

  it('refuses a hidden tool by name without calling the API', async () => {
    const { call, requests } = await connect({ secretKey: LIVE_KEY });
    const result = await call('create_transfer', { amount: 100000, idempotency_key: 'k1' });
    expect(result.isError).toBe(true);
    expect(resultJson(result)).toMatchObject({ error: { type: 'tool_disabled' } });
    expect(JSON.stringify(result)).toMatch(/money movement is off/);
    expect(requests).toHaveLength(0);
  });

  it('explains why a tool outside the chosen toolsets is unavailable', async () => {
    const { call } = await connect({ toolsets: ['balance'] });
    const result = await call('list_payments');
    expect(result.isError).toBe(true);
    expect(resultJson(result)).toMatchObject({
      error: { message: expect.stringMatching(/"payments" toolset/) as unknown },
    });
  });

  it('rejects a tool that does not exist with a protocol error', async () => {
    const { client } = await connect({});
    await expect(client.callTool({ name: 'drop_database', arguments: {} })).rejects.toBeInstanceOf(McpError);
  });
});

describe('tool definitions', () => {
  it('annotates reads, destructive writes and money movement', async () => {
    const { client } = await connect({});
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
    expect(byName.get_payment?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    expect(byName.close_virtual_account?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    expect(byName.create_transfer?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    });
    expect(byName.create_customer?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(byName.create_transfer?.description).toMatch(/real money/);
    expect(byName.simulate_transfer?.description).toMatch(/Test mode only/);
  });

  it('tells the agent which mode it is in', async () => {
    const test = await connect({});
    expect(test.client.getInstructions()).toMatch(/test-mode secret key/);
    const live = await connect({ secretKey: LIVE_KEY });
    expect(live.client.getInstructions()).toMatch(/live-mode secret key/);
    expect(live.client.getInstructions()).toMatch(/switched off/);
    expect(live.client.getServerVersion()).toMatchObject({ name: 'pletopay', version: '1.0.0' });
  });
});
