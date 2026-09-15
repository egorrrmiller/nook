import { BookOpenIcon, Maximize2Icon, Minimize2Icon, PanelRightIcon } from 'lucide-react';
import { IconButton, Toolbar } from '@nook/ui';
import type { PageMode } from '../../stores/ui';

export interface PageToolbarProps {
  mode: PageMode;
  inspectorOpen: boolean;
  onToggleReadMode: () => void;
  onToggleFocusMode: () => void;
  onToggleInspector: () => void;
}

/** Page-level controls shared by edit, read and focus presentations. */
export function PageToolbar({
  mode,
  inspectorOpen,
  onToggleReadMode,
  onToggleFocusMode,
  onToggleInspector,
}: PageToolbarProps) {
  const readMode = mode === 'read';
  const focusMode = mode === 'focus';

  return (
    <Toolbar className="nook-page__toolbar" aria-label="Page view controls">
      <div className="nook-page__toolbar-group">
        <span className="nook-page__mode-label" aria-live="polite">
          {readMode ? 'Reading' : focusMode ? 'Focus' : 'Editing'}
        </span>
        <IconButton
          label={readMode ? 'Exit read mode' : 'Read mode'}
          tooltip={false}
          variant="subtle"
          size="icon-sm"
          title={readMode ? 'Exit read mode' : 'Read mode'}
          data-testid="toggle-read-mode"
          aria-pressed={readMode}
          onClick={onToggleReadMode}
        >
          <BookOpenIcon size={16} strokeWidth={1.8} />
        </IconButton>
        <IconButton
          label={focusMode ? 'Exit focus mode' : 'Focus mode'}
          tooltip={false}
          variant="subtle"
          size="icon-sm"
          title={focusMode ? 'Exit focus mode' : 'Focus mode'}
          data-testid="toggle-focus-mode"
          aria-pressed={focusMode}
          onClick={onToggleFocusMode}
        >
          {focusMode ? <Minimize2Icon size={16} strokeWidth={1.8} /> : <Maximize2Icon size={16} strokeWidth={1.8} />}
        </IconButton>
        <IconButton
          label="Page details"
          tooltip={false}
          variant="subtle"
          size="icon-sm"
          title="Page details"
          data-testid="toggle-inspector"
          aria-pressed={inspectorOpen}
          onClick={onToggleInspector}
        >
          <PanelRightIcon size={16} strokeWidth={1.8} />
        </IconButton>
      </div>
    </Toolbar>
  );
}
