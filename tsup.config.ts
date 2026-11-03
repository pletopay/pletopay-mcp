import { defineConfig } from 'tsup';
import type { Options } from 'tsup';

// @pletopay/node is bundled (not a runtime dependency) so the published bin and a Docker build
// from this repo alone both work, and the server always runs the SDK version it was tested with.
const shared: Options = {
  sourcemap: true,
  target: 'node20',
  platform: 'node',
  treeshake: true,
  splitting: false,
  minify: false,
  noExternal: ['@pletopay/node'],
  // import.meta.url (used to find the shipped spec/) also works in the CommonJS build.
  shims: true,
};

export default defineConfig([
  { ...shared, entry: ['src/index.ts'], format: ['esm', 'cjs'], dts: true, clean: true },
  { ...shared, entry: ['src/bin.ts'], format: ['esm'], banner: { js: '#!/usr/bin/env node' } },
]);
