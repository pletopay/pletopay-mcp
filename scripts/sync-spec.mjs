#!/usr/bin/env node
/**
 * Copies the merchant OpenAPI contract from the API repo into spec/public.v1.yaml.
 * The SDK is generated from, and tested against, this committed copy.
 *
 *   node scripts/sync-spec.mjs            copy (source: ../pletopay-api/openapi/public.v1.yaml or PLETOPAY_SPEC_PATH)
 *   node scripts/sync-spec.mjs --check    fail when the copy differs from the source
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.env.PLETOPAY_SPEC_PATH ?? resolve(root, '..', 'pletopay-api', 'openapi', 'public.v1.yaml');
const target = resolve(root, 'spec', 'public.v1.yaml');
const check = process.argv.includes('--check');

if (!existsSync(source)) {
  if (check && existsSync(target)) {
    console.log(`spec: source ${source} not found; keeping the committed copy`);
    process.exit(0);
  }
  console.error(`spec: source not found at ${source} (set PLETOPAY_SPEC_PATH)`);
  process.exit(1);
}

const next = readFileSync(source, 'utf8');
const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
if (check) {
  if (current !== next) {
    console.error('spec: spec/public.v1.yaml is stale. Run `pnpm spec:sync && pnpm generate` and commit the result.');
    process.exit(1);
  }
  console.log('spec: up to date');
} else if (current === next) {
  console.log('spec: already up to date');
} else {
  writeFileSync(target, next);
  console.log(`spec: wrote spec/public.v1.yaml from ${source}`);
}
