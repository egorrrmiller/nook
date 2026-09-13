import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { cn } from '@nook/ui';
import { NookEditor } from '@nook/editor';
import type { AnyEditor } from '@nook/editor';
import type { NodeCover, NodeIcon } from '@nook/api-client';
import { IS_MOCK } from '../../lib/api';
import { useCreateNode, useMe, useNode, useUpdateNode } from '../../lib/queries';
import { useEnterNode } from '../../app/realtime';
import { useUiStore, resolveTheme } from '../../stores/ui';
import { useToastStore } from '../../stores/toast';
import { PageProperties } from '../../features/knowledge';
import { useUploads, UploadProgress } from '../../features/files/useUploads';
import './page.css';
import { PageCover } from './PageCover';
import { PageHeader } from './PageHeader';
import { PageInspector } from './PageInspector';
import { PanelRightIcon } from 'lucide-react';
import { useMockDocSync } from './useMockDocSync';

/**
 * The page: cover, header (icon + title), properties, the collaborative editor and the
 * right-hand inspector (contracts §10). The header and the properties bar are passed to
 * `NookEditor` as its header slot so they sit inside the page column and bind to the same Y.Doc
 * as the editor (the title lives in `doc.getText('title')`, contracts §3).
 */
export function PageView({ workspaceId, nodeId }: { workspaceId: string; nodeId: string }) {
  const { data: node } = useNode(workspaceId, nodeId);
  const { data: me } = useMe();
  const update = useUpdateNode(workspaceId);
  const create = useCreateNode(workspaceId);
  const theme = resolveTheme(useUiStore((s) => s.theme));
  const inspector = useUiStore((s) => s.inspector);
  const toggleInspector = useUiStore((s) => s.toggleInspector);
  const toast = useToastStore((s) => s.push);
  const navigate = useNavigate();
  useEnterNode(nodeId);

  const uploads = useUploads(workspaceId, nodeId);
  const [editor, setEditor] = useState<AnyEditor | null>(null);
  const onEditorReady = useCallback((e: unknown) => setEditor(e as AnyEditor), []);

  // Title lives in the Y.Doc and is mirrored to `nodes.title` via PATCH, debounced.
  const lastSaved = useRef(node?.title ?? '');
  const [title, setTitle] = useState(node?.title ?? '');
  useEffect(() => {
    if (node && node.title !== lastSaved.current && node.title !== title) {
      lastSaved.current = node.title;
      setTitle(node.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.title]);
  useEffect(() => {
    if (title === lastSaved.current) return;
    const t = setTimeout(() => {
      lastSaved.current = title;
      update.mutate({ id: nodeId, title });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, nodeId]);

  // Mock mode has no collab service; mirror the document so history / embeds have content.
  useMockDocSync(nodeId, editor, title, workspaceId);

  const goTo = useCallback((to: string) => void navigate({ to, replace: false }), [navigate]);

  if (!node) return null;

  const settings = node.pageSettings ?? null;
  const readOnly = node.effectiveRole === 'viewer' || settings?.locked === true;

  return (
    <div className="nook-page-layout">
      <article
        data-testid="page-view"
        className={cn(
          'nook-page',
          settings?.fullWidth && 'nook-page--full',
          settings?.font === 'serif' && 'nook-page--serif',
          settings?.font === 'mono' && 'nook-page--mono',
          settings?.smallText && 'nook-page--small',
        )}
        data-full-width={settings?.fullWidth ? 'true' : undefined}
      >
        {/* Temporary affordance: frontend-shell moves this into the page ⋯ menu / top bar
            (stores/ui.ts already exposes `toggleInspector`). */}
        <div className="nook-page__toolbar">
          <button
            type="button"
            data-testid="toggle-inspector"
            title="Page details"
            aria-pressed={inspector !== null}
            onClick={() => toggleInspector('info')}
          >
            <PanelRightIcon size={16} />
          </button>
        </div>

        {node.cover ? (
          <PageCover
            cover={node.cover}
            nodeId={nodeId}
            readOnly={readOnly}
            onChange={(cover: NodeCover | null) => update.mutate({ id: nodeId, cover })}
          />
        ) : null}

        <div className="nook-page__column">
          <NookEditor
            key={nodeId}
            nodeId={nodeId}
            workspaceId={workspaceId}
            mode={IS_MOCK ? 'local' : 'remote'}
            initialTitle={node.title}
            user={me ? { name: me.user.displayName, color: '#2383e2' } : undefined}
            theme={theme}
            role={node.effectiveRole}
            pageSettings={settings}
            onEditorReady={onEditorReady}
            navigate={goTo}
            toast={toast}
            uploadFile={uploads.upload}
            createPage={(title) => create.mutateAsync({ kind: 'page', title, parentId: nodeId })}
            header={({ titleText, focusEditor, readOnly: ro, synced }) => (
              <>
                <PageHeader
                  node={node}
                  titleText={titleText}
                  synced={synced}
                  readOnly={ro}
                  onTitleChange={setTitle}
                  onIconChange={(icon: NodeIcon | null) => update.mutate({ id: nodeId, icon })}
                  onCoverChange={(cover: NodeCover | null) => update.mutate({ id: nodeId, cover })}
                  onEnter={focusEditor}
                />
                {/* Contracts §10: the properties bar sits between the title and the editor. */}
                <PageProperties workspaceId={workspaceId} nodeId={nodeId} readOnly={ro} />
              </>
            )}
          />
        </div>
      </article>
      {inspector ? <PageInspector workspaceId={workspaceId} node={node} editor={editor} /> : null}
      <UploadProgress uploads={uploads} />
    </div>
  );
}
