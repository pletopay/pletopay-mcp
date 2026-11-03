import { Pletopay } from '@pletopay/node';
// The low-level Server is used on purpose: tool inputs are JSON Schema generated from the API
// contract, which McpServer.registerTool (zod-only) can't take.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { DEFAULT_API_URL, secretKeyMode } from './config';
import type { Mode, PletopayMcpOptions } from './config';
import { getPrompt, listPrompts } from './prompts';
import { listResourceTemplates, listResources, readResource } from './resources';
import { API_TOOLS, isEnabled } from './tools/catalog';
import type { ApiTool, ToolContext } from './tools/catalog';
import { DOC_TOOLS, callDocTool } from './tools/docs';
import { errorResult, executeOperation } from './tools/execute';
import { VERSION } from './version';

export const SERVER_NAME = 'pletopay';

function instructions(context: ToolContext, docs: boolean): string {
  const moneyLine =
    context.mode === 'test'
      ? 'Test mode: nothing touches real money. Use simulate_transfer to fake an incoming bank transfer, and list_sandbox_test_values for values that trigger specific outcomes.'
      : context.readOnly
        ? 'Live mode, read-only: you can look things up but not change anything.'
        : context.enableMoneyMovement
          ? 'LIVE MODE with money movement enabled: transfers, refunds, subaccount and split changes move or redirect real money and cannot be undone. Confirm the exact amount and destination with the user before every such call.'
          : 'Live mode: tools that send money or change where money goes are switched off. If the user needs them, they can restart the server with money movement enabled.';
  return [
    'Pletopay is a payments API for Nigerian businesses: collect payments by bank transfer into virtual accounts, send transfers, issue refunds, run checkout, payment links, invoices and subscriptions, and receive signed webhooks.',
    `You are connected with a ${context.mode}-mode secret key. ${moneyLine}`,
    'Amounts are integers in kobo (₦1 = 100 kobo); always show the user naira amounts. Objects have prefixed ids (cus_, pay_, va_, trf_, re_, …): look ids up with the list or get tools instead of guessing them.',
    'Lists are paginated: pass limit, then starting_after with the meta.next_cursor of the previous page while meta.has_more is true. Filter by date with created: { gte, lte } (ISO 8601).',
    'Errors carry error.type and error.code; tell the user the message and quote the request_id if they need support.',
    ...(docs
      ? [
          'When unsure how something works, search the guides with search_docs. Resources describe webhook event types (pletopay://webhooks/events), error codes (pletopay://errors) and object schemas (pletopay://schemas/…).',
        ]
      : []),
  ].join('\n\n');
}

function disabledReason(tool: ApiTool, context: ToolContext): string {
  if (context.toolsets !== 'all' && !context.toolsets.has(tool.toolset)) {
    return `${tool.definition.name} is in the "${tool.toolset}" toolset, which this server was not started with.`;
  }
  if (tool.operation.testModeOnly && context.mode === 'live') {
    return `${tool.definition.name} only works in test mode (with an sk_test_ key).`;
  }
  if (context.readOnly && tool.policy.kind !== 'read') {
    return `${tool.definition.name} changes data, and this server is read-only.`;
  }
  return `${tool.definition.name} sends money or changes where money goes, and money movement is off for this live key. The user can enable it explicitly when starting the server.`;
}

/**
 * Creates an MCP server bound to one secret key. Connect it to any transport
 * (`StdioServerTransport`, `StreamableHTTPServerTransport`, an in-memory pair in tests).
 */
export function createPletopayMcpServer(options: PletopayMcpOptions): Server {
  const mode: Mode = secretKeyMode(options.secretKey);
  const context: ToolContext = {
    mode,
    toolsets: options.toolsets === undefined || options.toolsets === 'all' ? 'all' : new Set(options.toolsets),
    readOnly: options.readOnly === true,
    enableMoneyMovement: options.enableMoneyMovement === true,
  };
  const client = new Pletopay({
    secretKey: options.secretKey,
    // Always explicit: the SDK would otherwise fall back to PLETOPAY_API_URL from the environment.
    baseUrl: options.apiUrl ?? DEFAULT_API_URL,
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.correlationId ? { correlationId: options.correlationId } : {}),
    appInfo: { name: 'pletopay-mcp', version: VERSION },
  });

  const enabled = new Map<string, ApiTool>();
  const known = new Map<string, ApiTool>();
  for (const tool of API_TOOLS) {
    known.set(tool.definition.name, tool);
    if (isEnabled(tool, context)) enabled.set(tool.definition.name, tool);
  }

  // Docs tools, docs resources and prompts: on unless --no-docs, and the docs toolset is selected.
  const docs = options.docs !== false && (context.toolsets === 'all' || context.toolsets.has('docs'));
  const docTools = docs ? DOC_TOOLS : [];

  const server = new Server(
    { name: SERVER_NAME, title: 'Pletopay', version: VERSION, websiteUrl: 'https://docs.pletopay.com/mcp' },
    {
      capabilities: { tools: {}, resources: {}, ...(docs ? { prompts: {} } : {}) },
      instructions: instructions(context, docs),
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...[...enabled.values()].map((tool): Tool => tool.definition), ...docTools],
  }));

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: listResources(docs) }));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: listResourceTemplates(docs),
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => readResource(request.params.uri, docs));

  if (docs) {
    server.setRequestHandler(ListPromptsRequestSchema, async () => ({ prompts: listPrompts() }));
    server.setRequestHandler(GetPromptRequestSchema, async (request) =>
      getPrompt(request.params.name, request.params.arguments),
    );
  }

  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;
    if (docTools.some((tool) => tool.name === name)) return callDocTool(name, args);
    const tool = enabled.get(name);
    if (!tool) {
      const hidden = known.get(name);
      // Re-checked here too: a hidden tool is never callable, even by a client that guesses its name.
      if (hidden) return errorResult(disabledReason(hidden, context), { type: 'tool_disabled' });
      throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${name}`);
    }
    return executeOperation(client, tool.operation, args);
  });

  return server;
}
