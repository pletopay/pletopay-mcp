import { readFileSync, statSync } from 'node:fs';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import type { ReadResourceResult, Resource, ResourceTemplate } from '@modelcontextprotocol/sdk/types.js';
import { DOC_PAGES } from './generated/docs';
import { ERROR_CODES, EVENT_TYPES, OBJECT_SCHEMAS } from './generated/reference';
import { docPage } from './tools/docs';

export const SPEC_URI = 'pletopay://openapi/public.v1.yaml';
export const EVENTS_URI = 'pletopay://webhooks/events';
export const ERRORS_URI = 'pletopay://errors';
const SCHEMA_PREFIX = 'pletopay://schemas/';
const DOC_PREFIX = 'pletopay://docs/';

/** JSON-RPC "resource not found" (MCP spec). */
const RESOURCE_NOT_FOUND = -32002;

/** The contract ships next to dist/ (and src/, in development) and is read only when asked for. */
const SPEC_FILE = new URL('../spec/public.v1.yaml', import.meta.url);

function specSize(): number | undefined {
  try {
    return statSync(SPEC_FILE).size;
  } catch {
    return undefined;
  }
}

export function listResources(includeDocs: boolean): Resource[] {
  const size = specSize();
  const resources: Resource[] = [
    {
      uri: EVENTS_URI,
      name: 'webhook-events',
      title: 'Webhook event types',
      description: 'Every webhook event type, what it means, and the schema of its data.object.',
      mimeType: 'application/json',
    },
    {
      uri: ERRORS_URI,
      name: 'error-codes',
      title: 'API error codes',
      description: 'Every error code the API returns, with its HTTP status, error type and when it happens.',
      mimeType: 'application/json',
    },
    ...Object.keys(OBJECT_SCHEMAS).map((name): Resource => ({
      uri: SCHEMA_PREFIX + name,
      name: `schema-${name}`,
      title: `${name} schema`,
      description: `JSON Schema of the ${name} object returned by the API.`,
      mimeType: 'application/schema+json',
    })),
    {
      uri: SPEC_URI,
      name: 'openapi',
      title: 'Pletopay API contract (OpenAPI 3.1)',
      description:
        'The full public API contract. Large (about 700 KB): prefer the tool input schemas and the pletopay://schemas/… resources.',
      mimeType: 'application/yaml',
      ...(size !== undefined ? { size } : {}),
    },
  ];
  if (includeDocs) {
    for (const page of DOC_PAGES) {
      resources.push({
        uri: DOC_PREFIX + page.slug,
        name: `doc-${page.slug.replace(/\//g, '-')}`,
        title: page.title,
        description: page.description,
        mimeType: 'text/markdown',
      });
    }
  }
  return resources;
}

export function listResourceTemplates(includeDocs: boolean): ResourceTemplate[] {
  const templates: ResourceTemplate[] = [
    {
      uriTemplate: `${SCHEMA_PREFIX}{name}`,
      name: 'schema',
      title: 'Object schema',
      description: `JSON Schema of an API object. Names: ${Object.keys(OBJECT_SCHEMAS).join(', ')}.`,
      mimeType: 'application/schema+json',
    },
  ];
  if (includeDocs) {
    templates.push({
      uriTemplate: `${DOC_PREFIX}{+slug}`,
      name: 'doc',
      title: 'Pletopay guide',
      description: `A guide as markdown. Slugs: ${DOC_PAGES.map((page) => page.slug).join(', ')}.`,
      mimeType: 'text/markdown',
    });
  }
  return templates;
}

const json = (uri: string, value: unknown, mimeType = 'application/json'): ReadResourceResult => ({
  contents: [{ uri, mimeType, text: JSON.stringify(value, null, 2) }],
});

export function readResource(uri: string, includeDocs: boolean): ReadResourceResult {
  if (uri === EVENTS_URI) return json(uri, EVENT_TYPES);
  if (uri === ERRORS_URI) return json(uri, ERROR_CODES);
  if (uri === SPEC_URI) {
    return { contents: [{ uri, mimeType: 'application/yaml', text: readFileSync(SPEC_FILE, 'utf8') }] };
  }
  if (uri.startsWith(SCHEMA_PREFIX)) {
    const name = uri.slice(SCHEMA_PREFIX.length);
    const schema = Object.hasOwn(OBJECT_SCHEMAS, name) ? OBJECT_SCHEMAS[name] : undefined;
    if (schema) return json(uri, { title: name, ...schema }, 'application/schema+json');
  }
  if (includeDocs && uri.startsWith(DOC_PREFIX)) {
    const page = docPage(decodeURIComponent(uri.slice(DOC_PREFIX.length)));
    if (page) {
      return {
        contents: [
          { uri, mimeType: 'text/markdown', text: `# ${page.title}\n\nSource: ${page.url}\n\n${page.markdown}` },
        ],
      };
    }
  }
  throw new McpError(RESOURCE_NOT_FOUND, `Resource not found: ${uri}`, { uri });
}
