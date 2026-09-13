import { useEffect, useRef } from 'react';
import { AtSignIcon, BookmarkIcon, FrameIcon, LinkIcon } from 'lucide-react';

export type PasteChoice = 'bookmark' | 'embed' | 'mention' | 'link';

export interface PasteChoiceState {
  url: string;
  /** Screen position of the caret when the URL was pasted. */
  rect: { top: number; left: number };
  /** "Mention" is only offered for links to pages of this workspace. */
  allowMention: boolean;
  allowEmbed: boolean;
  onChoose: (choice: PasteChoice) => void;
  onDismiss: () => void;
}

/** Notion's post-paste prompt: Bookmark / Embed / Mention / Plain link. */
export function PasteChoicePopover({ state }: { state: PasteChoiceState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') state.onDismiss();
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as globalThis.Node)) state.onDismiss();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [state]);

  const options: { id: PasteChoice; label: string; hint: string; icon: React.ReactNode; show: boolean }[] = [
    { id: 'link', label: 'Plain link', hint: 'Keep the URL as a link', icon: <LinkIcon size={14} />, show: true },
    { id: 'bookmark', label: 'Create bookmark', hint: 'Visual link preview', icon: <BookmarkIcon size={14} />, show: true },
    { id: 'embed', label: 'Create embed', hint: 'Interactive iframe', icon: <FrameIcon size={14} />, show: state.allowEmbed },
    { id: 'mention', label: 'Mention this page', hint: 'Inline page link', icon: <AtSignIcon size={14} />, show: state.allowMention },
  ];

  return (
    <div
      className="nook-paste-popover"
      role="menu"
      aria-label="Paste as"
      data-testid="paste-choice"
      ref={ref}
      style={{ top: state.rect.top, left: state.rect.left }}
    >
      {options
        .filter((o) => o.show)
        .map((o) => (
          <button key={o.id} type="button" role="menuitem" onMouseDown={(e) => e.preventDefault()} onClick={() => state.onChoose(o.id)}>
            {o.icon}
            <span className="nook-paste-popover__label">{o.label}</span>
            <span className="nook-paste-popover__hint">{o.hint}</span>
          </button>
        ))}
    </div>
  );
}
