import { useEffect, useState } from 'react';
import type { Node } from '@nook/api-client';
import { copyText, textStats, type AnyEditor, type LooseBlock } from '@nook/editor';
import { Button, IconButton, Tabs, TabsList, TabsTab, cn } from '@nook/ui';
import { CopyIcon, XIcon } from 'lucide-react';
import { BacklinksPanel } from '../../features/knowledge';
import { PageHistoryPanel } from '../../features/history';
import { useUiStore, type InspectorTab } from '../../stores/ui';
import { useToastStore } from '../../stores/toast';
import { NodeFilesPanel } from '../../features/files/NodeFilesPanel';
import { PageInfoRow } from './PageInfoRow';

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'backlinks', label: 'Backlinks' },
  { id: 'history', label: 'History' },
  { id: 'info', label: 'Info' },
];

/** Right-hand inspector of the page (contracts §10): Backlinks | History | Info. */
export function PageInspector({
  workspaceId,
  node,
  editor,
}: {
  workspaceId: string;
  node: Node;
  editor: AnyEditor | null;
}) {
  const tab = useUiStore((s) => s.inspector);
  const setInspector = useUiStore((s) => s.setInspector);
  if (!tab) return null;

  return (
    <aside className="nook-inspector" aria-label="Page inspector" data-testid="page-inspector">
      <Tabs
        value={tab}
        onValueChange={(value) => setInspector(value as InspectorTab)}
        className="nook-inspector__tabs-root"
      >
        <TabsList className="nook-inspector__tabs">
          {TABS.map((t) => (
            <TabsTab
              key={t.id}
              value={t.id}
              data-testid={`inspector-tab-${t.id}`}
              className={cn('nook-inspector__tab', tab === t.id && 'is-active')}
            >
              {t.label}
            </TabsTab>
          ))}
          <span className="nook-inspector__spacer" />
          <IconButton label="Close inspector" onClick={() => setInspector(null)}>
            <XIcon />
          </IconButton>
        </TabsList>
        <div className="nook-inspector__body">
          {tab === 'backlinks' ? <BacklinksPanel workspaceId={workspaceId} nodeId={node.id} /> : null}
          {tab === 'history' ? <PageHistoryPanel workspaceId={workspaceId} nodeId={node.id} /> : null}
          {tab === 'info' ? <PageInfo workspaceId={workspaceId} node={node} editor={editor} /> : null}
        </div>
      </Tabs>
    </aside>
  );
}

/** Live word / character count plus the page's metadata. */
function PageInfo({ workspaceId, node, editor }: { workspaceId: string; node: Node; editor: AnyEditor | null }) {
  const [stats, setStats] = useState(() => ({ words: 0, characters: 0, charactersNoSpaces: 0, blocks: 0 }));
  const toast = useToastStore((s) => s.push);

  useEffect(() => {
    if (!editor) return;
    const recount = () => setStats(textStats(editor.document as unknown as LooseBlock[]));
    recount();
    return editor.onChange(recount);
  }, [editor]);

  const link = `${window.location.origin}/w/${node.workspaceId}/p/${node.id}`;
  const rows: [string, string][] = [
    ['Words', String(stats.words)],
    ['Characters', String(stats.characters)],
    ['Characters (no spaces)', String(stats.charactersNoSpaces)],
    ['Blocks', String(stats.blocks)],
    ['Created', new Date(node.createdAt).toLocaleString()],
    ['Last edited', new Date(node.updatedAt).toLocaleString()],
    ['Node id', node.id],
  ];

  return (
    <div className="nook-inspector__info" data-testid="page-info">
      <dl>
        {rows.map(([k, v]) => (
          <PageInfoRow key={k} label={k} value={v} testId={`info-${k.toLowerCase().replace(/[^a-z]+/g, '-')}`} />
        ))}
      </dl>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="nook-inspector__copy"
        data-testid="copy-page-link"
        onClick={() => void copyText(link).then((ok) => toast(ok ? 'Page link copied' : 'Could not copy the link'))}
      >
        <CopyIcon size={14} /> Copy link
      </Button>
      <div className="nook-inspector__files">
        <NodeFilesPanel workspaceId={workspaceId} nodeId={node.id} canEdit={node.effectiveRole !== 'viewer' && node.pageSettings?.locked !== true} />
      </div>
    </div>
  );
}
