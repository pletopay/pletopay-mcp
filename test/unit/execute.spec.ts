import { describe, expect, it } from 'vitest';
import { MAX_TEXT_CHARS } from '../../src/tools/execute';
import { connect, resultJson } from './helpers';

describe('calling API tools', () => {
  it('sends filters as bracketed query parameters and returns the page meta', async () => {
    const meta = { has_more: true, next_cursor: 'pay_2', url: '/api/v1/payments' };
    const { call, requests } = await connect({}, () => ({ data: [{ id: 'pay_1' }], meta }));
    const result = await call('list_payments', {
      limit: 5,
      created: { gte: '2026-10-01T00:00:00Z' },
      expand: ['customer'],
      status: 'succeeded',
    });
    expect(result.isError).toBeFalsy();
    const [request] = requests;
    expect(request?.method).toBe('GET');
    expect(request?.url.pathname).toBe('/api/v1/payments');
    expect(request?.url.searchParams.get('limit')).toBe('5');
    expect(request?.url.searchParams.get('created[gte]')).toBe('2026-10-01T00:00:00Z');
    expect(request?.url.searchParams.getAll('expand[]')).toEqual(['customer']);
    expect(request?.url.searchParams.get('status')).toBe('succeeded');
    expect(resultJson(result)).toEqual({ data: [{ id: 'pay_1' }], meta, request_id: 'req_test_1' });
  });

  it('authenticates, pins the API version and identifies itself', async () => {
    const { call, requests } = await connect();
    await call('get_balance');
    const headers = requests[0]?.headers;
    expect(headers?.get('authorization')).toMatch(/^Bearer sk_test_/);
    expect(headers?.get('pletopay-version')).toBe('2026-09-25');
    expect(headers?.get('user-agent')).toMatch(/pletopay-mcp\/1\.0\.0/);
  });

  it('percent-encodes path parameters so they cannot change the route', async () => {
    const { call, requests } = await connect();
    await call('get_payment', { id: '../transfers/x?y' });
    expect(requests[0]?.url.pathname).toBe('/api/v1/payments/..%2Ftransfers%2Fx%3Fy');
    expect(requests[0]?.url.search).toBe('');
  });

  it('sends the caller-chosen idempotency key for a transfer, outside the body', async () => {
    const { call, requests } = await connect({}, () => ({ status: 201, data: { id: 'trf_1', status: 'processing' } }));
    const args = {
      amount: 250000,
      currency: 'NGN',
      reference: 'PAYOUT-1',
      beneficiary: { bank_code: '058', account_number: '0123456789' },
      idempotency_key: 'payout-1-attempt',
    };
    const result = await call('create_transfer', args);
    expect(result.isError).toBeFalsy();
    const [request] = requests;
    expect(request?.method).toBe('POST');
    expect(request?.url.pathname).toBe('/api/v1/transfers');
    expect(request?.headers.get('idempotency-key')).toBe('payout-1-attempt');
    expect(request?.body).toEqual({
      amount: 250000,
      currency: 'NGN',
      reference: 'PAYOUT-1',
      beneficiary: { bank_code: '058', account_number: '0123456789' },
    });
    expect(resultJson(result)).toMatchObject({ data: { id: 'trf_1' }, idempotency_key: 'payout-1-attempt' });
  });

  it('refuses a transfer without an idempotency key before calling the API', async () => {
    const { call, requests } = await connect();
    const result = await call('create_transfer', { amount: 250000 });
    expect(result.isError).toBe(true);
    expect(resultJson(result)).toMatchObject({ error: { type: 'invalid_arguments' } });
    expect(requests).toHaveLength(0);
  });

  it('generates an idempotency key when an optional one is omitted', async () => {
    const { call, requests } = await connect();
    const result = await call('create_customer', { email: 'ada@example.com' });
    const key = requests[0]?.headers.get('idempotency-key');
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(resultJson(result).idempotency_key).toBe(key);
  });

  it('sends no body to an operation without one', async () => {
    const { call, requests } = await connect();
    await call('void_invoice', { id: 'inv_1' });
    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.url.pathname).toBe('/api/v1/invoices/inv_1/void');
    expect(requests[0]?.body).toBeUndefined();
    expect(requests[0]?.headers.get('content-type')).toBeNull();
  });

  it('sends an empty body to an operation whose body fields are all optional', async () => {
    const { call, requests } = await connect();
    await call('close_virtual_account', { id: 'va_1' });
    expect(requests[0]?.url.pathname).toBe('/api/v1/virtual-accounts/va_1/close');
    expect(requests[0]?.body).toEqual({});
  });

  it('rejects unknown and missing arguments without calling the API', async () => {
    const { call, requests } = await connect();
    const unknown = await call('get_balance', { currency: 'USD' });
    expect(unknown.isError).toBe(true);
    expect(JSON.stringify(unknown)).toMatch(/Unknown argument currency/);
    const missing = await call('get_payment', {});
    expect(missing.isError).toBe(true);
    expect(JSON.stringify(missing)).toMatch(/id is required/);
    expect(requests).toHaveLength(0);
  });

  it('returns API errors as tool errors with type, code, param and request id', async () => {
    const { call } = await connect({}, () => ({
      status: 400,
      json: {
        status: false,
        message: 'amount must not be less than 1',
        error: { type: 'invalid_request', code: 'parameter_invalid', param: 'amount' },
        request_id: 'req_bad_1',
      },
    }));
    const result = await call('create_payment', { amount: 0 });
    expect(result.isError).toBe(true);
    expect(resultJson(result)).toEqual({
      error: {
        message: 'amount must not be less than 1',
        status: 400,
        type: 'invalid_request',
        code: 'parameter_invalid',
        param: 'amount',
        request_id: 'req_bad_1',
      },
    });
  });

  it('reports connection failures as tool errors', async () => {
    const { call } = await connect({
      fetch: () => Promise.reject(new TypeError('fetch failed')),
    });
    const result = await call('get_balance');
    expect(result.isError).toBe(true);
    expect(resultJson(result)).toMatchObject({ error: { type: 'PletopayConnectionError' } });
  });

  it('returns CSV reports as text, cut at the size limit', async () => {
    const csv = `id,amount\n${'pay_1,100\n'.repeat(MAX_TEXT_CHARS / 5)}`;
    const { call, requests } = await connect({}, () => ({ text: csv }));
    const result = await call('download_report', { id: 'rpt_1' });
    expect(requests[0]?.headers.get('accept')).toBe('text/csv');
    const [first] = result.content;
    expect(first?.type === 'text' && first.text.startsWith('id,amount\n')).toBe(true);
    expect(first?.type === 'text' && first.text).toMatch(/\[Truncated: showing the first 100000 of \d+ characters/);
  });
});
