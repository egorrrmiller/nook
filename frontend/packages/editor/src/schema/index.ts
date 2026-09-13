import {
  BlockNoteSchema,
  createCodeBlockSpec,
  createHeadingBlockSpec,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  defaultStyleSpecs,
  type BlockSpecs,
  type InlineContentSpecs,
} from '@blocknote/core';
import { codeBlockOptions } from '@blocknote/code-block';
import { withMultiColumn } from '@blocknote/xl-multi-column';
import { usePluginBlocks, usePluginInlineContent } from '@nook/plugin-sdk';
import { useMemo } from 'react';
import { BookmarkBlock } from './blocks/bookmark';
import { BreadcrumbBlock } from './blocks/breadcrumb';
import { CalloutBlock } from './blocks/callout';
import { EmbedBlock } from './blocks/embed';
import { EquationBlock } from './blocks/equation';
import { HtmlBlock } from './blocks/htmlBlock';
import { ImageBlock } from './blocks/image';
import { MermaidBlock } from './blocks/mermaid';
import { PageEmbedBlock } from './blocks/pageEmbed';
import { PageLinkBlock } from './blocks/pageLink';
import { PdfBlock } from './blocks/pdf';
import { TableOfContentsBlock } from './blocks/tableOfContents';
import { DateMentionInline } from './inline/dateMention';
import { InlineEquationInline } from './inline/inlineEquation';
import { MentionInline } from './inline/mention';

export { codeBlockOptions };

/** Block specs shipped by Nook, keyed by type (§1.1). Order matters for file-drop matching. */
export function nookBlockSpecs(): BlockSpecs {
  // `file` must come after the typed media blocks: it accepts everything.
  const { file, image: _image, ...rest } = defaultBlockSpecs;
  return {
    ...rest,
    heading: createHeadingBlockSpec({ levels: [1, 2, 3, 4], allowToggleHeadings: true }),
    codeBlock: createCodeBlockSpec(codeBlockOptions),
    image: ImageBlock(),
    pdf: PdfBlock(),
    file,
    callout: CalloutBlock(),
    tableOfContents: TableOfContentsBlock(),
    bookmark: BookmarkBlock(),
    embed: EmbedBlock(),
    pageLink: PageLinkBlock(),
    pageEmbed: PageEmbedBlock(),
    breadcrumb: BreadcrumbBlock(),
    equation: EquationBlock(),
    mermaid: MermaidBlock(),
    htmlBlock: HtmlBlock(),
  } as BlockSpecs;
}

export function nookInlineContentSpecs(): InlineContentSpecs {
  return {
    ...defaultInlineContentSpecs,
    mention: MentionInline,
    dateMention: DateMentionInline,
    inlineEquation: InlineEquationInline,
  } as InlineContentSpecs;
}

export type NookSchema = ReturnType<typeof createNookSchema>;

/**
 * The editor schema: BlockNote defaults (headings 1–4 with toggles, code with Shiki languages),
 * Nook's custom blocks / inline content, plugin-registered specs, and multi-column support.
 */
export function createNookSchema(extra: { blocks?: BlockSpecs; inlineContent?: InlineContentSpecs } = {}) {
  const base = BlockNoteSchema.create({
    blockSpecs: { ...nookBlockSpecs(), ...(extra.blocks ?? {}) },
    inlineContentSpecs: { ...nookInlineContentSpecs(), ...(extra.inlineContent ?? {}) } as InlineContentSpecs,
    styleSpecs: defaultStyleSpecs,
  });
  return withMultiColumn(base);
}

/** Schema built from the plugin registry; memoised per registry identity. */
export function useNookSchema(): NookSchema {
  const blocks = usePluginBlocks();
  const inline = usePluginInlineContent();
  return useMemo(
    () => createNookSchema({ blocks: blocks as BlockSpecs, inlineContent: inline as unknown as InlineContentSpecs }),
    [blocks, inline],
  );
}

export const NOOK_BLOCK_TYPES = [
  'callout',
  'tableOfContents',
  'bookmark',
  'embed',
  'pageLink',
  'pageEmbed',
  'breadcrumb',
  'equation',
  'mermaid',
  'htmlBlock',
  'pdf',
] as const;
