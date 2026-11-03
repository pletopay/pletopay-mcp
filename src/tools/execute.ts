import { PletopayApiError, PletopayError } from '@pletopay/node';
import type { Pletopay } from '@pletopay/node';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { SpecOperation } from './types';

/** CSV downloads longer than this are cut, with a note, so one call can't flood the context. */
export const MAX_TEXT_CHARS = 100000;

const json = (value: unknown): string => JSON.stringify(value, null, 2);

export function textResult(value: unknown, isError = false): CallToolResult {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : json(value) }], isError };
}

export function errorResult(message: string, details: Record<string, unknown> = {}): CallToolResult {
  return textResult({ error: { message, ...details } }, true);
}

/** Splits flat tool arguments into the path, query string and body the operation expects. */
export function routeArguments(
  operation: SpecOperation,
  args: Record<string, unknown>,
): { path: string; query?: Record<string, unknown>; body?: Record<string, unknown>; idempotencyKey?: string } {
  const known = new Set(Object.keys(operation.inputSchema.properties));
  const unknown = Object.keys(args).filter((key) => !known.has(key));
  if (unknown.length) {
    throw new ArgumentError(
      `Unknown argument${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')}. Accepted: ${[...known].join(', ') || 'none'}.`,
    );
  }

  const path = operation.path.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = args[name];
    if (typeof value !== 'string' || value.trim() === '') throw new ArgumentError(`${name} is required.`);
    return encodeURIComponent(value);
  });

  const pick = (names: string[]): Record<string, unknown> | undefined => {
    const entries = names
      .filter((name) => args[name] !== undefined)
      .map((name): [string, unknown] => [name, args[name]]);
    return entries.length ? Object.fromEntries(entries) : undefined;
  };
  const query = pick(operation.queryParams);
  // An operation with a request body always gets one, even when every field is optional.
  const body = operation.bodyParams.length ? (pick(operation.bodyParams) ?? {}) : undefined;

  const idempotencyKey = args.idempotency_key;
  if (idempotencyKey !== undefined && typeof idempotencyKey !== 'string') {
    throw new ArgumentError('idempotency_key must be a string.');
  }
  if (operation.idempotency === 'required' && !idempotencyKey) {
    throw new ArgumentError('idempotency_key is required: choose a unique key and reuse it if you retry.');
  }
  return {
    path,
    ...(query ? { query } : {}),
    ...(body ? { body } : {}),
    ...(idempotencyKey ? { idempotencyKey } : {}),
  };
}

export class ArgumentError extends Error {
  override readonly name = 'ArgumentError';
}

/** Calls one API operation and turns the outcome (success or failure) into a tool result. */
export async function executeOperation(
  client: Pletopay,
  operation: SpecOperation,
  args: Record<string, unknown> | undefined,
): Promise<CallToolResult> {
  let routed: ReturnType<typeof routeArguments>;
  try {
    routed = routeArguments(operation, args ?? {});
  } catch (error) {
    if (error instanceof ArgumentError) return errorResult(error.message, { type: 'invalid_arguments' });
    throw error;
  }

  try {
    const response = await client.request(operation.method, routed.path, {
      query: routed.query,
      body: routed.body,
      options: routed.idempotencyKey ? { idempotencyKey: routed.idempotencyKey } : undefined,
      idempotency: operation.idempotency,
      accept: operation.accept,
      testModeOnly: operation.testModeOnly,
    });

    if (operation.accept === 'text/csv') {
      const text = typeof response.data === 'string' ? response.data : String(response.data);
      if (text.length <= MAX_TEXT_CHARS) return textResult(text);
      return textResult(
        `${text.slice(0, MAX_TEXT_CHARS)}\n\n[Truncated: showing the first ${MAX_TEXT_CHARS} of ${text.length} characters. ` +
          'Narrow the report period to see the rest.]',
      );
    }

    return textResult({
      data: response.data,
      ...(response.meta ? { meta: response.meta } : {}),
      request_id: response.requestId,
      ...(operation.idempotency !== 'none' ? { idempotency_key: response.idempotencyKey } : {}),
      ...(response.idempotentReplayed ? { idempotent_replayed: true } : {}),
    });
  } catch (error) {
    if (error instanceof PletopayApiError) {
      return errorResult(error.message.replace(/ \(request_id: [^)]*\)$/, ''), {
        status: error.status,
        type: error.type,
        code: error.code,
        ...(error.param ? { param: error.param } : {}),
        ...(error.details !== undefined ? { details: error.details } : {}),
        request_id: error.requestId,
      });
    }
    // Local SDK errors (timeouts, connection failures, test-mode-only refusals) carry safe messages.
    if (error instanceof PletopayError) return errorResult(error.message, { type: error.name });
    throw error;
  }
}
