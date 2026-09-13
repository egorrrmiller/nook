/** Query keys for the knowledge slice (contracts §9). All keys are workspace-scoped. */
export const knowledgeKeys = {
  all: (ws: string) => ['knowledge', ws] as const,
  backlinks: (ws: string, nodeId: string) => ['knowledge', ws, 'backlinks', nodeId] as const,
  links: (ws: string, nodeId: string) => ['knowledge', ws, 'links', nodeId] as const,
  broken: (ws: string) => ['knowledge', ws, 'broken-links'] as const,
  tags: (ws: string) => ['knowledge', ws, 'tags'] as const,
  nodeTags: (ws: string, nodeId: string) => ['knowledge', ws, 'node-tags', nodeId] as const,
  properties: (ws: string, nodeId: string) => ['knowledge', ws, 'properties', nodeId] as const,
  aliases: (ws: string, nodeId: string) => ['knowledge', ws, 'aliases', nodeId] as const,
  search: (ws: string, body: unknown) => ['knowledge', ws, 'search', body] as const,
  graph: (ws: string, query: unknown) => ['knowledge', ws, 'graph', query] as const,
};
