import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangleIcon, CheckCircle2Icon, FileUpIcon, Loader2Icon, UploadIcon, XIcon } from 'lucide-react';
import { isImportJobAccepted, type ImportResult } from '@nook/api-client';
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, IconButton, Radio, cn } from '@nook/ui';
import { api } from '../../../lib/api';
import { invalidateNodeLists, useNode } from '../../../lib/queries';
import { nodeTitle } from '../../../lib/utils';
import { HiddenFileInput } from '../../../components/shared/HiddenFileInput';

const ACCEPT = '.md,.markdown,.txt,.html,.csv,.zip';
const EXT_RE = /\.(md|markdown|txt|html|csv|zip)$/i;

type Phase =
  | { kind: 'idle' }
  | { kind: 'uploading' }
  | { kind: 'queued'; jobId: string; status: string }
  | { kind: 'done'; result: ImportResult }
  | { kind: 'error'; message: string };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Import dialog (contracts §9.8): md / html / txt / csv / zip → pages under the current page or the root. */
export function ImportDialog({
  workspaceId,
  parentId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  parentId?: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: parent } = useNode(workspaceId, parentId ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState<'current' | 'root'>(parentId ? 'current' : 'root');
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (open) {
      setPhase({ kind: 'idle' });
      setFile(null);
      setTarget(parentId ? 'current' : 'root');
      cancelled.current = false;
    } else cancelled.current = true;
  }, [open, parentId]);

  const pick = (f: File | null | undefined) => {
    if (!f) return;
    if (!EXT_RE.test(f.name)) {
      setPhase({ kind: 'error', message: `Unsupported file type. Use ${ACCEPT.replaceAll(',', ', ')}.` });
      return;
    }
    setPhase({ kind: 'idle' });
    setFile(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
  };

  const run = async () => {
    if (!file) return;
    setPhase({ kind: 'uploading' });
    try {
      const res = await api.importFile(file, { parentId: target === 'current' ? parentId ?? null : null });
      let result: ImportResult;
      if (isImportJobAccepted(res)) {
        setPhase({ kind: 'queued', jobId: res.jobId, status: 'queued' });
        for (;;) {
          await sleep(1000);
          if (cancelled.current) return;
          const st = await api.importStatus(res.jobId);
          if (st.status === 'done' && st.result) {
            result = st.result;
            break;
          }
          if (st.status === 'failed') throw new Error('Import failed on the server');
          setPhase({ kind: 'queued', jobId: res.jobId, status: st.status });
        }
      } else result = res;
      void invalidateNodeLists(qc, workspaceId);
      setPhase({ kind: 'done', result });
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : 'Import failed' });
    }
  };

  const busy = phase.kind === 'uploading' || phase.kind === 'queued';
  const first = phase.kind === 'done' ? phase.result.nodeIds[0] : undefined;
  const openFirst = () => {
    if (!first) return;
    onOpenChange(false);
    void navigate({ to: '/w/$workspaceId/p/$nodeId', params: { workspaceId, nodeId: first } });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent aria-label="Import" data-testid="import-dialog" className="max-w-md">
        <DialogTitle>Import</DialogTitle>
        <DialogDescription>Markdown, HTML, text, CSV or a zip of them. Folders become parent pages.</DialogDescription>

        {phase.kind === 'done' ? (
          <div className="flex flex-col gap-2" data-testid="import-result" aria-live="polite">
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2Icon className="size-4 text-[#448361]" />
              Imported <span className="font-medium">{phase.result.pagesCreated}</span> {phase.result.pagesCreated === 1 ? 'page' : 'pages'}.
            </p>
            {phase.result.warnings.length ? (
              <ul className="flex flex-col gap-1 rounded-md bg-muted p-2 text-xs">
                {phase.result.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-muted-foreground">
                    <AlertTriangleIcon className="mt-px size-3.5 shrink-0 text-[#cb912f]" /> {w}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <>
            <div
              role="button"
              tabIndex={0}
              data-testid="import-dropzone"
              aria-label="Choose a file to import"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border-strong px-4 py-6 text-center transition-colors hover:bg-accent',
                dragging && 'border-primary bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]',
                busy && 'pointer-events-none opacity-60',
              )}
            >
              <HiddenFileInput
                inputRef={inputRef}
                accept={ACCEPT}
                data-testid="import-file-input"
                className="sr-only"
                onClick={(e) => e.stopPropagation()}
                onFile={pick}
              />
              {file ? (
                <>
                  <FileUpIcon className="size-6 text-muted-foreground" />
                  <span className="flex items-center gap-1 text-sm font-medium">
                    {file.name}
                    <IconButton
                      label="Remove file"
                      size="icon-sm"
                      tooltip={false}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                      className="text-muted-foreground hover:bg-accent-strong hover:text-foreground"
                    >
                      <XIcon className="size-3.5" />
                    </IconButton>
                  </span>
                  <span className="text-[11px] text-muted-foreground">{formatBytes(file.size)}</span>
                </>
              ) : (
                <>
                  <UploadIcon className="size-6 text-muted-foreground" />
                  <span className="text-sm">
                    Drop a file here or <span className="font-medium text-primary">browse</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">.md · .html · .txt · .csv · .zip</span>
                </>
              )}
            </div>

            <fieldset className="flex flex-col gap-1.5 text-sm" disabled={busy}>
              <legend className="mb-1 text-xs font-medium text-muted-foreground">Import into</legend>
              {parentId ? (
                <label className="flex cursor-pointer items-center gap-2">
                  <Radio name="import-target" checked={target === 'current'} onChange={() => setTarget('current')} />
                  <span>
                    Inside <span className="font-medium">{nodeTitle(parent?.title)}</span>
                  </span>
                </label>
              ) : null}
              <label className="flex cursor-pointer items-center gap-2">
                <Radio name="import-target" checked={target === 'root'} onChange={() => setTarget('root')} />
                Workspace root
              </label>
            </fieldset>
          </>
        )}

        {busy ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
            <Loader2Icon className="size-3.5 animate-spin" />
            {phase.kind === 'uploading' ? 'Uploading…' : `Large archive — processing in the background (${phase.status})…`}
          </p>
        ) : phase.kind === 'error' ? (
          <p role="alert" className="text-xs text-destructive">
            {phase.message}
          </p>
        ) : null}

        <DialogFooter>
          {phase.kind === 'done' ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button onClick={openFirst} disabled={!first} data-testid="import-open-first">
                Open page
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={run} disabled={!file || busy} data-testid="import-run">
                <UploadIcon /> Import
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
