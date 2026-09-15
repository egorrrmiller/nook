import type * as Y from 'yjs';
import type { Node, NodeCover, NodeIcon as NodeIconValue } from '@nook/api-client';
import { NodeIcon, TitleEditor } from '@nook/editor';
import { ImageIcon, SmileIcon } from 'lucide-react';
import { Button } from '@nook/ui';
import { CoverPicker, IconPicker } from '../pickers';

/**
 * Page header inside the page column: icon, "Add icon / Add cover" hover buttons and the title,
 * which lives in the Y.Doc (`doc.getText('title')`, contracts §3) and is mirrored to `nodes.title`.
 */
export function PageHeader({
  node,
  titleText,
  synced,
  readOnly,
  onTitleChange,
  onIconChange,
  onCoverChange,
  onEnter,
  autoFocusTitle,
}: {
  node: Node;
  titleText: Y.Text;
  /** Only seed the shared title once the Y.Doc holds the server's state (see EditorHeaderContext.synced). */
  synced: boolean;
  readOnly?: boolean;
  onTitleChange?: (title: string) => void;
  onIconChange: (icon: NodeIconValue | null) => void;
  onCoverChange: (cover: NodeCover | null) => void;
  onEnter?: () => void;
  autoFocusTitle?: boolean;
}) {
  const hasIcon = !!node.icon;
  const hasCover = !!node.cover;

  return (
    <header className="nook-page__header" data-testid="page-header">
      {hasIcon ? (
        <IconPicker value={node.icon} nodeId={node.id} onChange={onIconChange}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="nook-page__icon h-auto min-h-0 w-auto p-0"
            data-testid="page-icon"
            disabled={readOnly}
          >
            <NodeIcon icon={node.icon} kind={node.kind} size={72} />
          </Button>
        </IconPicker>
      ) : null}

      {!readOnly ? (
        <div className="nook-page__actions">
          {!hasIcon ? (
            <IconPicker value={node.icon} nodeId={node.id} onChange={onIconChange}>
              <Button type="button" variant="subtle" size="sm" data-testid="add-icon">
                <SmileIcon size={14} /> Add icon
              </Button>
            </IconPicker>
          ) : null}
          {!hasCover ? (
            <CoverPicker value={node.cover} nodeId={node.id} onChange={onCoverChange}>
              <Button type="button" variant="subtle" size="sm" data-testid="add-cover">
                <ImageIcon size={14} /> Add cover
              </Button>
            </CoverPicker>
          ) : null}
        </div>
      ) : null}

      <div className="nook-page__title-row">
        <TitleEditor
          text={titleText}
          initialTitle={node.title}
          seedWhen={synced}
          onChange={onTitleChange}
          readOnly={readOnly}
          onEnter={onEnter}
          autoFocus={autoFocusTitle}
        />
        <span
          className="nook-page__sync-status"
          data-testid="page-sync-status"
          data-synced={synced ? 'true' : 'false'}
          aria-live="polite"
          title={synced ? 'The page is connected and ready' : 'Waiting for the page to sync'}
        >
          <span className="nook-page__sync-dot" aria-hidden="true" />
          {synced ? 'Synced' : 'Syncing…'}
        </span>
      </div>
      {readOnly ? (
        <div className="nook-page__read-only-note" role="status">
          {node.pageSettings?.locked ? 'Locked page' : 'Read-only access'}
        </div>
      ) : null}
    </header>
  );
}
