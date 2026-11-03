import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { GetPromptResult, Prompt } from '@modelcontextprotocol/sdk/types.js';

interface PromptDefinition {
  prompt: Prompt;
  render: (args: Record<string, string>) => string;
}

const READ_ONLY_NOTE = 'Only look things up: do not create, change or send anything while doing this.';

/** Ready-made workflows. Every tool they name exists in the catalogue (checked by a unit test). */
const PROMPTS: readonly PromptDefinition[] = [
  {
    prompt: {
      name: 'reconcile_collections',
      title: 'Reconcile collections',
      description: 'Match the payments received in a period against settlements and the balance statement.',
      arguments: [
        { name: 'from', description: 'Start of the period (ISO date, e.g. 2026-10-01).', required: true },
        { name: 'to', description: 'End of the period (ISO date). Defaults to now.', required: false },
      ],
    },
    render: ({ from, to }) => `Reconcile my Pletopay collections from ${from} to ${to || 'now'}. ${READ_ONLY_NOTE}

1. Call \`get_statement\` with period_start and period_end for the opening balance, closing balance and totals.
2. Page through \`list_payments\` with created: { gte, lte } for the period (status succeeded, then under_review and reversed), following meta.next_cursor while meta.has_more is true.
3. Call \`list_settlements\` for the same period, and \`list_settlement_items\` for each settlement, to see which payments were paid out.
4. Use \`list_transactions\` (filter by created) to check the ledger entries behind those totals.
5. Report, in naira: the total collected, fees, refunds, the amount settled, and what is still in the balance. List every payment that is under review, reversed, or not yet settled, with its id and reference. If the numbers don't add up, show where the difference is. Amounts from the API are in kobo.`,
  },
  {
    prompt: {
      name: 'investigate_payment',
      title: 'Investigate a payment',
      description: 'Explain what happened to a payment: its status, the money received, events and webhook deliveries.',
      arguments: [{ name: 'payment', description: 'The payment id (pay_…) or your reference.', required: true }],
    },
    render: ({ payment }) => `Investigate the Pletopay payment "${payment}". ${READ_ONLY_NOTE}

1. If it starts with pay_, call \`get_payment\` with id; otherwise call \`get_payment_by_reference\` with reference. Pass expand: ["customer"].
2. Explain its status, amount expected versus amount_received, fees, and any failure_reason or review_reason. Use \`search_docs\` if a status or reason needs explaining.
3. Call \`list_events\` with resource_id set to the payment id to get its timeline, then \`list_event_deliveries\` for the important events to check that my webhook endpoint received them.
4. If the payment was refunded, call \`list_refunds\` with payment set to the payment id.
5. Summarise what happened, in order, with amounts in naira, and say what (if anything) I should do next.`,
  },
  {
    prompt: {
      name: 'investigate_failed_transfer',
      title: 'Investigate a failed transfer',
      description: 'Find out why a transfer failed and confirm the funds came back to the balance.',
      arguments: [{ name: 'transfer', description: 'The transfer id (trf_…) or your reference.', required: true }],
    },
    render: ({ transfer }) => `Investigate the Pletopay transfer "${transfer}". ${READ_ONLY_NOTE}

1. If it starts with trf_, call \`get_transfer\` with id; otherwise call \`get_transfer_by_reference\` with reference.
2. Explain its status and failure_reason. A transfer whose outcome isn't known yet stays processing: say so rather than calling it failed. Use \`search_docs\` (for example "transfer failed") to explain the reason.
3. Call \`list_events\` with resource_id set to the transfer id for its timeline.
4. If it failed, confirm the reserved amount was released: call \`get_balance\`, and \`list_transactions\` with source "transfer" around the time it failed.
5. Summarise what happened and whether it is safe to send again. Do not resend it yourself. If I decide to resend, it needs a new reference and a new idempotency key, and I must confirm the amount and the destination first.`,
  },
  {
    prompt: {
      name: 'set_up_webhooks',
      title: 'Set up webhooks',
      description: 'Register a webhook endpoint, send it a test event, and explain how to verify signatures.',
      arguments: [
        { name: 'url', description: 'The HTTPS URL that should receive events.', required: true },
        {
          name: 'events',
          description: 'Comma-separated event types (e.g. payment.succeeded,transfer.failed). Defaults to all.',
          required: false,
        },
      ],
    },
    render: ({ url, events }) => `Set up a Pletopay webhook endpoint at ${url}.

1. Call \`list_webhook_endpoints\` first. If one already uses this URL, show it to me and stop instead of creating a duplicate.
2. Read the pletopay://webhooks/events resource and check the event types I asked for exist: ${events ? events : 'all events ("*")'}.
3. Call \`create_webhook_endpoint\` with url and enabled_events. The response contains the signing secret, which is shown only once: tell me to store it in my server's secrets now, and do not repeat it again afterwards.
4. Call \`test_webhook_endpoint\` with the new endpoint's id, then \`list_endpoint_deliveries\` to show whether my server answered with a 2xx.
5. Use \`get_doc\` with slug "webhooks/signatures" to show me how to verify the X-PletoPay-Signature header, de-duplicate on X-PletoPay-Event-ID, and respond within 10 seconds.`,
  },
];

export function listPrompts(): Prompt[] {
  return PROMPTS.map((definition) => definition.prompt);
}

/** The tool names each prompt mentions in backticks, for the catalogue check. */
export function promptToolMentions(): Record<string, string[]> {
  const sample = (prompt: Prompt) => Object.fromEntries((prompt.arguments ?? []).map((arg) => [arg.name, 'x']));
  return Object.fromEntries(
    PROMPTS.map(({ prompt, render }) => [
      prompt.name,
      [...render(sample(prompt)).matchAll(/`([a-z][a-z0-9_]+)`/g)].map((match) => match[1] as string),
    ]),
  );
}

export function getPrompt(name: string, args: Record<string, string> = {}): GetPromptResult {
  const definition = PROMPTS.find((candidate) => candidate.prompt.name === name);
  if (!definition) throw new McpError(ErrorCode.InvalidParams, `Unknown prompt: ${name}`);
  for (const arg of definition.prompt.arguments ?? []) {
    if (arg.required && !args[arg.name]?.trim()) {
      throw new McpError(ErrorCode.InvalidParams, `Missing required argument: ${arg.name}`);
    }
  }
  // Arguments are quoted into the text; keep them short and on one line.
  const clean = Object.fromEntries(
    Object.entries(args).map(([key, value]) => [key, String(value).replace(/\s+/g, ' ').trim().slice(0, 200)]),
  );
  return {
    description: definition.prompt.description,
    messages: [{ role: 'user', content: { type: 'text', text: definition.render(clean) } }],
  };
}
