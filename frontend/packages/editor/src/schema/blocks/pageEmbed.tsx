import { createReactBlockSpec, type ReactCustomBlockRenderProps } from '@blocknote/react';
import { useEffect, useState, type ComponentProps } from 'react';
import type { Block } from '@nook/api-client';
import { ArrowUpRightIcon, RefreshCwIcon } from 'lucide-react';
import { pageHref, useEditorHost } from '../../host-context';
import { NodeIcon } from '../../components/NodeIcon';
import { PagePicker } from '../../components/PagePicker';
import { nodeTitle, primeNodeInfo, useNodeInfo } from '../../util/nodeCache';
import { BlocksView } from '../../BlocksView';

export const pageEmbedConfig = {
  type: 'pageEmbed',
  propSchema: {
    nodeId: { default: '' },
    title: { default: '' },
  },
  content: 'none',
} as const;

function PageEmbedView({ block, editor }: ReactCustomBlockRenderProps<typeof pageEmbedConfig>) {
  const host = useEditorHost();
  const { nodeId } = block.props;
  const info = useNodeInfo(host.api, nodeId || null);
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!nodeId) return;
    let live = true;
    setError(null);
    host.api.nodes
      .blocks(nodeId)
      .then((r) => live && setBlocks(r.blocks))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : 'Failed to load'));
    return () => {
      live = false;
    };
  }, [host.api, nodeId, tick]);

  if (!nodeId) {
    return (
      <PagePicker
        placeholder="Embed a page…"
        onPick={(hit) => {
          primeNodeInfo(hit.node);
          editor.updateBlock(block.id, { props: { nodeId: hit.node.id, title: hit.node.title } });
        }}
        onCancel={() => editor.removeBlocks([block.id])}
      />
    );
  }

  const href = host.pageHref(nodeId);
  const isSelf = nodeId === host.nodeId;
  return (
    <section className="nook-page-embed" contentEditable={false} data-testid="page-embed-block">
      <header className="nook-page-embed__header">
        <NodeIcon icon={info.node?.icon} kind={info.node?.kind} size={16} />
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            host.navigate(href);
          }}
        >
          {nodeTitle(info.node) || block.props.title}
        </a>
        <span className="nook-page-embed__spacer" />
        <button type="button" title="Refresh" onClick={() => setTick((t) => t + 1)}>
          <RefreshCwIcon size={14} />
        </button>
        <a href={href} title="Open page" onClick={(e) => (e.preventDefault(), host.navigate(href))}>
          <ArrowUpRightIcon size={14} />
        </a>
      </header>
      <div className="nook-page-embed__body">
        {isSelf ? (
          <p className="nook-page-embed__note">A page cannot embed itself.</p>
        ) : error ? (
          <p className="nook-page-embed__note">{error}</p>
        ) : blocks === null ? (
          <p className="nook-page-embed__note">Loading…</p>
        ) : blocks.length === 0 ? (
          <p className="nook-page-embed__note">Empty page.</p>
        ) : (
          <BlocksView blocks={blocks} schema={editor.schema as unknown as ComponentProps<typeof BlocksView>['schema']} compact />
        )}
      </div>
    </section>
  );
}

/** Read-only inline rendering of another page (`GET /api/nodes/{id}/blocks`; LinkExtractor: kind embed). */
export const PageEmbedBlock = createReactBlockSpec(pageEmbedConfig, {
  render: PageEmbedView,
  toExternalHTML: ({ block }) => (
    <a href={pageHref('', block.props.nodeId)} data-node-embed={block.props.nodeId}>
      {block.props.title || 'Embedded page'}
    </a>
  ),
});
