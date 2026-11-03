/** A JSON Schema object as it appears in tool definitions. */
export type JsonSchema = { [keyword: string]: unknown };

/** One API operation from the contract, as emitted by scripts/generate.mjs. */
export interface SpecOperation<Id extends string = string> {
  id: Id;
  /** Tool name: the operationId in snake_case. */
  name: string;
  /** The contract's tag, e.g. `Virtual accounts`. */
  tag: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Path including `/api/v1`, with `{param}` placeholders. */
  path: string;
  summary: string;
  description: string;
  idempotency: 'none' | 'optional' | 'required';
  accept: 'application/json' | 'text/csv';
  testModeOnly: boolean;
  /** Which tool arguments fill the path, the query string and the JSON body. */
  pathParams: string[];
  queryParams: string[];
  bodyParams: string[];
  inputSchema: JsonSchema & { type: 'object'; properties: Record<string, JsonSchema> };
}
