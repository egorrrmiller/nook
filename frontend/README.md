# Nook frontend

pnpm workspace for the Nook SPA.

```
apps/web              React 19 + Vite + TanStack Router/Query + Tailwind 4 + BlockNote (the app)
packages/ui           shared primitives on shadcn/Base UI + cmdk; design tokens in src/styles.css
packages/api-client   typed API client (hand-written src/manual.ts; generated from OpenAPI when available)
packages/editor       NookEditor: BlockNote + Hocuspocus (Yjs) wrapper
packages/plugin-sdk   @nook/plugin-sdk — definePlugin / PluginProvider / usePluginCommands…
plugins/sample        proves the plugin wiring ("Sample: say hi" palette command)
```

## Prerequisites

Node 22 (`/opt/homebrew/bin/node`) and pnpm 12. `pnpm install` from this directory.

## Develop

```sh
pnpm dev                 # http://localhost:5173, proxies /api + /hub → :5000, /collab → :1234 (ws)
VITE_MOCK=1 pnpm dev     # no backend needed: MSW serves contracts §1–§3 in memory
```

Mock credentials: `owner@localhost` / `change-me`. Invite code for `/register?invite=…`: `welcome`.
In mock mode the editor runs on a local Y.Doc (no websocket); with real services it connects to
`/collab` with the JWT from `GET /api/collab/token`.

Override proxy targets with `NOOK_API_URL` / `NOOK_COLLAB_URL`.

Keyboard: `⌘K` command palette (pages, new page, theme, sidebar, plugin commands), `⌘\` toggle sidebar.
Theme: `data-theme="light|dark|hc"` on `<html>`; unset follows `prefers-color-scheme`.

## Test

```sh
pnpm typecheck
pnpm lint
pnpm test                # Vitest (+ Testing Library + MSW) across packages
pnpm e2e                 # Playwright smoke; starts `VITE_MOCK=1 pnpm dev` itself (needs `pnpm exec playwright install chromium` once)
```

## Build

```sh
pnpm build               # → apps/web/dist (the backend copies it into wwwroot)
```

## API client generation

```sh
pnpm gen:api             # reads ../backend/openapi.json (or OPENAPI_URL=http://localhost:5000/openapi/v1.json)
```

Writes `packages/api-client/src/generated` with `@hey-api/openapi-ts`. When the spec is absent the
script exits 0 and the hand-written client keeps being used, so the build never depends on it.

## Plugins

```ts
import { definePlugin } from '@nook/plugin-sdk';
export const myPlugin = definePlugin({
  id: 'vendor.thing',
  name: 'Thing',
  commands: [{ id: 'do', title: 'Thing: do it', run: ({ toast }) => toast('done') }],
  blocks: {/* BlockNote block specs */},
  slashMenuItems: [],
  sidebarPanels: [],
  settingsPages: [],
});
```

Register it in `apps/web/src/main.tsx` (`plugins` array). Hooks: `usePluginCommands()`,
`usePluginBlocks()`, `usePluginSidebarPanels()`, `usePluginSettingsPages()`.
