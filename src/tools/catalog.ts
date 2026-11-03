import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Mode } from '../config';
import { SPEC_OPERATIONS } from '../generated/operations';
import type { OperationId } from '../generated/operations';
import { OPERATION_POLICY, TAG_TOOLSETS } from '../policy';
import type { OperationPolicy, Toolset } from '../policy';
import type { SpecOperation } from './types';

/** What decides which tools a session can see. */
export interface ToolContext {
  mode: Mode;
  toolsets: 'all' | ReadonlySet<Toolset>;
  readOnly: boolean;
  enableMoneyMovement: boolean;
}

export interface ApiTool {
  operation: SpecOperation<OperationId>;
  policy: OperationPolicy;
  toolset: Exclude<Toolset, 'docs'>;
  definition: Tool;
}

const MONEY_WARNING =
  'In live mode this sends real money or changes where money is paid, and it cannot be undone. ' +
  'Before calling, confirm the exact amount (in kobo) and the destination with the user.';

function toolsetOf(operation: SpecOperation<OperationId>): Exclude<Toolset, 'docs'> {
  const toolset = TAG_TOOLSETS[operation.tag];
  if (!toolset) throw new Error(`No toolset for the "${operation.tag}" tag (${operation.id})`);
  return toolset;
}

function describe(operation: SpecOperation<OperationId>, policy: OperationPolicy): string {
  const parts = [operation.summary.replace(/\.?$/, '.')];
  if (operation.description) parts.push(operation.description);
  if (operation.testModeOnly) parts.push('Test mode only: needs an sk_test_ key.');
  if (policy.kind === 'money') parts.push(MONEY_WARNING);
  if (operation.idempotency === 'required') {
    parts.push('Choose an idempotency_key and reuse it if you retry this call, so it can never happen twice.');
  }
  return parts.join('\n\n');
}

function definitionOf(operation: SpecOperation<OperationId>, policy: OperationPolicy): Tool {
  const readOnly = policy.kind === 'read';
  return {
    name: operation.name,
    title: operation.summary,
    description: describe(operation, policy),
    inputSchema: operation.inputSchema,
    annotations: {
      title: operation.summary,
      readOnlyHint: readOnly,
      destructiveHint: readOnly ? false : policy.destructive === true || policy.kind === 'money',
      idempotentHint:
        readOnly ||
        operation.method === 'PATCH' ||
        operation.method === 'DELETE' ||
        operation.idempotency === 'required',
      openWorldHint: policy.openWorld === true,
    },
  };
}

/** Every API tool, enabled or not, built once. */
export const API_TOOLS: readonly ApiTool[] = SPEC_OPERATIONS.map((operation) => {
  const policy = OPERATION_POLICY[operation.id];
  return { operation, policy, toolset: toolsetOf(operation), definition: definitionOf(operation, policy) };
});

/**
 * Whether a session may see and call a tool. Hidden tools are not listed at all, and calling one
 * by name is refused, so an agent can't reach them by guessing.
 */
export function isEnabled(tool: Pick<ApiTool, 'operation' | 'policy' | 'toolset'>, context: ToolContext): boolean {
  if (context.toolsets !== 'all' && !context.toolsets.has(tool.toolset)) return false;
  if (tool.operation.testModeOnly && context.mode === 'live') return false;
  if (context.readOnly && tool.policy.kind !== 'read') return false;
  if (tool.policy.kind === 'money' && context.mode === 'live' && !context.enableMoneyMovement) return false;
  return true;
}

export function enabledApiTools(context: ToolContext): ApiTool[] {
  return API_TOOLS.filter((tool) => isEnabled(tool, context));
}
