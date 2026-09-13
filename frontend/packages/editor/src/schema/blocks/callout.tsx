import { defaultProps } from '@blocknote/core';
import { createReactBlockSpec, type ReactCustomBlockRenderProps } from '@blocknote/react';
import { useEffect, useRef, useState } from 'react';

const PRESET_EMOJI = ['💡', '📌', '⚠️', '✅', '❌', '🔥', '📝', '💬', '🚀', '⭐', '❓', '🎯', '📚', '🧠', '⏰', '🔒'];

export const calloutConfig = {
  type: 'callout',
  propSchema: {
    textColor: defaultProps.textColor,
    backgroundColor: defaultProps.backgroundColor,
    textAlignment: defaultProps.textAlignment,
    icon: { default: '💡' },
  },
  content: 'inline',
} as const;

function CalloutView({ block, editor, contentRef }: ReactCustomBlockRenderProps<typeof calloutConfig>) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as globalThis.Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const setIcon = (icon: string) => {
    editor.updateBlock(block, { props: { icon } });
    setOpen(false);
  };

  return (
    <div className="nook-callout" data-testid="callout-block">
      <div className="nook-callout__icon" contentEditable={false} ref={root}>
        <button
          type="button"
          className="nook-callout__icon-btn"
          aria-label="Change callout icon"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.isEditable && setOpen((o) => !o)}
        >
          {block.props.icon || '💡'}
        </button>
        {open ? (
          <div className="nook-callout__picker" role="dialog" aria-label="Callout icon">
            <div className="nook-callout__grid">
              {PRESET_EMOJI.map((e) => (
                <button key={e} type="button" onClick={() => setIcon(e)} aria-label={e}>
                  {e}
                </button>
              ))}
            </div>
            <input
              className="nook-callout__input"
              placeholder="Type any emoji…"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && custom.trim()) setIcon(Array.from(custom.trim())[0] ?? '💡');
                if (e.key === 'Escape') setOpen(false);
              }}
            />
            <button type="button" className="nook-callout__remove" onClick={() => setIcon('')}>
              No icon
            </button>
          </div>
        ) : null}
      </div>
      <div className="nook-callout__content inline-content" ref={contentRef} />
    </div>
  );
}

/** Notion callout: emoji icon + coloured background, inline content, nestable children. */
export const CalloutBlock = createReactBlockSpec(calloutConfig, {
  render: CalloutView,
  toExternalHTML: ({ block, contentRef }) => (
    <div className="nook-callout" data-icon={block.props.icon}>
      <span className="nook-callout__icon">{block.props.icon}</span>
      <div ref={contentRef} />
    </div>
  ),
  parse: (el) => {
    if (el.tagName === 'DIV' && el.classList.contains('nook-callout')) {
      return { icon: el.getAttribute('data-icon') ?? '💡' };
    }
    return undefined;
  },
});
