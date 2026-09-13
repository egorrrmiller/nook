# ADR-009: Column blocks come from `@blocknote/xl-multi-column` (GPL-3.0 OR PROPRIETARY)

Date: 2026-09-14 · Status: accepted · Supersedes the licence note in PLAN §2.2 and the risk table

## Context

Notion-style columns (any number, resizable, nestable) are a wave-1 editor requirement (PLAN §1.1). BlockNote ships them
in the paid-tier package `@blocknote/xl-multi-column`. PLAN §2.2 recorded that package as **AGPL-3.0**. The published
package metadata says otherwise:

```
@blocknote/xl-multi-column@0.54.2 → "license": "GPL-3.0 OR PROPRIETARY"
```

So it is dual-licensed: GPL-3.0 for open use, or a commercial BlockNote licence.

## Decision

Keep the package and use it under **GPL-3.0**.

Nook is a personal, self-hosted instance for one or two people. GPL-3.0 obligations (offer the corresponding source
under GPL-3.0) attach to **distribution** of the binary. Running the app on a private server for yourself is not
distribution, so nothing is triggered today. Unlike AGPL-3.0, plain GPL-3.0 has **no network-use clause**, so even
letting a second household user log in over the network does not trigger it. That makes the actual obligation *weaker*
than what PLAN §2.2 assumed, not stronger.

## Consequences

- **Publishing the repository**: the whole work must then be offered under GPL-3.0 (or a compatible licence). GPL-3.0 is
  one-way compatible with AGPL-3.0, so a later move to AGPL stays possible; the reverse does not.
- **Shipping binaries or a hosted product to other people**: either publish under GPL-3.0, buy the commercial BlockNote
  licence, or replace the block.
- **Exit path**: columns are one custom block (`packages/editor/src/schema/columns.tsx`) over BlockNote's public block
  API. A hand-written implementation is a contained piece of work, not a rewrite, should the licence ever be a problem.
- Everything else in the editor stays MPL-2.0 (`@blocknote/core`, `react`, `shadcn`) or MIT (`katex`, `mermaid`,
  `shiki`); the backend's only non-permissive dependency is libvips (LGPL, dynamically linked — see ADR-008).
