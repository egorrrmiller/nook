import { createReactBlockSpec, SourceBlockWithPreview, type ReactCustomBlockRenderProps } from '@blocknote/react';
import { useEffect, useRef, useState } from 'react';
import type mermaidModule from 'mermaid';
import { plainSource } from '../../util/text';

export const mermaidConfig = {
  type: 'mermaid',
  propSchema: {},
  content: 'plain',
} as const;

type MermaidApi = typeof mermaidModule;
let mermaidPromise: Promise<MermaidApi> | null = null;

/** Lazily loads mermaid (≈ 1 MB) the first time a diagram block renders. */
function loadMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= import('mermaid').then((m) => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark' || document.documentElement.classList.contains('dark');
    m.default.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'default', fontFamily: 'inherit' });
    return m.default;
  });
  return mermaidPromise;
}

let seq = 0;

export function useMermaid(source: string): { svg: string; error: string | null; loading: boolean } {
  const [state, setState] = useState<{ svg: string; error: string | null; loading: boolean }>({ svg: '', error: null, loading: !!source });
  const lastGood = useRef('');

  useEffect(() => {
    if (!source.trim()) {
      setState({ svg: '', error: null, loading: false });
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      loadMermaid()
        .then(async (m) => {
          await m.parse(source);
          const id = `nook-mermaid-${++seq}`;
          const { svg } = await m.render(id, source);
          if (!live) return;
          lastGood.current = svg;
          setState({ svg, error: null, loading: false });
        })
        .catch((e: unknown) => {
          if (!live) return;
          const msg = e instanceof Error ? e.message : String(e);
          setState({ svg: lastGood.current, error: msg.split('\n')[0] ?? msg, loading: false });
          // mermaid leaves an error node in the DOM on failure
          document.querySelectorAll('[id^="dnook-mermaid-"]').forEach((el) => el.remove());
        });
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [source]);

  return state;
}

function MermaidView({ block, editor, contentRef }: ReactCustomBlockRenderProps<typeof mermaidConfig>) {
  const source = plainSource(block.content);
  const { svg, error, loading } = useMermaid(source);
  return (
    <SourceBlockWithPreview
      block={block}
      editor={editor}
      contentRef={contentRef}
      source={source}
      sourcePlaceholder={'graph TD\n  A[Start] --> B[End]'}
      emptySourcePlaceholder="Add a Mermaid diagram"
      error={error}
      preview={
        svg ? (
          <div className="nook-mermaid" data-testid="mermaid-block" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : loading ? (
          <div className="nook-mermaid nook-mermaid--loading">Rendering diagram…</div>
        ) : undefined
      }
    />
  );
}

/** Mermaid diagram; Enter inserts newlines (multi-line source), Escape / OK closes the popup. */
export const MermaidBlock = createReactBlockSpec(mermaidConfig, {
  meta: { code: true, hasPreview: true, hardBreakShortcut: 'enter', highlight: () => 'mermaid' },
  render: MermaidView,
  toExternalHTML: ({ block }) => (
    <pre className="nook-mermaid" data-mermaid>
      {plainSource(block.content)}
    </pre>
  ),
});
