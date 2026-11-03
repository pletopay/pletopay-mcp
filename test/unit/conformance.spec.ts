import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { SPEC_OPERATIONS } from '../../src/generated/operations';
import { OPERATION_POLICY, TAG_TOOLSETS } from '../../src/policy';
import { API_TOOLS } from '../../src/tools/catalog';
import { VERSION } from '../../src/version';

describe('the tool catalogue', () => {
  it('classifies every operation in the contract, and nothing else', () => {
    expect(Object.keys(OPERATION_POLICY).sort()).toEqual(SPEC_OPERATIONS.map((op) => op.id).sort());
  });

  it('maps every tag to a toolset', () => {
    for (const op of SPEC_OPERATIONS) expect(TAG_TOOLSETS[op.tag], op.tag).toBeDefined();
  });

  it('keeps the money-moving set exactly as reviewed', () => {
    const money = SPEC_OPERATIONS.filter((op) => OPERATION_POLICY[op.id].kind === 'money').map((op) => op.id);
    expect(money.sort()).toEqual(
      [
        'createRefund',
        'createSplitRule',
        'createSubaccount',
        'createTransfer',
        'updateSplitRule',
        'updateSubaccount',
      ].sort(),
    );
  });

  it('treats every GET as a read and every other method as a change, except name enquiry', () => {
    for (const op of SPEC_OPERATIONS) {
      const kind = OPERATION_POLICY[op.id].kind;
      if (op.method === 'GET') expect(kind, op.id).toBe('read');
      else if (op.id === 'resolveAccount') expect(kind).toBe('read');
      else expect(kind, op.id).not.toBe('read');
    }
  });

  it('makes idempotency_key a required argument where the API requires the header', () => {
    const required = SPEC_OPERATIONS.filter((op) => op.idempotency === 'required');
    expect(required.map((op) => op.id).sort()).toEqual(['createRefund', 'createTransfer']);
    for (const op of required) expect(op.inputSchema.required).toContain('idempotency_key');
    for (const op of SPEC_OPERATIONS.filter((o) => o.idempotency === 'optional')) {
      expect(op.inputSchema.properties.idempotency_key, op.id).toBeDefined();
      expect(op.inputSchema.required ?? []).not.toContain('idempotency_key');
    }
  });

  it('routes every argument to exactly one place', () => {
    for (const op of SPEC_OPERATIONS) {
      const routed = [...op.pathParams, ...op.queryParams, ...op.bodyParams];
      if (op.idempotency !== 'none') routed.push('idempotency_key');
      expect(new Set(routed).size, op.id).toBe(routed.length);
      expect(routed.sort(), op.id).toEqual(Object.keys(op.inputSchema.properties).sort());
      for (const name of op.pathParams) expect(op.path).toContain(`{${name}}`);
    }
  });

  it('uses unique, client-safe tool names', () => {
    const names = API_TOOLS.map((tool) => tool.definition.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
  });

  it('emits input schemas that a strict JSON Schema validator compiles', () => {
    const ajv = new Ajv2020({ strict: true, allErrors: true, validateFormats: false });
    for (const tool of API_TOOLS) {
      expect(() => ajv.compile(tool.definition.inputSchema), tool.definition.name).not.toThrow();
      expect(tool.definition.inputSchema.additionalProperties).toBe(false);
    }
  });

  it('keeps VERSION equal to package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
    expect(VERSION).toBe(pkg.version);
  });
});
