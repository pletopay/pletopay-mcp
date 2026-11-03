import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { DOC_PAGES } from '../generated/docs';
import type { DocPage } from '../generated/docs';
import { errorResult, textResult } from './execute';

/** Lowercase words, keeping identifiers like `create_transfer`, `sk_test_` and `transfer.failed` whole. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9_.]*[a-z0-9_]|[a-z0-9]/g) ?? []).flatMap((word) => {
    // Also index the parts of dotted/underscored identifiers, so "failed" finds `transfer.failed`.
    const parts = word.split(/[._]+/).filter(Boolean);
    return parts.length > 1 ? [word, ...parts] : [word];
  });
}

interface IndexedSection {
  page: DocPage;
  heading: string;
  anchor: string;
  text: string;
  terms: Map<string, number>;
  length: number;
}

const HEADING_WEIGHT = 3;
const TITLE_WEIGHT = 2;
const K1 = 1.2;
const B = 0.75;

function buildIndex(pages: readonly DocPage[]) {
  const sections: IndexedSection[] = [];
  for (const page of pages) {
    for (const section of page.sections) {
      const terms = new Map<string, number>();
      const add = (words: string[], weight: number) => {
        for (const word of words) terms.set(word, (terms.get(word) ?? 0) + weight);
      };
      add(tokenize(section.text), 1);
      add(tokenize(section.heading), HEADING_WEIGHT);
      add(tokenize(`${page.title} ${page.description}`), TITLE_WEIGHT);
      let length = 0;
      for (const count of terms.values()) length += count;
      sections.push({ page, heading: section.heading, anchor: section.anchor, text: section.text, terms, length });
    }
  }
  const documentFrequency = new Map<string, number>();
  for (const section of sections) {
    for (const term of section.terms.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }
  const averageLength = sections.reduce((sum, section) => sum + section.length, 0) / Math.max(sections.length, 1);
  return { sections, documentFrequency, averageLength };
}

const INDEX = buildIndex(DOC_PAGES);

export interface DocHit {
  slug: string;
  title: string;
  heading: string;
  url: string;
  snippet: string;
  score: number;
}

function snippet(text: string, terms: string[], max = 320): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const lower = flat.toLowerCase();
  const at = Math.min(...terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0), flat.length);
  const start = at === flat.length ? 0 : Math.max(0, at - 80);
  const cut = flat.slice(start, start + max);
  return `${start > 0 ? '…' : ''}${cut}${start + max < flat.length ? '…' : ''}`;
}

/** BM25 over guide sections; headings and page titles weigh more than body text. */
export function searchDocs(query: string, limit = 5): DocHit[] {
  const terms = [...new Set(tokenize(query))];
  if (terms.length === 0) return [];
  const { sections, documentFrequency, averageLength } = INDEX;
  const scored = sections
    .map((section) => {
      let score = 0;
      for (const term of terms) {
        const frequency = section.terms.get(term);
        if (!frequency) continue;
        const df = documentFrequency.get(term) ?? 0;
        const idf = Math.log(1 + (sections.length - df + 0.5) / (df + 0.5));
        score += (idf * frequency * (K1 + 1)) / (frequency + K1 * (1 - B + (B * section.length) / averageLength));
      }
      return { section, score };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ section, score }) => ({
    slug: section.page.slug,
    title: section.page.title,
    heading: section.heading,
    url: section.anchor ? `${section.page.url}#${section.anchor}` : section.page.url,
    snippet: snippet(section.text, terms),
    score: Math.round(score * 100) / 100,
  }));
}

export function docPage(slug: string): DocPage | undefined {
  const clean = slug
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.md$/, '');
  return DOC_PAGES.find((page) => page.slug === clean);
}

export const DOC_TOOLS: readonly Tool[] = [
  {
    name: 'search_docs',
    title: 'Search the Pletopay docs',
    description:
      'Search the Pletopay guides (payments, virtual accounts, transfers, refunds, checkout, webhooks, errors, testing, going live). ' +
      'Returns the best-matching sections with a link and a snippet; read a whole page with get_doc.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 200, description: 'What to look for, in plain words.' },
        limit: { type: 'integer', minimum: 1, maximum: 10, default: 5, description: 'How many sections to return.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: { title: 'Search the Pletopay docs', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'get_doc',
    title: 'Read a Pletopay guide',
    description: 'Returns one Pletopay guide as markdown, by its slug (from search_docs, or one of the listed slugs).',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', enum: DOC_PAGES.map((page) => page.slug), description: 'The guide, e.g. "transfers".' },
      },
      required: ['slug'],
      additionalProperties: false,
    },
    annotations: { title: 'Read a Pletopay guide', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
];

export function callDocTool(name: string, args: Record<string, unknown> = {}): CallToolResult {
  if (name === 'search_docs') {
    const query = args.query;
    if (typeof query !== 'string' || !query.trim())
      return errorResult('query is required.', { type: 'invalid_arguments' });
    const limit = typeof args.limit === 'number' ? Math.min(Math.max(Math.trunc(args.limit), 1), 10) : 5;
    const hits = searchDocs(query.slice(0, 200), limit);
    return textResult(
      hits.length
        ? { results: hits }
        : { results: [], hint: 'Nothing matched. Try other words, or list the guides with get_doc.' },
    );
  }
  const slug = args.slug;
  const page = typeof slug === 'string' ? docPage(slug) : undefined;
  if (!page) {
    return errorResult(`No guide "${String(slug)}". Available: ${DOC_PAGES.map((p) => p.slug).join(', ')}.`, {
      type: 'invalid_arguments',
    });
  }
  return textResult(
    `# ${page.title}\n\n${page.description ? `${page.description}\n\n` : ''}Source: ${page.url}\n\n${page.markdown}`,
  );
}
