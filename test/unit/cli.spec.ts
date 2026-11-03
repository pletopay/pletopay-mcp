import { describe, expect, it } from 'vitest';
import { parseCli } from '../../src/cli';
import { ConfigError } from '../../src/config';
import { LIVE_KEY, TEST_KEY } from './helpers';

describe('parseCli', () => {
  it('runs over stdio with the key from the environment and safe defaults', () => {
    expect(parseCli([], { PLETOPAY_SECRET_KEY: TEST_KEY })).toEqual({
      kind: 'stdio',
      options: { secretKey: TEST_KEY, toolsets: 'all', readOnly: false, enableMoneyMovement: false, docs: true },
    });
  });

  it('reads every switch from flags', () => {
    const command = parseCli(
      [
        '--api-key',
        LIVE_KEY,
        '--toolsets',
        'payments, transfers',
        '--read-only',
        '--enable-money-movement',
        '--no-docs',
        '--api-url',
        'http://localhost:8080',
      ],
      {},
    );
    expect(command).toEqual({
      kind: 'stdio',
      options: {
        secretKey: LIVE_KEY,
        apiUrl: 'http://localhost:8080',
        toolsets: ['payments', 'transfers'],
        readOnly: true,
        enableMoneyMovement: true,
        docs: false,
      },
    });
  });

  it('reads switches from the environment', () => {
    const command = parseCli([], {
      PLETOPAY_SECRET_KEY: LIVE_KEY,
      PLETOPAY_MCP_TOOLSETS: 'refunds',
      PLETOPAY_MCP_ENABLE_MONEY_MOVEMENT: 'true',
      PLETOPAY_MCP_READ_ONLY: 'no',
    });
    expect(command).toMatchObject({
      kind: 'stdio',
      options: { toolsets: ['refunds'], enableMoneyMovement: true, readOnly: false },
    });
  });

  it.each([
    [[], {}, /No secret key/],
    [['--api-key', 'pk_test_abc'], {}, /publishable key/],
    [['--api-key', 'whsec_abc'], {}, /sk_test_/],
    [['--toolsets', 'payments,bitcoin'], { PLETOPAY_SECRET_KEY: TEST_KEY }, /Unknown toolset bitcoin/],
    [['--api-url', 'http://api.pletopay.com'], { PLETOPAY_SECRET_KEY: TEST_KEY }, /must use https/],
    [['--transport', 'websocket'], { PLETOPAY_SECRET_KEY: TEST_KEY }, /Unknown transport/],
    [['--bogus'], {}, /Unknown option/],
    [['--transport', 'http', '--api-key', TEST_KEY], {}, /not used over HTTP/],
    [['--transport', 'http', '--port', 'eighty'], {}, /Invalid port/],
    [['--transport', 'http'], { MCP_TRUST_PROXY_HOPS: 'all' }, /MCP_TRUST_PROXY_HOPS must be a whole number/],
  ])('refuses %j', (argv, env, message) => {
    expect(() => parseCli(argv, env)).toThrow(ConfigError);
    expect(() => parseCli(argv, env)).toThrow(message);
  });

  it('never echoes a malformed key back', () => {
    let message = '';
    try {
      parseCli(['--api-key', 'sk_test_has spaces-HUNTER2'], {});
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/must look like/);
    expect(message).not.toContain('HUNTER2');
  });

  it('configures HTTP without a key', () => {
    expect(
      parseCli(['--transport', 'http', '--port', '0', '--host', '0.0.0.0'], {
        PLETOPAY_SECRET_KEY: TEST_KEY,
        MCP_ALLOWED_HOSTS: 'mcp.pletopay.com, localhost',
        MCP_TRUST_PROXY_HOPS: '1',
        MCP_RATE_LIMIT_PER_MINUTE: '60',
      }),
    ).toMatchObject({
      kind: 'http',
      port: 0,
      http: {
        host: '0.0.0.0',
        allowedHosts: ['mcp.pletopay.com', 'localhost'],
        trustProxyHops: 1,
        rateLimitPerMinute: 60,
        defaults: { toolsets: 'all', readOnly: false, enableMoneyMovement: false },
      },
    });
    // The server's own environment key is never used over HTTP.
    const command = parseCli(['--transport', 'http'], { PLETOPAY_SECRET_KEY: TEST_KEY });
    expect(JSON.stringify(command)).not.toContain('sk_test_');
  });
});
