import type { DefaultReactSuggestionItem, SuggestionMenuProps } from '@blocknote/react';
import { CommandIcon, Loader2Icon, SearchIcon } from 'lucide-react';
import { Button } from '@nook/ui';

type NookSlashMenuProps = SuggestionMenuProps<DefaultReactSuggestionItem>;

/**
 * A calmer slash menu than BlockNote's stock list. Filtering is still owned by
 * SuggestionMenuController, so keyboard navigation and the editor contract stay
 * unchanged while the visual surface can feel like part of Nook.
 */
export function NookSlashMenu({
  items,
  loadingState,
  selectedIndex,
  onItemClick,
}: NookSlashMenuProps) {
  let currentGroup: string | undefined;

  return (
    <div
      id="bn-suggestion-menu"
      className="nook-slash-menu"
      role="listbox"
      aria-label="Block commands"
    >
      <div className="nook-slash-menu__header">
        <div className="nook-slash-menu__search-hint">
          <SearchIcon aria-hidden size={15} strokeWidth={1.8} />
          <span>Filter blocks</span>
          <kbd>/</kbd>
        </div>
        <span className="nook-slash-menu__count" aria-live="polite">
          {loadingState === 'loaded'
            ? `${items.length} ${items.length === 1 ? 'result' : 'results'}`
            : null}
        </span>
      </div>

      <div className="nook-slash-menu__list">
        {loadingState !== 'loaded' ? (
          <div className="nook-slash-menu__state" role="status">
            <Loader2Icon className="nook-slash-menu__spinner" aria-hidden size={17} />
            <span>Finding blocks…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="nook-slash-menu__state nook-slash-menu__state--empty" role="status">
            <CommandIcon aria-hidden size={18} strokeWidth={1.7} />
            <div>
              <strong>No matching blocks</strong>
              <span>Try a different command or press Escape</span>
            </div>
          </div>
        ) : (
          items.map((item, index) => {
            const showGroup = item.group !== currentGroup;
            currentGroup = item.group;
            return (
              <div key={`${item.group ?? 'other'}-${item.title}-${index}`}>
                {showGroup ? (
                  <div className="nook-slash-menu__group">{item.group ?? 'Blocks'}</div>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  id={`bn-suggestion-menu-item-${index}`}
                  className="nook-slash-menu__item"
                  role="option"
                  aria-selected={selectedIndex === index}
                  data-selected={selectedIndex === index || undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onItemClick?.(item)}
                >
                  <span className="nook-slash-menu__icon" aria-hidden>
                    {item.icon ?? <CommandIcon size={17} strokeWidth={1.7} />}
                  </span>
                  <span className="nook-slash-menu__copy">
                    <span className="nook-slash-menu__title">{item.title}</span>
                    {item.subtext ? (
                      <span className="nook-slash-menu__subtext">{item.subtext}</span>
                    ) : null}
                  </span>
                  {item.badge ? <kbd className="nook-slash-menu__badge">{item.badge}</kbd> : null}
                </Button>
              </div>
            );
          })
        )}
      </div>

      <div className="nook-slash-menu__footer">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> Navigate
        </span>
        <span>
          <kbd>↵</kbd> Insert
        </span>
      </div>
    </div>
  );
}
