# Contributing

Thanks for helping improve the Pletopay MCP server.

## Setup

```bash
pnpm install
pnpm verify
```

Node.js 24 and pnpm 10 are used for development (the published package supports Node.js 24+). Until `@pletopay/node` is on npm, a sibling `pletopay-sdk-node` checkout is linked through `pnpm.overrides` and bundled into the build.

## How the server is built

- `spec/public.v1.yaml` is a committed copy of the merchant API contract (`pnpm spec:sync` refreshes it from a sibling `pletopay-api` checkout or `PLETOPAY_SPEC_PATH`). It ships in the package for the `pletopay://openapi/public.v1.yaml` resource.
- `docs-content/` is a committed copy of the guides (`pnpm docs:sync` refreshes it from a sibling `pletopay-docs` checkout or `PLETOPAY_DOCS_PATH`).
- `pnpm generate` writes `src/generated/operations.ts` (one flat-input tool per operation), `reference.ts` (events, error codes, object schemas) and `docs.ts` (guides split into sections). Never edit generated files; `pnpm generate:check` runs in CI.
- `src/policy.ts` classifies every operation as `read`, `write` or `money`. It is keyed by the generated `OperationId` union, so a new operation fails typechecking until it is classified, and `test/unit/conformance.spec.ts` pins the reviewed money-moving set.
- `src/server.ts` wires tools, resources and prompts into a low-level MCP `Server`; `src/tools/execute.ts` routes arguments to path, query, body and the `Idempotency-Key` header and calls the API through `@pletopay/node`.

## Adding or changing an operation

1. `pnpm spec:sync && pnpm generate`.
2. Classify any new operation in `src/policy.ts`. Anything that sends money or changes where money is paid out is `money`, and the conformance test's expected set must be updated on purpose.
3. Add unit tests (`test/unit/helpers.ts` fakes `fetch` and connects an in-memory client) and, where it matters, a live test.
4. Add a line to `CHANGELOG.md`.
5. `pnpm verify`.

## Live tests

```bash
export PLETOPAY_API_URL=http://localhost:8080
export PLETOPAY_SECRET_KEY=$(node ../pletopay-sdk-node/scripts/create-test-merchant.mjs | tail -1)
pnpm test:live
```

## Style

Prettier and ESLint are enforced (`pnpm format`, `pnpm lint`). The brand is spelled "Pletopay"; only the protocol headers (`X-PletoPay-Signature`, `PletoPay-Version`, `X-PletoPay-MCP-*`) keep the capital P. `pnpm check:brand` enforces this and keeps banking-partner wording out of everything an agent can read.

## Releasing

1. Bump `version` in `package.json` and `src/version.ts`, and date the changelog entry.
2. Tag `vX.Y.Z` and push the tag. The release workflow runs `pnpm verify` and publishes to npm with provenance.
