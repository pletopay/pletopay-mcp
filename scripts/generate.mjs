#!/usr/bin/env node
/**
 * Generates, from spec/public.v1.yaml and docs-content/ (never edit the output by hand):
 * - src/generated/operations.ts: one entry per operation with a flat JSON Schema input (path params,
 *   query params and the request body's fields side by side) and where each argument goes;
 * - src/generated/reference.ts: the webhook event catalogue, error codes and object schemas;
 * - src/generated/docs.ts: the guides, split into heading sections for search.
 *
 *   node scripts/generate.mjs           write
 *   node scripts/generate.mjs --check   fail when stale
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { parse } from 'yaml';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const spec = parse(readFileSync(resolve(root, 'spec', 'public.v1.yaml'), 'utf8'));
const check = process.argv.includes('--check');
const schemas = spec.components.schemas;
const problems = [];

/** Inlines every `$ref`, turns `example` into `examples`, and keeps only JSON Schema keywords. */
function inline(schema, seen = []) {
  if (!schema || typeof schema !== 'object') return schema;
  if (schema.$ref) {
    const name = schema.$ref.split('/').pop();
    if (seen.includes(name)) throw new Error(`recursive schema ${[...seen, name].join(' -> ')}`);
    const target = schemas[name];
    if (!target) throw new Error(`unknown schema ${schema.$ref}`);
    const siblings = { ...schema };
    delete siblings.$ref;
    return { ...inline(target, [...seen, name]), ...inline(siblings, seen) };
  }
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'example') out.examples = [value];
    else if (key === 'properties') {
      out.properties = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, inline(v, seen)]));
    } else if (key === 'items' || key === 'additionalProperties' || key === 'not') {
      out[key] = typeof value === 'object' ? inline(value, seen) : value;
    } else if (key === 'allOf' || key === 'anyOf' || key === 'oneOf') {
      out[key] = value.map((v) => inline(v, seen));
    } else if (!key.startsWith('x-') && key !== 'readOnly' && key !== 'writeOnly' && key !== 'xml') {
      out[key] = value;
    }
  }
  // A lone allOf wrapper (a $ref with a description) collapses into its single member.
  if (out.allOf?.length === 1 && !out.type && !out.properties) {
    const [only] = out.allOf;
    delete out.allOf;
    return { ...only, ...out };
  }
  return out;
}

