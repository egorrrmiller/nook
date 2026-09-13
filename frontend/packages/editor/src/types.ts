import type { BlockNoteEditor } from '@blocknote/core';

/**
 * The editor with Nook's schema. The schema is assembled at runtime from defaults + plugins, so
 * the generic parameters cannot be named statically; BlockNote itself types its UI components
 * this way.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyEditor = BlockNoteEditor<any, any, any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyBlock = { id: string; type: string; props: Record<string, any>; content?: unknown; children: AnyBlock[] };
