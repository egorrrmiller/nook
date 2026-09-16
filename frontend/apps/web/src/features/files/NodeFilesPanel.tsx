import { useState } from 'react';
import { Loader2Icon, PaperclipIcon, RefreshCwIcon } from 'lucide-react';
import type { Attachment } from '@nook/api-client';
import { Button } from '@nook/ui';
import { useNodeFiles, useRemoveFile } from '../../lib/queries';
import { FileAttachmentCard } from './FileAttachmentCard';
import { useUiStore } from '../../stores/ui';

export function NodeFilesPanel({ workspaceId, nodeId, canEdit }: { workspaceId: string; nodeId: string; canEdit: boolean }) {
  const files = useNodeFiles(workspaceId, nodeId);
  const remove = useRemoveFile(workspaceId, nodeId);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const openFilePreview = useUiStore((s) => s.openFilePreview);

  if (files.isLoading) {
    return <div className="nook-files-panel__state" aria-busy="true"><Loader2Icon className="nook-file-card__spinner" /> Loading files…</div>;
  }
  if (files.isError) {
    return (
      <div className="nook-files-panel__state nook-files-panel__state--error" role="alert">
        <span>Files could not be loaded.</span>
        <Button type="button" variant="link" size="xs" onClick={() => void files.refetch()}>
          <RefreshCwIcon aria-hidden="true" /> Try again
        </Button>
      </div>
    );
  }
  const contentFiles = (files.data ?? []).filter((attachment) => attachment.purpose === 'content');
  if (!contentFiles.length) {
    return <div className="nook-files-panel__state"><PaperclipIcon aria-hidden="true" /> No files attached to this page.</div>;
  }

  const handleRemove = (attachment: Attachment) => {
    if (!window.confirm(`Remove “${attachment.filename}” from this page?`)) return;
    setRemovingId(attachment.id);
    remove.mutate(attachment.id, { onSettled: () => setRemovingId(null) });
  };

  return (
    <div className="nook-files-panel" data-testid="node-files-panel">
      <div className="nook-files-panel__heading">
        <span>Files</span>
        <span>{contentFiles.length}</span>
      </div>
      {contentFiles.map((attachment) => (
        <div key={attachment.id} className={removingId === attachment.id ? 'nook-files-panel__removing' : undefined}>
          <FileAttachmentCard
            attachment={attachment}
            compact
            onPreview={(resource) => openFilePreview({ id: attachment.id, name: resource.name, mime: resource.mime, url: resource.url })}
            // A block-linked file is still referenced by the editor. Removing its
            // attachment row here would leave a broken media block behind.
            onRemove={canEdit && !attachment.blockId && !attachment.propertyId ? () => handleRemove(attachment) : undefined}
          />
        </div>
      ))}
      {remove.isError ? <p className="nook-files-panel__error" role="alert">The file could not be removed. Try again.</p> : null}
    </div>
  );
}