const snake = (id) => id.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const operations = [];
for (const [path, item] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(item)) {
    if (!op || typeof op !== 'object' || !op.operationId) continue;
    const id = op.operationId;
    const properties = {};
    const required = [];
    const pathParams = [];
    const queryParams = [];
    const bodyParams = [];
    let idempotency = 'none';
    const claim = (name, where) => {
      if (properties[name]) problems.push(`${id}: argument "${name}" (${where}) collides with another argument`);
    };

    for (const param of op.parameters ?? []) {
      if (param.in === 'header') {
        if (param.name === 'Idempotency-Key') idempotency = param.required ? 'required' : 'optional';
        continue;
      }
      if (param.in !== 'path' && param.in !== 'query') {
        problems.push(`${id}: unsupported parameter location "${param.in}" for ${param.name}`);
        continue;
      }
      // `expand[]` is sent by the SDK's query encoder from an array named `expand`.
      const name = param.name.endsWith('[]') ? param.name.slice(0, -2) : param.name;
      claim(name, param.in);
      const schema = inline(param.schema ?? { type: 'string' });
      if (param.description && !schema.description) schema.description = param.description;
      properties[name] = schema;
      if (param.required || param.in === 'path') required.push(name);
      (param.in === 'path' ? pathParams : queryParams).push(name);
    }

    const body = op.requestBody?.content;
    if (body) {
      const json = body['application/json'];
      if (!json || Object.keys(body).length !== 1) {
        problems.push(`${id}: only application/json request bodies are supported`);
      } else {
        const schema = inline(json.schema);
        if (schema.type !== 'object' || !schema.properties) {
          problems.push(`${id}: the request body must be an object with properties`);
        } else {
          for (const [name, prop] of Object.entries(schema.properties)) {
            claim(name, 'body');
            properties[name] = prop;
            bodyParams.push(name);
          }
          for (const name of schema.required ?? []) if (op.requestBody.required !== false) required.push(name);
        }
      }
    }

    if (idempotency !== 'none') {
      claim('idempotency_key', 'header');
      properties.idempotency_key = {
        type: 'string',
        minLength: 1,
        maxLength: 255,
        pattern: '^[\\x21-\\x7e]+$',
        description:
          idempotency === 'required'
            ? 'Required. A unique key you choose for this request (for example a UUID). If you retry, send the SAME key: the API returns the original result instead of acting twice.'
            : 'Optional. A unique key for this request; retrying with the same key returns the original result instead of acting twice. One is generated if omitted.',
      };
      if (idempotency === 'required') required.push('idempotency_key');
    }

    const success = Object.entries(op.responses ?? {}).find(([status]) => status.startsWith('2'))?.[1];
    const accept = success?.content?.['text/csv'] ? 'text/csv' : 'application/json';
    if ((op.tags ?? []).length !== 1) problems.push(`${id}: expected exactly one tag`);

    operations.push({
      id,
      name: snake(id),
      tag: op.tags?.[0] ?? 'Other',
      method: method.toUpperCase(),
      path,
      summary: (op.summary ?? '').trim(),
      description: (op.description ?? '').trim(),
      idempotency,
      accept,
      testModeOnly: op['x-test-mode-only'] === true,
      pathParams,
      queryParams,
      bodyParams,
      inputSchema: {
        type: 'object',
        properties,
        ...(required.length ? { required } : {}),
        additionalProperties: false,
      },
    });
  }
}

const names = new Set();
for (const op of operations) {
  if (names.has(op.name)) problems.push(`duplicate tool name ${op.name}`);
  names.add(op.name);
  if (op.name.length > 64) problems.push(`${op.name}: tool names are limited to 64 characters`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const header = '// Generated by scripts/generate.mjs. Do not edit.\n';
const outputs = [];

outputs.push([
  'operations.ts',
  `${header}import type { SpecOperation } from '../tools/types';

export const SPEC_API_VERSION = ${JSON.stringify(spec.info.version)};

export type OperationId =
${operations.map((op) => `  | ${JSON.stringify(op.id)}`).join('\n')};

export const SPEC_OPERATIONS: readonly SpecOperation<OperationId>[] = ${JSON.stringify(operations)};
`,
]);

// --- Reference: events, error codes, object schemas -------------------------------------------

const SCHEMA_URI = 'pletopay://schemas/';
/** Object schemas as published: `$ref`s become resource links, vendor keys are dropped. */
function linked(schema) {
  if (Array.isArray(schema)) return schema.map(linked);
  if (!schema || typeof schema !== 'object') return schema;
  if (schema.$ref)
    return { ...linked({ ...schema, $ref: undefined }), $ref: SCHEMA_URI + schema.$ref.split('/').pop() };
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key, value]) => value !== undefined && !key.startsWith('x-'))
      .map(([key, value]) => [
        key,
        key === 'properties'
          ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, linked(v)]))
          : linked(value),
      ]),
  );
}
const objectSchemas = Object.fromEntries(
  Object.entries(schemas)
    .filter(([name]) => !name.endsWith('Dto') && !name.startsWith('Event_'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, schema]) => [name, linked(schema)]),
);

const events = Object.entries(spec.webhooks ?? {}).map(([type, item]) => {
  const post = item.post ?? {};
  const ref = post.requestBody?.content?.['application/json']?.schema?.$ref?.split('/').pop();
  const objectRef = ref ? schemas[ref]?.properties?.data?.properties?.object?.$ref?.split('/').pop() : undefined;
  if (objectRef && !objectSchemas[objectRef])
    problems.push(`event ${type}: object schema ${objectRef} is not published`);
  return {
    type,
    description: (post.description ?? '').split(/\n\s*\n/)[0].trim(),
    ...(objectRef ? { object_schema: SCHEMA_URI + objectRef } : {}),
  };
});

