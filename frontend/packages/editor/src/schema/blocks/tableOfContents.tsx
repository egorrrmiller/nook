import { createReactBlockSpec, useEditorState, type ReactCustomBlockRenderProps } from '@blocknote/react';
import { ListTreeIcon } from 'lucide-react';
import { extractHeadings, tocDepths } from '../toc';
import type { LooseBlock } from '../../util/text';
import { scrollToBlock } from '../../extensions/anchors';

export const tableOfContentsConfig = {
  type: 'tableOfContents',
  propSchema: {},
  content: 'none',
} as const;

function TocView({ editor }: ReactCustomBlockRenderProps<typeof tableOfContentsConfig>) {
  const entries = useEditorState({
    editor,
    selector: ({ editor: e }) => extractHeadings(e.document as unknown as LooseBlock[]),
  });
  const depths = tocDepths(entries);

  return (
    <nav className="nook-toc" contentEditable={false} aria-label="Table of contents" data-testid="toc-block">
      {entries.length === 0 ? (
        <div className="nook-toc__empty">
          <ListTreeIcon size={16} /> Add headings to create a table of contents.
        </div>
      ) : (
        entries.map((h, i) => (
          <a
            key={h.id}
            href={`#b-${h.id}`}
            className="nook-toc__item"
            style={{ paddingLeft: `${(depths[i] ?? 0) * 18}px` }}
            onClick={(e) => {
              e.preventDefault();
              scrollToBlock(editor, h.id);
            }}
          >
            {h.text}
          </a>
        ))
      )}
    </nav>
  );
}

/** Live table of contents built from the document's headings (levels 1–4). */
export const TableOfContentsBlock = createReactBlockSpec(tableOfContentsConfig, {
  render: TocView,
  toExternalHTML: ({ editor }) => (
    <nav className="nook-toc">
      {extractHeadings(editor.document as unknown as LooseBlock[]).map((h) => (
        <a key={h.id} href={`#b-${h.id}`}>
          {h.text}
        </a>
      ))}
    </nav>
  ),
});
