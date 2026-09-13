import { createReactInlineContentSpec } from '@blocknote/react';
import { useOptionalEditorHost, pageHref } from '../../host-context';
import { NodeIcon } from '../../components/NodeIcon';
import { nodeTitle, useNodeInfo } from '../../util/nodeCache';

export const mentionConfig = {
  type: 'mention',
  propSchema: {
    nodeId: { default: '' },
    /** Title snapshot: searchable text + instant render; refreshed from the node on mount. */
    title: { default: '' },
  },
  content: 'none',
} as const;

function MentionView({ inlineContent }: { inlineContent: { props: { nodeId: string; title: string } } }) {
  const host = useOptionalEditorHost();
  const { nodeId, title } = inlineContent.props;
  const info = useNodeInfo(host?.api ?? null!, host ? nodeId : null);
  const node = info.node;
  const label = node ? nodeTitle(node) : title || 'Untitled';
  const href = host ? host.pageHref(nodeId) : pageHref('', nodeId);
  return (
    <a
      className="nook-mention"
      href={href}
      data-node-id={nodeId}
      data-missing={info.error ? '' : undefined}
      data-testid="mention"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || !host) return;
        e.preventDefault();
        host.navigate(href);
      }}
    >
      <NodeIcon icon={node?.icon} kind={node?.kind} size={14} className="nook-mention__icon" />
      <span className="nook-mention__title">{label}</span>
    </a>
  );
}

/** Page mention (`@page`, `[[page]]`): `props.nodeId` — LinkExtractor kind `mention`. */
export const MentionInline = createReactInlineContentSpec(mentionConfig, {
  render: (props) => <MentionView inlineContent={props.inlineContent} />,
  toExternalHTML: (props) => (
    <a href={pageHref('', props.inlineContent.props.nodeId)} data-node-id={props.inlineContent.props.nodeId} className="nook-mention">
      {props.inlineContent.props.title || 'Untitled'}
    </a>
  ),
});
