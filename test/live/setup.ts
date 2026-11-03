import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Live tests run against a real API in test mode:
 *   PLETOPAY_API_URL=http://localhost:8080 PLETOPAY_SECRET_KEY=sk_test_… pnpm test:live
 * (scripts/create-test-merchant.mjs in pletopay-sdk-node mints a throwaway sk_test_ key.)
 */
export const SECRET_KEY = process.env.PLETOPAY_SECRET_KEY ?? '';
export const API_URL = process.env.PLETOPAY_API_URL ?? 'http://localhost:8080';
export const LIVE = SECRET_KEY.startsWith('sk_test_');

export const unique = (prefix: string): string => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** Calls a tool and returns its JSON; fails the test with the tool's error text if it errored. */
export async function callJson<T = Record<string, unknown>>(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
  const [first] = result.content;
  const text = first?.type === 'text' ? first.text : '';
  if (result.isError) throw new Error(`${name} failed: ${text}`);
  return JSON.parse(text) as T;
}

/** Polls until `check` returns a value, or fails after `timeoutMs`. */
export async function poll<T>(check: () => Promise<T | undefined>, timeoutMs = 45000, everyMs = 1500): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, everyMs));
  }
}
