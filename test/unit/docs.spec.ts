import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';
import { DOC_PAGES } from '../../src/generated/docs';
import { OBJECT_SCHEMAS } from '../../src/generated/reference';
import { promptToolMentions } from '../../src/prompts';
import { API_TOOLS } from '../../src/tools/catalog';
import { DOC_TOOLS, searchDocs, tokenize } from '../../src/tools/docs';
import { connect, resultJson } from './helpers';

describe('docs search', () => {
  it('keeps identifiers whole and indexes their parts', () => {
    expect(tokenize('Listen for `transfer.failed` with sk_test_ keys')).toEqual(
      expect.arrayContaining(['transfer.failed', 'transfer', 'failed', 'sk_test_', 'sk', 'test']),
    );
  });

  it.each([
    ['verify webhook signature', 'webhooks/signatures'],
    ['idempotency key retry same request', 'idempotency'],
    ['rate limit 429 retry after', 'rate-limits'],
    ['resolve account name before sending a transfer', 'transfers'],
    ['refund back to the original sender', 'refunds'],
  ])('finds %j in %s', (query, slug) => {
    expect(searchDocs(query, 3).map((hit) => hit.slug)).toContain(slug);
  });

  it('returns nothing for noise', () => {
    expect(searchDocs('!!! ???')).toEqual([]);
  });

  it('bundles every guide with absolute links', () => {
    expect(DOC_PAGES.length).toBeGreaterThan(20);
    for (const page of DOC_PAGES) {
      expect(page.url).toBe(`https://docs.pletopay.com/${page.slug}`);
      expect(page.markdown, page.slug).not.toMatch(/\]\(\/(?!\/)/);
    }
  });

  it('serves search_docs and get_doc as tools', async () => {
    const { call } = await connect();
    const search = resultJson(await call('search_docs', { query: 'webhook signature', limit: 2 }));
    const results = search.results as Array<{ slug: string; url: string; snippet: string }>;
    expect(results).toHaveLength(2);
    expect(results[0]?.url).toMatch(/^https:\/\/docs\.pletopay\.com\//);
    const doc = await call('get_doc', { slug: 'webhooks/signatures' });
    expect(doc.isError).toBeFalsy();
    expect(doc.content[0]?.type === 'text' && doc.content[0].text).toMatch(/^# .+\n/);
    const missing = await call('get_doc', { slug: 'nope' });
    expect(missing.isError).toBe(true);
  });

  it('leaves docs tools, docs resources and prompts out with docs: false', async () => {
    const { client } = await connect({ docs: false });
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).not.toContain('search_docs');
    const { resources } = await client.listResources();
    expect(resources.some((resource) => resource.uri.startsWith('pletopay://docs/'))).toBe(false);
    expect(client.getServerCapabilities()?.prompts).toBeUndefined();
    await expect(client.listPrompts()).rejects.toThrow();
  });
});

describe('resources', () => {
  it('lists the reference, schemas and guides', async () => {
    const { client } = await connect();
    const { resources } = await client.listResources();
    const uris = resources.map((resource) => resource.uri);
    expect(uris).toEqual(
      expect.arrayContaining([
        'pletopay://webhooks/events',
        'pletopay://errors',
        'pletopay://openapi/public.v1.yaml',
        'pletopay://schemas/Payment',
        'pletopay://docs/transfers',
      ]),
    );
    const spec = resources.find((resource) => resource.uri === 'pletopay://openapi/public.v1.yaml');
    expect(spec?.size).toBeGreaterThan(100000);
    const { resourceTemplates } = await client.listResourceTemplates();
    expect(resourceTemplates.map((template) => template.uriTemplate)).toEqual([
      'pletopay://schemas/{name}',
      'pletopay://docs/{+slug}',
    ]);
  });

  it('reads the event catalogue, error codes, schemas, the contract and guides', async () => {
    const { client } = await connect();
    const text = async (uri: string) => {
      const [content] = (await client.readResource({ uri })).contents;
      return content && 'text' in content ? content.text : '';
    };
    const events = JSON.parse(await text('pletopay://webhooks/events')) as Array<Record<string, string>>;
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'transfer.failed', object_schema: 'pletopay://schemas/Transfer' }),
    );
    const errors = JSON.parse(await text('pletopay://errors')) as Array<Record<string, unknown>>;
    expect(errors).toContainEqual(expect.objectContaining({ code: 'insufficient_funds' }));
    const payment = JSON.parse(await text('pletopay://schemas/Payment')) as { title: string; properties: object };
    expect(payment.title).toBe('Payment');
    expect(payment.properties).toHaveProperty('amount');
    expect(await text('pletopay://openapi/public.v1.yaml')).toMatch(/^openapi: 3\.1/);
    expect(await text('pletopay://docs/checkout/hosted')).toMatch(/^# /);
  });

  it('links every schema reference to a published schema', () => {
    const refs = JSON.stringify(OBJECT_SCHEMAS).match(/pletopay:\/\/schemas\/\w+/g) ?? [];
    for (const ref of new Set(refs)) expect(OBJECT_SCHEMAS, ref).toHaveProperty(ref.split('/').pop() as string);
  });

  it('answers unknown resources with "resource not found"', async () => {
    const { client } = await connect();
    for (const uri of ['pletopay://schemas/toString', 'pletopay://docs/../../etc/passwd', 'file:///etc/passwd']) {
      const error = await client.readResource({ uri }).catch((caught: unknown) => caught);
      expect(error, uri).toBeInstanceOf(McpError);
      expect((error as McpError).code).toBe(-32002);
    }
  });
});

describe('prompts', () => {
  it('lists the workflows and renders them with their arguments', async () => {
    const { client } = await connect();
    const { prompts } = await client.listPrompts();
    expect(prompts.map((prompt) => prompt.name)).toEqual([
      'reconcile_collections',
      'investigate_payment',
      'investigate_failed_transfer',
      'set_up_webhooks',
    ]);
    const result = await client.getPrompt({ name: 'investigate_payment', arguments: { payment: 'ORDER-12345' } });
    const [message] = result.messages;
    expect(message?.role).toBe('user');
    expect(message?.content.type === 'text' && message.content.text).toMatch(/"ORDER-12345"/);
  });

  it('requires the required arguments', async () => {
    const { client } = await connect();
    await expect(client.getPrompt({ name: 'investigate_payment', arguments: {} })).rejects.toThrow(/payment/);
    await expect(client.getPrompt({ name: 'nope' })).rejects.toThrow(/Unknown prompt/);
  });

  it('only names tools that exist', () => {
    const names = new Set([...API_TOOLS.map((tool) => tool.definition.name), ...DOC_TOOLS.map((tool) => tool.name)]);
    for (const [prompt, mentions] of Object.entries(promptToolMentions())) {
      expect(mentions.length, prompt).toBeGreaterThan(0);
      for (const mention of mentions) expect(names.has(mention), `${prompt} names ${mention}`).toBe(true);
    }
  });
});
