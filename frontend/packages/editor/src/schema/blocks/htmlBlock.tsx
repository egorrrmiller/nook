import { createReactBlockSpec, SourceBlockWithPreview, type ReactCustomBlockRenderProps } from '@blocknote/react';
import { useEffect, useRef, useState } from 'react';
import { plainSource } from '../../util/text';

export const htmlBlockConfig = {
  type: 'htmlBlock',
  propSchema: {
    height: { default: 240, type: 'number' },
  },
  content: 'plain',
} as const;

const BASE_STYLE =
  '<style>html,body{margin:0;font:14px/1.5 Inter,system-ui,sans-serif;color:#37352f}@media(prefers-color-scheme:dark){html,body{color:#d4d4d4}}</style>';

/**
 * Sandboxed HTML block: the source is rendered through `<iframe sandbox="" srcdoc>` — no scripts,
 * no same-origin access, no navigation. It can never touch the page context or the session cookie.
 */
function HtmlView({ block, editor, contentRef }: ReactCustomBlockRenderProps<typeof htmlBlockConfig>) {
  const source = plainSource(block.content);
  const [height, setHeight] = useState(block.props.height);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => setHeight(block.props.height), [block.props.height]);

  return (
    <SourceBlockWithPreview
      block={block}
      editor={editor}
      contentRef={contentRef}
      source={source}
      sourcePlaceholder="<div>Hello world</div>"
      emptySourcePlaceholder="Add HTML"
      preview={
        <div className="nook-html" data-testid="html-block">
          <iframe
            ref={frame}
            title="HTML block"
            sandbox=""
            srcDoc={`<!doctype html><html><head><meta charset="utf-8">${BASE_STYLE}</head><body>${source}</body></html>`}
            style={{ height }}
          />
          {editor.isEditable ? (
            <div
              className="nook-html__resize"
              role="separator"
              aria-label="Resize HTML block"
              onPointerDown={(e) => {
                e.preventDefault();
                const startY = e.clientY;
                const startH = height;
                const move = (ev: PointerEvent) => setHeight(Math.max(60, Math.round(startH + ev.clientY - startY)));
                const up = (ev: PointerEvent) => {
                  window.removeEventListener('pointermove', move);
                  editor.updateBlock(block.id, { props: { height: Math.max(60, Math.round(startH + ev.clientY - startY)) } });
                };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', up, { once: true });
              }}
            />
          ) : null}
        </div>
      }
    />
  );
}

export const HtmlBlock = createReactBlockSpec(htmlBlockConfig, {
  meta: { code: true, hasPreview: true, hardBreakShortcut: 'enter', highlight: () => 'html' },
  render: HtmlView,
  toExternalHTML: ({ block }) => <pre data-html-block>{plainSource(block.content)}</pre>,
});
