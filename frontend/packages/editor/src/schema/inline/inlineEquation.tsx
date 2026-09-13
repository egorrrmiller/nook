import { createReactInlineContentSpec, SourceInlineContentWithPreview } from '@blocknote/react';
import { useMemo } from 'react';
import { renderKatex } from '../blocks/equation';

export const inlineEquationConfig = {
  type: 'inlineEquation',
  propSchema: {},
  content: 'plain',
} as const;

/** Inline KaTeX equation; source edited in BlockNote's inline source popup. */
export const InlineEquationInline = createReactInlineContentSpec(inlineEquationConfig, {
  meta: { code: true, hasPreview: true, highlight: () => 'latex' },
  render: ({ inlineContent, editor, node, getPos, contentRef }) => {
    const source = inlineContent.content;
    // eslint-disable-next-line react-hooks/rules-of-hooks -- render is a component body
    const rendered = useMemo(() => renderKatex(source, false), [source]);
    return (
      <SourceInlineContentWithPreview
        editor={editor}
        node={node}
        getPos={getPos}
        contentRef={contentRef}
        source={source}
        sourcePlaceholder="LaTeX, e.g. \\frac{a}{b}"
        emptySourcePlaceholder="equation"
        error={rendered.error}
        preview={rendered.html ? <span className="nook-inline-equation" dangerouslySetInnerHTML={{ __html: rendered.html }} /> : undefined}
      />
    );
  },
  toExternalHTML: ({ inlineContent }) => {
    const r = renderKatex(inlineContent.content, false);
    return r.html ? <span className="nook-inline-equation" dangerouslySetInnerHTML={{ __html: r.html }} /> : <code>{inlineContent.content}</code>;
  },
});
