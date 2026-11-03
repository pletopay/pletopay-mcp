#!/usr/bin/env node
/**
 * Copies the docs portal's guides (markdown) into docs-content/. The generator bundles them for the
 * search_docs / get_doc tools and the pletopay://docs/… resources, so the server works offline.
 *
 *   node scripts/sync-docs.mjs            copy (source: ../pletopay-docs/content or PLETOPAY_DOCS_PATH)
 *   node scripts/sync-docs.mjs --check    fail when the copy differs from the source
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.env.PLETOPAY_DOCS_PATH ?? resolve(root, '..', 'pletopay-docs', 'content');
const target = resolve(root, 'docs-content');
const check = process.argv.includes('--check');

function markdownFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return entry.endsWith('.md') ? [path] : [];
  });
}

if (!existsSync(source)) {
  if (check && existsSync(target)) {
    console.log(`docs: source ${source} not found; keeping the committed copy`);
    process.exit(0);
  }
  console.error(`docs: source not found at ${source} (set PLETOPAY_DOCS_PATH)`);
  process.exit(1);
}

const wanted = new Map(markdownFiles(source).map((path) => [relative(source, path), readFileSync(path, 'utf8')]));
const present = new Map(markdownFiles(target).map((path) => [relative(target, path), readFileSync(path, 'utf8')]));
const changed = [...wanted].filter(([rel, text]) => present.get(rel) !== text).map(([rel]) => rel);
const removed = [...present.keys()].filter((rel) => !wanted.has(rel));

if (check) {
  if (changed.length || removed.length) {
    console.error(
      `docs: docs-content/ is stale (${[...changed, ...removed].join(', ')}). Run \`pnpm docs:sync && pnpm generate\`.`,
    );
    process.exit(1);
  }
  console.log(`docs: up to date (${wanted.size} pages)`);
} else {
  for (const rel of changed) {
    mkdirSync(dirname(join(target, rel)), { recursive: true });
    writeFileSync(join(target, rel), wanted.get(rel));
  }
  for (const rel of removed) rmSync(join(target, rel));
  console.log(`docs: ${changed.length} written, ${removed.length} removed (${wanted.size} pages)`);
}
