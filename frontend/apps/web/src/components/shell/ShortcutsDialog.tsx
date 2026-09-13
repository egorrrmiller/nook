import { Dialog, DialogContent, DialogDescription, DialogTitle, Kbd } from '@nook/ui';
import { modKey } from '../../lib/utils';
import { useUiStore } from '../../stores/ui';

interface Shortcut {
  keys: string[];
  label: string;
}

export function shortcutGroups(mod: string): { title: string; items: Shortcut[] }[] {
  return [
    {
      title: 'Navigation',
      items: [
        { keys: [mod, 'K'], label: 'Quick find (pages, actions, plugins)' },
        { keys: [mod, 'P'], label: 'Quick find (alias of ⌘K)' },
        { keys: [mod, '⇧', 'F'], label: 'Search everything (full text)' },
        { keys: [mod, '\\'], label: 'Show / hide the sidebar' },
        { keys: [mod, ','], label: 'Open settings' },
        { keys: ['↑', '↓'], label: 'Move between sidebar pages' },
        { keys: ['→', '←'], label: 'Expand / collapse a sidebar page' },
        { keys: ['Enter'], label: 'Open the focused sidebar page' },
      ],
    },
    {
      title: 'Tabs',
      items: [
        { keys: [mod, 'T'], label: 'New tab' },
        { keys: [mod, 'W'], label: 'Close tab' },
        { keys: [mod, '⇧', ']'], label: 'Next tab' },
        { keys: [mod, '⇧', '['], label: 'Previous tab' },
        { keys: ['Middle click'], label: 'Close a tab' },
      ],
    },
    {
      title: 'Pages',
      items: [
        { keys: [mod, '⇧', 'N'], label: 'New page' },
        { keys: [mod, 'D'], label: 'Duplicate the current page' },
        { keys: [mod, '⇧', 'P'], label: 'Move the current page to…' },
        { keys: ['Double click'], label: 'Rename a page in the sidebar' },
        { keys: ['Space'], label: 'Pick up / drop a page (keyboard drag)' },
        { keys: ['Esc'], label: 'Close the dialog, palette or drag' },
      ],
    },
  ];
}

export function ShortcutsDialog() {
  const open = useUiStore((s) => s.shortcutsOpen);
  const setOpen = useUiStore((s) => s.setShortcutsOpen);
  const groups = shortcutGroups(modKey());
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl" data-testid="shortcuts-dialog">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription>Everything the shell listens for. Editor shortcuts live in the editor’s own help.</DialogDescription>
        <div className="mt-2 grid max-h-[60vh] grid-cols-1 gap-6 overflow-y-auto sm:grid-cols-2">
          {groups.map((g) => (
            <section key={g.title}>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-fg-muted uppercase">{g.title}</h3>
              <ul className="flex flex-col gap-1.5">
                {g.items.map((s) => (
                  <li key={s.label} className="flex items-center gap-3 text-sm">
                    <span className="min-w-0 flex-1 text-fg-secondary">{s.label}</span>
                    <span className="flex shrink-0 gap-1">
                      {s.keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