const errorCodes = (spec['x-error-codes'] ?? []).map(({ code, status, type, when }) => ({ code, status, type, when }));

outputs.push([
  'reference.ts',
  `${header}import type { JsonSchema } from '../tools/types';

export interface EventType {
  type: string;
  description: string;
  /** The schema of \`data.object\`, as a pletopay://schemas/ resource URI. */
  object_schema?: string;
}

export interface ErrorCode {
  code: string;
  status: number;
  type: string;
  when: string;
}

export const EVENT_TYPES: readonly EventType[] = ${JSON.stringify(events)};

export const ERROR_CODES: readonly ErrorCode[] = ${JSON.stringify(errorCodes)};

export const OBJECT_SCHEMAS: Readonly<Record<string, JsonSchema>> = ${JSON.stringify(objectSchemas)};
`,
]);

// --- Docs: guides split into sections ---------------------------------------------------------

const DOCS_URL = 'https://docs.pletopay.com';
const docsRoot = resolve(root, 'docs-content');
const headingId = (text) =>
  text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`'’"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
function markdownFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return entry.endsWith('.md') ? [path] : [];
  });
}
const docs = markdownFiles(docsRoot)
  .map((path) => {
    const slug = relative(docsRoot, path).replace(/\\/g, '/').replace(/\.md$/, '');
    const text = readFileSync(path, 'utf8');
    const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
    if (!match) problems.push(`docs-content/${slug}.md: missing front matter`);
    const meta = match ? parse(match[1]) : {};
    // Site-relative links become absolute so an agent can quote them.
    const body = text
      .slice(match ? match[0].length : 0)
      .replace(/\]\(\/(?!\/)/g, `](${DOCS_URL}/`)
      .trim();
    const sections = [];
    let current = { heading: meta.title ?? slug, anchor: '', lines: [] };
    let fenced = false;
    for (const line of body.split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      const heading = !fenced && /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
      if (heading) {
        sections.push(current);
        current = { heading: heading[2], anchor: headingId(heading[2]), lines: [] };
      } else {
        current.lines.push(line);
      }
    }
    sections.push(current);
    return {
      slug,
      title: meta.title ?? slug,
      description: meta.description ?? '',
      url: `${DOCS_URL}/${slug}`,
      markdown: body,
      sections: sections
        .map(({ heading, anchor, lines }) => ({ heading, anchor, text: lines.join('\n').trim() }))
        .filter((section) => section.text),
    };
  })
  .sort((a, b) => a.slug.localeCompare(b.slug));
if (docs.length === 0) problems.push('docs-content/ is empty: run `pnpm docs:sync`');

outputs.push([
  'docs.ts',
  `${header}export interface DocSection {
  heading: string;
  /** Heading anchor on the docs site ('' for the text before the first heading). */
  anchor: string;
  text: string;
}

export interface DocPage {
  slug: string;
  title: string;
  description: string;
  url: string;
  markdown: string;
  sections: DocSection[];
}

export const DOC_PAGES: readonly DocPage[] = ${JSON.stringify(docs)};
`,
]);

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

let stale = 0;
for (const [file, source] of outputs) {
  const target = resolve(root, 'src', 'generated', file);
  const formatted = await format(source, { ...(await resolveConfig(target)), filepath: target });
  const current = existsSync(target) ? readFileSync(target, 'utf8') : null;
  if (current === formatted) continue;
  if (check) {
    console.error(`generate: src/generated/${file} is stale. Run \`pnpm generate\` and commit the result.`);
    stale++;
  } else {
    writeFileSync(target, formatted);
    console.log(`generate: wrote src/generated/${file}`);
  }
}
if (stale) process.exit(1);
console.log(
  `generate: ${check ? 'up to date' : 'done'} (${operations.length} operations, ${events.length} events, ${errorCodes.length} error codes, ${Object.keys(objectSchemas).length} schemas, ${docs.length} doc pages)`,
);
