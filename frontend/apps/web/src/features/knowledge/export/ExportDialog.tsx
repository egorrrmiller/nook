import { useEffect, useState } from 'react';
import { DownloadIcon, FileCodeIcon, FileTextIcon, Loader2Icon } from 'lucide-react';
import type { ExportFormat } from '@nook/api-client';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, cn } from '@nook/ui';
import { api } from '../../../lib/api';
import { useNode } from '../../../lib/queries';
import { nodeTitle } from '../../../lib/utils';

type Phase = { kind: 'idle' } | { kind: 'working' } | { kind: 'done'; size: number; filename: string } | { kind: 'error'; message: string };

function fileNameFrom(disposition: string | null, fallback: string): string {
  const m = disposition && /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return m?.[1] ? decodeURIComponent(m[1]) : fallback;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Export dialog (contracts §9.8): builds a zip on the server and triggers the browser download. */
export function ExportDialog({ workspaceId, nodeIds, open, onOpenChange }: { workspaceId: string; nodeIds: string[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [includeChildren, setIncludeChildren] = useState(true);
  const [includeFiles, setIncludeFiles] = useState(true);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const single = nodeIds.length === 1 ? nodeIds[0]! : null;
  const { data: node } = useNode(workspaceId, single ?? '');

  useEffect(() => {
    if (open) setPhase({ kind: 'idle' });
  }, [open]);

  const title = single ? nodeTitle(node?.title) : `${nodeIds.length} pages`;
  const baseName = (single ? nodeTitle(node?.title) : 'workspace').replace(/[\\/:*?"<>|]+/g, '_');

  const run = async () => {
    setPhase({ kind: 'working' });
    try {
      const blob = await api.exportZip({ nodeIds, includeChildren, format, includeFiles });
      const filename = fileNameFrom(null, `${baseName}-export.zip`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setPhase({ kind: 'done', size: blob.size, filename });
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'Export failed' });
    }
  };

  const working = phase.kind === 'working';

  return (
    <Dialog open={open} onOpenChange={(o) => !working && onOpenChange(o)}>
      <DialogContent aria-label="Export" data-testid="export-dialog" className="max-w-md">
        <DialogTitle>Export</DialogTitle>
        <DialogDescription>
          {single ? (
            <>
              Export <span className="font-medium text-foreground">{title}</span>
              {includeChildren ? ' and its sub-pages' : ''} as a zip archive.
            </>
          ) : (
            <>Export {title} as a zip archive.</>
          )}
        </DialogDescription>

        <fieldset className="mt-1 flex flex-col gap-1" disabled={working}>
          <legend className="mb-1 text-xs font-medium text-muted-foreground">Format</legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Export format">
            {(
              [
                ['markdown', 'Markdown', FileTextIcon, 'Frontmatter, relative links, files/ folder'],
                ['html', 'HTML', FileCodeIcon, 'Standalone pages with a minimal stylesheet'],
              ] as const
            ).map(([value, label, Icon, hint]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={format === value}
                data-testid={`export-format-${value}`}
                onClick={() => setFormat(value)}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-md border border-border p-3 text-left transition-colors hover:bg-accent',
                  format === value && 'border-primary bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]',
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Icon className="size-4 text-muted-foreground" /> {label}
                </span>
                <span className="text-[11px] text-muted-foreground">{hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-1.5 text-sm" disabled={working}>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={includeChildren} onChange={(e) => setIncludeChildren(e.target.checked)} className="accent-[var(--primary)]" />
            Include sub-pages
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={includeFiles} onChange={(e) => setIncludeFiles(e.target.checked)} className="accent-[var(--primary)]" />
            Include files and images
          </label>
        </fieldset>

        {phase.kind === 'working' ? (
          <div className="mt-1" aria-live="polite">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full w-1/3 animate-[nook-indeterminate_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2Icon className="size-3.5 animate-spin" /> Preparing your archive…
            </p>
            <style>{`@keyframes nook-indeterminate{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
          </div>
        ) : phase.kind === 'done' ? (
          <p className="text-xs text-muted-foreground" aria-live="polite" data-testid="export-done">
            Downloaded <span className="font-medium text-foreground">{phase.filename}</span> ({formatBytes(phase.size)}).
          </p>
        ) : phase.kind === 'error' ? (
          <p role="alert" className="text-xs text-destructive">
            {phase.message}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={working}>
            {phase.kind === 'done' ? 'Close' : 'Cancel'}
          </Button>
          <Button onClick={run} disabled={working || nodeIds.length === 0} data-testid="export-run">
            <DownloadIcon /> {phase.kind === 'done' ? 'Export again' : 'Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
