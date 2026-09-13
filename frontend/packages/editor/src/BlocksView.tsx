import type { BlockSchema, CustomBlockNoteSchema, InlineContentSchema, PartialBlock, StyleSchema } from '@blocknote/core';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import type { Block } from '@nook/api-client';
import { useMemo } from 'react';
import { useNookSchema } from './schema';

export interface BlocksViewProps {
  blocks: Block[];
  /** Reuse the parent editor's schema (page embeds) instead of building one from the plugin registry. */
  schema?: CustomBlockNoteSchema<BlockSchema, InlineContentSchema, StyleSchema>;
  theme?: 'light' | 'dark';
  compact?: boolean;
  className?: string;
}

/**
 * Non-collaborative, read-only BlockNote instance over §4 block JSON. Used for the
 * "Live editing unavailable" fallback, page embeds and history previews / diffs.
 */
export function BlocksView({ blocks, schema, theme, compact, className }: BlocksViewProps) {
  const own = useNookSchema();
  const s = schema ?? own;
  const key = useMemo(() => JSON.stringify(blocks), [blocks]);
  const initial = useMemo(
    () => (blocks.length ? (blocks as unknown as PartialBlock<BlockSchema, InlineContentSchema, StyleSchema>[]) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const editor = useCreateBlockNote({ schema: s, initialContent: initial, trailingBlock: false }, [s, initial]);
  return (
    <BlockNoteView
      editor={editor}
      editable={false}
      theme={theme}
      sideMenu={false}
      slashMenu={false}
      formattingToolbar={false}
      linkToolbar={false}
      filePanel={false}
      tableHandles={false}
      emojiPicker={false}
      className={['nook-blocks-view', compact ? 'nook-blocks-view--compact' : '', className].filter(Boolean).join(' ')}
    />
  );
}
