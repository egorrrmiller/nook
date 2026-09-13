import { createReactBlockSpec, type ReactCustomBlockRenderProps } from '@blocknote/react';
import { ArrowUpRightIcon } from 'lucide-react';
import { pageHref, useEditorHost } from '../../host-context';
import { NodeIcon } from '../../components/NodeIcon';
import { PagePicker } from '../../components/PagePicker';
import { nodeTitle, primeNodeInfo, useNodeInfo } from '../../util/nodeCache';

export const pageLinkConfig = {
  type: 'pageLink',
  propSchema: {
    nodeId: { default: '' },
    /** Cached title so the block has searchable text and renders before the fetch completes. */
    title: { default: '' },
  },
  content: 'none',
} as const;

function PageLinkView({ block, editor }: ReactCustomBlockRenderProps<typeof pageLinkConfig>) {
  const host = useEditorHost();
  const { nodeId, title } = block.props;
  const info = useNodeInfo(host.api, nodeId || null);

  if (!nodeId) {
    return (
      <PagePicker
        placeholder="Link to page…"
        onPick={(hit) => {
          primeNodeInfo(hit.node);
          editor.updateBlock(block.id, { props: { nodeId: hit.node.id, title: hit.node.title } });
        }}
        onCancel={() => editor.removeBlocks([block.id])}
      />
    );
  }

  const node = info.node;
  const label = node ? nodeTitle(node) : title || (info.loading ? 'Loading…' : 'Untitled');
  const href = host.pageHref(nodeId);
  return (
    <a
      className="nook-page-link"
      href={href}
      contentEditable={false}
      data-testid="page-link-block"
      data-missing={info.error ? '' : undefined}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey) return;
        e.preventDefault();
        host.navigate(href);
      }}
    >
      <NodeIcon icon={node?.icon} kind={node?.kind} size={18} />
      <span className="nook-page-link__title">{info.error ? `${label} (missing)` : label}</span>
      <ArrowUpRightIcon size={14} className="nook-page-link__arrow" />
    </a>
  );
}

/** "Link to page" block: `props.nodeId` → icon + title, navigates in-app (LinkExtractor: kind mention). */
export const PageLinkBlock = createReactBlockSpec(pageLinkConfig, {
  render: PageLinkView,
  toExternalHTML: ({ block }) => (
    <a href={pageHref('', block.props.nodeId)} className="nook-page-link" data-node-id={block.props.nodeId}>
      {block.props.title || 'Untitled'}
    </a>
  ),
  parse: (el) => {
    if (el.tagName === 'A' && el.getAttribute('data-node-id')) {
      return { nodeId: el.getAttribute('data-node-id') ?? '', title: el.textContent ?? '' };
    }
    return undefined;
  },
});
