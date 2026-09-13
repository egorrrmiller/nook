import type * as Y from 'yjs';
import type { Node, NodeCover, NodeIcon as NodeIconValue } from '@nook/api-client';
import { NodeIcon, TitleEditor } from '@nook/editor';
import { ImageIcon, SmileIcon } from 'lucide-react';
import { CoverPicker, IconPicker } from '../pickers';

/**
 * Page header inside the page column: icon, "Add icon / Add cover" hover buttons and the title,
 * which lives in the Y.Doc (`doc.getText('title')`, contracts §3) and is mirrored to `nodes.title`.
 */
export function PageHeader({
  node,
  titleText,
  readOnly,
  onTitleChange,
  onIconChange,
  onCoverChange,
  onEnter,
  autoFocusTitle,
}: {
  node: Node;
  titleText: Y.Text;
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
          <button type="button" className="nook-page__icon" data-testid="page-icon" disabled={readOnly}>
            <NodeIcon icon={node.icon} kind={node.kind} size={72} />
          </button>
        </IconPicker>
      ) : null}

      {!readOnly ? (
        <div className="nook-page__actions">
          {!hasIcon ? (
            <IconPicker value={node.icon} nodeId={node.id} onChange={onIconChange}>
              <button type="button" data-testid="add-icon">
                <SmileIcon size={14} /> Add icon
              </button>
            </IconPicker>
          ) : null}
          {!hasCover ? (
            <CoverPicker value={node.cover} nodeId={node.id} onChange={onCoverChange}>
              <button type="button" data-testid="add-cover">
                <ImageIcon size={14} /> Add cover
              </button>
            </CoverPicker>
          ) : null}
        </div>
      ) : null}

      <TitleEditor
        text={titleText}
        initialTitle={node.title}
        onChange={onTitleChange}
        readOnly={readOnly}
        onEnter={onEnter}
        autoFocus={autoFocusTitle}
      />
    </header>
  );
}
