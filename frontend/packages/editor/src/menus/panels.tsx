import { COLORS_DEFAULT } from '@blocknote/core';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  CheckSquareIcon,
  ChevronRightSquareIcon,
  CodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  ListIcon,
  ListOrderedIcon,
  MessageSquareQuoteIcon,
  QuoteIcon,
  TextIcon,
} from 'lucide-react';
import { Button } from '@nook/ui';
import type { AnyEditor } from '../types';

export interface TurnIntoTarget {
  label: string;
  type: string;
  props?: Record<string, string | number | boolean>;
  icon: ReactNode;
}

export const TURN_INTO_TARGETS: TurnIntoTarget[] = [
  { label: 'Text', type: 'paragraph', icon: <TextIcon size={16} /> },
  {
    label: 'Heading 1',
    type: 'heading',
    props: { level: 1, isToggleable: false },
    icon: <Heading1Icon size={16} />,
  },
  {
    label: 'Heading 2',
    type: 'heading',
    props: { level: 2, isToggleable: false },
    icon: <Heading2Icon size={16} />,
  },
  {
    label: 'Heading 3',
    type: 'heading',
    props: { level: 3, isToggleable: false },
    icon: <Heading3Icon size={16} />,
  },
  {
    label: 'Heading 4',
    type: 'heading',
    props: { level: 4, isToggleable: false },
    icon: <Heading4Icon size={16} />,
  },
  {
    label: 'Toggle heading 1',
    type: 'heading',
    props: { level: 1, isToggleable: true },
    icon: <ChevronRightSquareIcon size={16} />,
  },
  { label: 'Bulleted list', type: 'bulletListItem', icon: <ListIcon size={16} /> },
  { label: 'Numbered list', type: 'numberedListItem', icon: <ListOrderedIcon size={16} /> },
  { label: 'To-do list', type: 'checkListItem', icon: <CheckSquareIcon size={16} /> },
  { label: 'Toggle list', type: 'toggleListItem', icon: <ChevronRightSquareIcon size={16} /> },
  { label: 'Quote', type: 'quote', icon: <QuoteIcon size={16} /> },
  { label: 'Callout', type: 'callout', icon: <MessageSquareQuoteIcon size={16} /> },
  { label: 'Code', type: 'codeBlock', icon: <CodeIcon size={16} /> },
];

function Overlay({
  title,
  onClose,
  children,
  testId,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="nook-overlay"
      role="dialog"
      aria-label={title}
      data-testid={testId}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="nook-overlay__panel" ref={ref} tabIndex={-1}>
        <div className="nook-overlay__title">{title}</div>
        {children}
      </div>
    </div>
  );
}

/** "Turn into" — applies to the whole block selection, like Notion's `/turn`. */
export function TurnIntoPanel({
  editor,
  blockIds,
  onClose,
}: {
  editor: AnyEditor;
  blockIds: string[];
  onClose: () => void;
}) {
  return (
    <Overlay title="Turn into" onClose={onClose} testId="turn-into-panel">
      <div className="nook-overlay__grid">
        {TURN_INTO_TARGETS.map((t) => (
          <Button
            key={t.label}
            type="button"
            variant="ghost"
            size="sm"
            className="nook-overlay__item"
            onClick={() => {
              editor.transact(() => {
                for (const id of blockIds) {
                  if (!editor.getBlock(id)) continue;
                  editor.updateBlock(id, {
                    type: t.type,
                    ...(t.props ? { props: t.props } : {}),
                  } as never);
                }
              });
              onClose();
              editor.focus();
            }}
          >
            {t.icon}
            <span>{t.label}</span>
          </Button>
        ))}
      </div>
    </Overlay>
  );
}

/** Block text / background colour (`/color`), applied to the selected blocks. */
export function ColorPanel({
  editor,
  blockIds,
  onClose,
}: {
  editor: AnyEditor;
  blockIds: string[];
  onClose: () => void;
}) {
  const apply = (props: Record<string, string>) => {
    editor.transact(() => {
      for (const id of blockIds) {
        const block = editor.getBlock(id);
        if (!block) continue;
        const schemaProps = editor.schema.blockSchema[block.type]?.propSchema ?? {};
        const allowed: Record<string, string> = {};
        for (const [k, v] of Object.entries(props)) if (k in schemaProps) allowed[k] = v;
        if (Object.keys(allowed).length) editor.updateBlock(id, { props: allowed } as never);
      }
    });
    onClose();
    editor.focus();
  };
  const names = Object.keys(COLORS_DEFAULT);
  return (
    <Overlay title="Colour" onClose={onClose} testId="color-panel">
      <div className="nook-overlay__section">Text</div>
      <div className="nook-overlay__colors">
        {['default', ...names].map((c) => (
          <Button
            key={`t-${c}`}
            type="button"
            variant="ghost"
            size="sm"
            className="nook-overlay__swatch"
            data-kind="text"
            data-color={c}
            onClick={() => apply({ textColor: c })}
          >
            <span>A</span>
            {c}
          </Button>
        ))}
      </div>
      <div className="nook-overlay__section">Background</div>
      <div className="nook-overlay__colors">
        {['default', ...names].map((c) => (
          <Button
            key={`b-${c}`}
            type="button"
            variant="ghost"
            size="sm"
            className="nook-overlay__swatch"
            data-kind="background"
            data-color={c}
            onClick={() => apply({ backgroundColor: c })}
          >
            <span>A</span>
            {c}
          </Button>
        ))}
      </div>
    </Overlay>
  );
}

export function PanelShell({
  title,
  onClose,
  children,
  testId,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId: string;
}) {
  return (
    <Overlay title={title} onClose={onClose} testId={testId}>
      {children}
    </Overlay>
  );
}
