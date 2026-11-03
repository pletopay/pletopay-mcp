import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { createPletopayMcpServer } from '../../src/server';
import type { PletopayMcpOptions } from '../../src/config';

export const TEST_KEY = 'sk_test_0123456789abcdef_0123456789abcdef0123456789abcdef01234567';
export const LIVE_KEY = 'sk_live_0123456789abcdef_0123456789abcdef0123456789abcdef01234567';

export interface RecordedRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

export interface FakeResponse {
  status?: number;
  /** JSON body; defaults to a success envelope around `data`. */
  json?: unknown;
  data?: unknown;
  meta?: unknown;
  text?: string;
  headers?: Record<string, string>;
}

/** A fetch that records every request and answers with `respond` (a success envelope by default). */
export function fakeFetch(respond: (request: RecordedRequest) => FakeResponse = () => ({ data: {} })) {
  const requests: RecordedRequest[] = [];
  const fetch = async (input: string | URL, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers);
    const bodyText = typeof init.body === 'string' ? init.body : undefined;
    const request: RecordedRequest = {
      method: init.method ?? 'GET',
      url: new URL(input),
      headers,
      body: bodyText === undefined ? undefined : JSON.parse(bodyText),
    };
    requests.push(request);
    const answer = respond(request);
    const status = answer.status ?? 200;
    const responseHeaders = { 'x-request-id': 'req_test_1', ...answer.headers };
    if (answer.text !== undefined) {
      return new Response(answer.text, { status, headers: { 'content-type': 'text/csv', ...responseHeaders } });
    }
    const json = answer.json ?? {
      status: true,
      message: 'Request successful',
      data: answer.data ?? {},
      ...(answer.meta ? { meta: answer.meta } : {}),
    };
    return new Response(JSON.stringify(json), {
      status,
      headers: { 'content-type': 'application/json', ...responseHeaders },
    });
  };
  return { fetch: fetch as unknown as typeof globalThis.fetch, requests };
}

/** Connects an MCP client to a fresh server over an in-memory transport pair. */
export async function connect(
  options: Partial<PletopayMcpOptions> = {},
  respond?: (request: RecordedRequest) => FakeResponse,
) {
  const fake = fakeFetch(respond);
  const server = createPletopayMcpServer({
    secretKey: TEST_KEY,
    apiUrl: 'https://api.example.test',
    maxRetries: 0,
    fetch: fake.fetch,
    ...options,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'unit-test', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const call = async (name: string, args: Record<string, unknown> = {}) =>
    (await client.callTool({ name, arguments: args })) as CallToolResult;
  return { client, server, requests: fake.requests, call };
}

/** The JSON a tool returned in its first text block. */
export function resultJson(result: CallToolResult): Record<string, unknown> {
  const [first] = result.content;
  if (first?.type !== 'text') throw new Error('expected a text result');
  return JSON.parse(first.text) as Record<string, unknown>;
}
