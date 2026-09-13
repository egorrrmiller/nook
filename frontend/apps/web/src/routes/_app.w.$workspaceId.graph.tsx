import { createFileRoute } from '@tanstack/react-router';
import { GraphView } from '../features/knowledge/graph/GraphView';

export interface GraphSearch {
  /** Optional page to focus the graph on: `/w/{ws}/graph?node={nodeId}`. */
  node?: string;
}

/** Contracts §10: graph route, owned by frontend-knowledge. */
export const Route = createFileRoute('/_app/w/$workspaceId/graph')({
  validateSearch: (search: Record<string, unknown>): GraphSearch => ({
    node: typeof search.node === 'string' && search.node ? search.node : undefined,
  }),
  component: GraphPage,
});

function GraphPage() {
  const { workspaceId } = Route.useParams();
  const { node } = Route.useSearch();
  return <GraphView workspaceId={workspaceId} focusNodeId={node ?? null} />;
}
