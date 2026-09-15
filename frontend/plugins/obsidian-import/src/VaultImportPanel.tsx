import { useMemo, useState, type ChangeEvent } from 'react';
import { importVault, previewVault, type VaultFile, ObsidianImportError } from './api';
import type { ObsidianImportResult, ObsidianImportUnavailable, ObsidianPreview } from './types';
import './styles.css';

export function VaultImportPanel({ workspaceId }: { workspaceId: string }) {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [preview, setPreview] = useState<ObsidianPreview | null>(null);
  const [result, setResult] = useState<ObsidianImportResult | ObsidianImportUnavailable | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preview' | 'import' | null>(null);

  const hasErrors = useMemo(() => preview?.diagnostics.some((item) => item.severity === 'error') ?? false, [preview]);

  function onFilesChanged(event: ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(event.currentTarget.files ?? []));
    setPreview(null);
    setResult(null);
    setError(null);
  }

  async function handlePreview() {
    if (!files.length) return;
    setBusy('preview');
    setError(null);
    setResult(null);
    try {
      setPreview(await previewVault(workspaceId, files));
    } catch (cause) {
      setError(cause instanceof ObsidianImportError ? cause.message : 'Could not preview this vault.');
    } finally {
      setBusy(null);
    }
  }

  async function handleImport() {
    if (!files.length || !preview || hasErrors) return;
    setBusy('import');
    setError(null);
    try {
      setResult(await importVault(workspaceId, files));
    } catch (cause) {
      setError(cause instanceof ObsidianImportError ? cause.message : 'Could not import this vault.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="nook-obsidian-import" data-testid="obsidian-import-panel">
      <p className="nook-obsidian-import__description">
        Select a local vault to inspect its pages, folders, properties, links and attachments before importing.
      </p>
      <label className="nook-obsidian-import__dropzone">
        <span className="nook-obsidian-import__dropzone-title">Choose Obsidian vault folder</span>
        <span className="nook-obsidian-import__dropzone-hint">Nothing is uploaded until you click Preview.</span>
        <input
          type="file"
          multiple
          onChange={onFilesChanged}
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        />
      </label>

      {files.length ? <p className="nook-obsidian-import__count">{files.length} files selected</p> : null}

      <div className="nook-obsidian-import__actions">
        <button type="button" onClick={handlePreview} disabled={!files.length || busy !== null}>
          {busy === 'preview' ? 'Preparing preview…' : 'Preview import'}
        </button>
        <button type="button" onClick={handleImport} disabled={!preview || hasErrors || busy !== null}>
          {busy === 'import' ? 'Importing…' : 'Import vault'}
        </button>
      </div>

      {error ? <p className="nook-obsidian-import__error" role="alert">{error}</p> : null}
      {preview ? <PreviewReport preview={preview} /> : null}
      {result ? <ImportReport result={result} /> : null}
    </section>
  );
}

function PreviewReport({ preview }: { preview: ObsidianPreview }) {
  return (
    <div className="nook-obsidian-import__report" data-testid="obsidian-preview-report">
      <div className="nook-obsidian-import__summary">
        <span>{preview.pages} pages</span>
        <span>{preview.folders} folders</span>
        <span>{preview.attachments} attachments</span>
        <span>{preview.brokenReferences} broken links</span>
      </div>
      {preview.diagnostics.length ? (
        <ul className="nook-obsidian-import__diagnostics">
          {preview.diagnostics.map((diagnostic, index) => (
            <li key={`${diagnostic.code}:${diagnostic.path ?? ''}:${index}`} className={`is-${diagnostic.severity}`}>
              <strong>{diagnostic.severity === 'error' ? 'Error' : 'Warning'}</strong>
              {diagnostic.path ? <code>{diagnostic.path}</code> : null}
              <span>{diagnostic.message}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="nook-obsidian-import__ok">No validation issues found.</p>
      )}
      {preview.pagePreview.length ? (
        <ul className="nook-obsidian-import__pages">
          {preview.pagePreview.slice(0, 20).map((page) => (
            <li key={page.path}>
              <span>{page.title}</span>
              <code>{page.path}</code>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ImportReport({ result }: { result: ObsidianImportResult | ObsidianImportUnavailable }) {
  if ('code' in result) {
    return <p className="nook-obsidian-import__error" role="status">Preview is ready, but this Nook host has not configured the vault write adapter yet.</p>;
  }
  return (
    <p className="nook-obsidian-import__ok" role="status">
      Imported {result.pagesCreated} pages, {result.foldersCreated} folders and {result.attachmentsCreated} attachments.
    </p>
  );
}
