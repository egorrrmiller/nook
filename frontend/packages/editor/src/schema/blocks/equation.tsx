import { createReactBlockSpec, SourceBlockWithPreview, type ReactCustomBlockRenderProps } from '@blocknote/react';
import { useMemo } from 'react';
import katex from 'katex';
import { plainSource } from '../../util/text';

export const equationConfig = {
  type: 'equation',
  propSchema: {},
  content: 'plain',
} as const;

export function renderKatex(src: string, displayMode: boolean): { html: string; error: string | null } {
  try {
    return { html: katex.renderToString(src, { displayMode, throwOnError: true, strict: 'ignore', output: 'htmlAndMathml' }), error: null };
  } catch (e) {
    return { html: '', error: e instanceof Error ? e.message.replace(/^KaTeX parse error: /, '') : String(e) };
  }
}

function EquationView({ block, editor, contentRef }: ReactCustomBlockRenderProps<typeof equationConfig>) {
  const source = plainSource(block.content);
  const rendered = useMemo(() => renderKatex(source, true), [source]);
  return (
    <SourceBlockWithPreview
      block={block}
      editor={editor}
      contentRef={contentRef}
      source={source}
      sourcePlaceholder="Enter a LaTeX equation, e.g. E = mc^2"
      emptySourcePlaceholder="Add a block equation"
      error={rendered.error}
      preview={
        rendered.html ? (
          <div className="nook-equation" data-testid="equation-block" dangerouslySetInnerHTML={{ __html: rendered.html }} />
        ) : undefined
      }
    />
  );
}

/** Block equation rendered with KaTeX; the LaTeX source is edited in BlockNote's source popup. */
export const EquationBlock = createReactBlockSpec(equationConfig, {
  meta: { code: true, hasPreview: true, highlight: () => 'latex' },
  render: EquationView,
  toExternalHTML: ({ block }) => {
    const src = plainSource(block.content);
    const r = renderKatex(src, true);
    return r.html ? <div className="nook-equation" data-latex={src} dangerouslySetInnerHTML={{ __html: r.html }} /> : <pre data-latex={src}>{src}</pre>;
  },
});
