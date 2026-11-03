#!/usr/bin/env node
/**
 * The brand is written "Pletopay". Only the protocol headers keep the capital P
 * (X-PletoPay-Signature, X-PletoPay-Event-ID, PletoPay-Version, …). Merchants never see our
 * banking partner's name either. This check runs over the source (including the generated tool
 * catalogue and docs bundle, which are sent to merchants' agents), tests, scripts and docs.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const roots = [
  'src',
  'test',
  'scripts',
  'docs-content',
  'deploy',
  'Dockerfile',
  'README.md',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'package.json',
];
const skip = new Set(['node_modules', 'dist', 'scripts/check-brand.mjs']);
const rules = [
  [/PletoPay(?!-)/, 'misspells the brand (write "Pletopay"; only the PletoPay-* protocol headers keep the capital P)'],
  [/9ja ?pay/i, 'names the banking partner (merchants work with Pletopay)'],
  // The docs portal's rule: no wording that points at a bank behind Pletopay.
  [
    /\bthe bank\b(?![- ](account|code|object|list|transfer))|bank['’]s\b|partner bank|bank sandbox|sandbox bank|\bbank_error\b|\bbank_unavailable\b/i,
    'refers to a banking partner behind Pletopay',
  ],
];

function* walk(path) {
  const rel = relative(root, path);
  if (skip.has(rel)) return;
  const st = statSync(path, { throwIfNoEntry: false });
  if (!st) return;
  if (st.isDirectory()) {
    for (const entry of readdirSync(path)) yield* walk(join(path, entry));
  } else if (/\.(ts|mjs|js|json|md|yaml|yml)$/.test(path) || path.endsWith('Dockerfile')) {
    yield path;
  }
}

const problems = [];
for (const r of roots) {
  for (const file of walk(resolve(root, r))) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const [re, why] of rules) {
        if (re.test(line)) problems.push(`${relative(root, file)}:${i + 1}: ${why}\n    ${line.trim()}`);
      }
    });
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('brand: ok');
