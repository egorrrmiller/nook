import { useEffect, useState, type KeyboardEvent } from 'react';
import { CopyIcon, FileWarningIcon, Loader2Icon, RefreshCwIcon } from 'lucide-react';
import type { Node } from '@nook/api-client';
import { Button, IconButton, Input } from '@nook/ui';
import { BacklinksPanel } from '../knowledge';
import { NodeIcon } from '../../components/tree/NodeIcon';
import { useNodeFiles, useUpdateNode } from '../../lib/queries';
import { copyPageLink, nodeTitle } from '../../lib/utils';
import { FileViewer } from './FileViewer';
import './file-node.css';

/** Full workspace surface for a first-class file node in the sidebar tree. */
export function FileNodeView({ workspaceId, node }: { workspaceId: string; node: Node }) {
  const files = useNodeFiles(workspaceId, node.id);
  const update = useUpdateNode(workspaceId);
  const [title, setTitle] = useState(node.title);

  useEffect(() => setTitle(node.title), [node.id, node.title]);

  const saveTitle = () => {
    const next = title.trim();
    if (next !== node.title) update.mutate({ id: node.id, title: next });
  };
  const onTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur();
    if (event.key === 'Escape') {
      setTitle(node.title);
      event.currentTarget.blur();
    }
  };

  const attachment = files.data?.find((file) => file.purpose === 'content') ?? files.data?.[0];
  const target = attachment
    ? { id: attachment.id, name: attachment.filename, mime: attachment.mime, url: attachment.url }
    : null;
  const pageLinkBase = `/w/${workspaceId}/p/${node.id}`;

  return (
    <div className="nook-file-node" data-testid="file-node-view">
      <main className="nook-file-node__main">
        <header className="nook-file-node__titlebar">
          <NodeIcon icon={node.icon} kind="file" size={24} />
          <Input
            value={title}
            aria-label="File title"
            readOnly={node.effectiveRole === 'viewer'}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={saveTitle}
            onKeyDown={onTitleKeyDown}
            className="nook-file-node__title"
          />
          <IconButton label="Copy file link" onClick={() => void copyPageLink(node)}>
            <CopyIcon />
          </IconButton>
        </header>

        {files.isPending ? (
          <div className="nook-file-node__state">
            <Loader2Icon className="nook-file-viewer__spin" /> Loading file…
          </div>
        ) : null}
        {files.isError ? (
          <div className="nook-file-node__state nook-file-node__state--error">
            <FileWarningIcon /> The file could not be loaded.
            <Button variant="link" size="xs" onClick={() => void files.refetch()}>
              <RefreshCwIcon /> Retry
            </Button>
          </div>
        ) : null}
        {!files.isPending && !files.isError && !target ? (
          <div className="nook-file-node__state">
            <FileWarningIcon /> This file node has no content.
          </div>
        ) : null}
        {target ? <FileViewer target={target} pageLinkBase={pageLinkBase} /> : null}
      </main>

      <aside className="nook-file-node__references" aria-label="File references">
        <header>
          <strong>References</strong>
          <span>{nodeTitle(node.title)}</span>
        </header>
        <div className="nook-file-node__references-body">
          <BacklinksPanel workspaceId={workspaceId} nodeId={node.id} />
        </div>
      </aside>
    </div>
  );
}
