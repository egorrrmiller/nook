#!/usr/bin/env node
// Generates packages/api-client/src/generated from the backend OpenAPI document.
// Exits 0 without touching anything when no spec is available, so `pnpm gen:api`
// (and CI) never fail because the backend hasn't been built yet.
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, '..');
const specFile = resolve(pkgRoot, '../../../backend/openapi.json');
const specUrl = process.env.OPENAPI_URL;

let input;
if (specUrl) {
  input = specUrl;
} else if (existsSync(specFile)) {
  input = specFile;
} else {
  console.log(
    `[gen:api] no OpenAPI document (looked for ${specFile}, or OPENAPI_URL). ` +
      'Keeping the hand-written client. Nothing to do.',
  );
  process.exit(0);
}

const { createClient } = await import('@hey-api/openapi-ts');
console.log(`[gen:api] generating from ${input}`);
await createClient({
  input,
  output: { path: resolve(pkgRoot, 'src/generated'), format: 'prettier', lint: false },
  plugins: ['@hey-api/typescript', '@hey-api/sdk', '@hey-api/client-fetch'],
});
console.log('[gen:api] done → src/generated');
