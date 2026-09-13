import { createReactBlockSpec, type ReactCustomBlockRenderProps } from '@blocknote/react';
import { useEffect, useState } from 'react';
import type { Breadcrumb } from '@nook/api-client';
import { ChevronRightIcon } from 'lucide-react';
import { useEditorHost } from '../../host-context';
import { NodeIcon } from '../../components/NodeIcon';
import { nodeTitle, useNodeInfo } from '../../util/nodeCache';

export const breadcrumbConfig = {
  type: 'breadcrumb',
  propSchema: {},
  content: 'none',
} as const;

function BreadcrumbView(_props: ReactCustomBlockRenderProps<typeof breadcrumbConfig>) {
  const host = useEditorHost();
  const [crumbs, setCrumbs] = useState<Breadcrumb | null>(null);
  const self = useNodeInfo(host.api, host.nodeId);

  useEffect(() => {
    let live = true;
    host.api.nodes
      .ancestors(host.nodeId)
      .then((c) => live && setCrumbs(c))
      .catch(() => live && setCrumbs([]));
    return () => {
      live = false;
    };
  }, [host.api, host.nodeId]);

  const items = [...(crumbs ?? []), ...(self.node ? [self.node] : [])];
  return (
    <nav className="nook-breadcrumb" contentEditable={false} aria-label="Breadcrumb" data-testid="breadcrumb-block">
      {crumbs === null ? (
        <span className="nook-breadcrumb__item">…</span>
      ) : (
        items.map((n, i) => (
          <span key={n.id} className="nook-breadcrumb__seg">
            {i > 0 ? <ChevronRightIcon size={12} className="nook-breadcrumb__sep" /> : null}
            <a
              className="nook-breadcrumb__item"
              href={host.pageHref(n.id)}
              aria-current={n.id === host.nodeId ? 'page' : undefined}
              onClick={(e) => {
                e.preventDefault();
                if (n.id !== host.nodeId) host.navigate(host.pageHref(n.id));
              }}
            >
              <NodeIcon icon={n.icon} kind={n.kind} size={14} />
              {nodeTitle(n)}
            </a>
          </span>
        ))
      )}
    </nav>
  );
}

/** Breadcrumb of the current page (ancestors from `GET /api/nodes/{id}/ancestors`). */
export const BreadcrumbBlock = createReactBlockSpec(breadcrumbConfig, {
  render: BreadcrumbView,
  toExternalHTML: () => <nav className="nook-breadcrumb" />,
});
