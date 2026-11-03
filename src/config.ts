import { TOOLSETS, isToolset } from './policy';
import type { Toolset } from './policy';

/** Options for one MCP server instance (one secret key, one set of switches). */
export interface PletopayMcpOptions {
  /** `sk_test_…` or `sk_live_…`. The mode follows the key. */
  secretKey: string;
  /** API base URL. Default: https://api.pletopay.com */
  apiUrl?: string;
  /** Tool groups to expose. Default: all. */
  toolsets?: 'all' | readonly Toolset[];
  /** Expose only tools that change nothing. Default: false. */
  readOnly?: boolean;
  /**
   * Expose the tools that send money or change where money goes (transfers, refunds, subaccounts,
   * split rules) to a live key. Test keys always get them. Default: false.
   */
  enableMoneyMovement?: boolean;
  /** Expose the docs search tools, docs resources and prompts. Default: true. */
  docs?: boolean;
  /** Per-request timeout for API calls in milliseconds. Default: the SDK's (30 s). */
  timeoutMs?: number;
  /** Retries for safe API calls. Default: the SDK's (2). */
  maxRetries?: number;
  /** Custom fetch, for tests and proxies. */
  fetch?: typeof fetch;
  /** Sent to the API as `X-Correlation-Id` (the HTTP transport passes its request id). */
  correlationId?: string;
}

export type Mode = 'test' | 'live';

export const DEFAULT_API_URL = 'https://api.pletopay.com';

/** The same shape the SDK accepts. Publishable keys (`pk_…`) can't call the API. */
const SECRET_KEY_PATTERN = /^sk_(test|live)_[A-Za-z0-9_]+$/;

export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

/** Returns the key's mode, or throws a `ConfigError` that is safe to show (it never echoes the key). */
export function secretKeyMode(secretKey: string | undefined): Mode {
  if (!secretKey) {
    throw new ConfigError(
      'No secret key. Set PLETOPAY_SECRET_KEY (Dashboard → Settings → Developers → API keys); start with an sk_test_ key.',
    );
  }
  if (secretKey.startsWith('pk_')) {
    throw new ConfigError('A publishable key (pk_…) cannot call the API. Use a secret key (sk_test_… or sk_live_…).');
  }
  if (!SECRET_KEY_PATTERN.test(secretKey)) {
    throw new ConfigError('The secret key must look like sk_test_… or sk_live_….');
  }
  return secretKey.startsWith('sk_live_') ? 'live' : 'test';
}

/** Parses `all` or a comma-separated toolset list. Throws a `ConfigError` naming unknown toolsets. */
export function parseToolsets(value: string | undefined): 'all' | Toolset[] {
  const items = (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (items.length === 0 || items.includes('all')) return 'all';
  const unknown = items.filter((item) => !isToolset(item));
  if (unknown.length) {
    throw new ConfigError(`Unknown toolset ${unknown.join(', ')}. Choose from: all, ${TOOLSETS.join(', ')}.`);
  }
  return [...new Set(items)] as Toolset[];
}

/** `true`/`1`/`yes`/`on`/`enabled` are true; anything else is false. */
export function parseFlag(value: string | undefined): boolean {
  return ['true', '1', 'yes', 'on', 'enabled'].includes((value ?? '').trim().toLowerCase());
}
