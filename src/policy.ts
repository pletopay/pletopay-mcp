import type { OperationId } from './generated/operations';

/**
 * How each API operation is exposed as a tool. Every operation in the contract must be classified
 * here on purpose: the record is keyed by the generated `OperationId` union, so adding an
 * operation to the spec fails typechecking until someone decides what kind it is.
 *
 * - `read`: changes nothing.
 * - `write`: creates or changes objects, but sends no money and doesn't change where money goes.
 * - `money`: sends money out of the balance, or changes where money is paid out or split to.
 *   Hidden for live keys unless money movement is enabled explicitly.
 */
export type ToolKind = 'read' | 'write' | 'money';

export interface OperationPolicy {
  kind: ToolKind;
  /** Irreversible or removes something (closes, deletes, voids, cancels, rotates a secret). */
  destructive?: true;
  /** Reaches outside Pletopay (sends money to a bank account, posts to a webhook URL). */
  openWorld?: true;
}

const read: OperationPolicy = { kind: 'read' };
const write: OperationPolicy = { kind: 'write' };
const destructive: OperationPolicy = { kind: 'write', destructive: true };
const money: OperationPolicy = { kind: 'money', openWorld: true };
const redirectsMoney: OperationPolicy = { kind: 'money' };

export const OPERATION_POLICY: Record<OperationId, OperationPolicy> = {
  createCustomer: write,
  listCustomers: read,
  getCustomer: read,
  updateCustomer: write,

  createPayment: write,
  listPayments: read,
  getPayment: read,
  getPaymentByReference: read,

  createVirtualAccount: write,
  listVirtualAccounts: read,
  getVirtualAccount: read,
  getVirtualAccountByReference: read,
  closeVirtualAccount: destructive,

  // Subaccounts and split rules decide where collected money is paid out and how it is divided.
  createSubaccount: redirectsMoney,
  listSubaccounts: read,
  getSubaccount: read,
  updateSubaccount: redirectsMoney,
  getSubaccountBalance: read,
  createSplitRule: redirectsMoney,
  listSplitRules: read,
  getSplitRule: read,
  updateSplitRule: redirectsMoney,

  createTransfer: money,
  listTransfers: read,
  getTransfer: read,
  getTransferByReference: read,
  // A POST, but it only looks up the account holder's name.
  resolveAccount: read,
  listBanks: read,

  listSettlements: read,
  getSettlement: read,
  listSettlementItems: read,

  createRefund: money,
  listRefunds: read,
  getRefund: read,
  getRefundByReference: read,

  createCheckoutSession: write,
  listCheckoutSessions: read,
  getCheckoutSession: read,
  getCheckoutSessionByReference: read,
  expireCheckoutSession: destructive,

  createPaymentLink: write,
  listPaymentLinks: read,
  getPaymentLink: read,
  updatePaymentLink: write,

  createInvoice: write,
  listInvoices: read,
  getInvoice: read,
  updateInvoice: write,
  finalizeInvoice: write,
  voidInvoice: destructive,
  markInvoiceUncollectible: destructive,

  listRiskEvents: read,
  getRiskLimits: read,
  setCustomerRiskStatus: write,

  createPlan: write,
  listPlans: read,
  getPlan: read,
  updatePlan: write,
  createSubscription: write,
  listSubscriptions: read,
  getSubscription: read,
  cancelSubscription: destructive,

  createReport: write,
  listReports: read,
  getReport: read,
  downloadReport: read,
  getStatement: read,

  createWebhookEndpoint: write,
  listWebhookEndpoints: read,
  getWebhookEndpoint: read,
  updateWebhookEndpoint: write,
  deleteWebhookEndpoint: destructive,
  rotateWebhookSecret: destructive,
  testWebhookEndpoint: { kind: 'write', openWorld: true },
  listEndpointDeliveries: read,
  listEvents: read,
  getEvent: read,
  listEventDeliveries: read,
  replayEvent: { kind: 'write', openWorld: true },

  getBalance: read,
  listTransactions: read,

  simulateTransfer: write,
  listSandboxTestValues: read,
};

/** Tool groups merchants can switch on and off, one per API tag, plus the docs tools. */
export const TOOLSETS = [
  'customers',
  'payments',
  'virtual_accounts',
  'subaccounts',
  'transfers',
  'settlements',
  'refunds',
  'checkout',
  'payment_links',
  'invoices',
  'risk',
  'subscriptions',
  'reports',
  'webhooks',
  'balance',
  'sandbox',
  'docs',
] as const;
export type Toolset = (typeof TOOLSETS)[number];

/** The contract's tags mapped to toolsets. */
export const TAG_TOOLSETS: Record<string, Exclude<Toolset, 'docs'>> = {
  Customers: 'customers',
  Payments: 'payments',
  'Virtual accounts': 'virtual_accounts',
  'Subaccounts & splits': 'subaccounts',
  Transfers: 'transfers',
  Settlements: 'settlements',
  Refunds: 'refunds',
  Checkout: 'checkout',
  'Payment links': 'payment_links',
  Invoices: 'invoices',
  Risk: 'risk',
  Subscriptions: 'subscriptions',
  Reports: 'reports',
  Webhooks: 'webhooks',
  Balance: 'balance',
  Sandbox: 'sandbox',
};

export function isToolset(value: string): value is Toolset {
  return (TOOLSETS as readonly string[]).includes(value);
}
