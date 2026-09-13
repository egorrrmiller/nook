import { Tooltip } from '@nook/ui';
import { useNodeTags } from '../api/queries';
import { Chip } from '../ui/Chip';

/**
 * Compact tag chips for tree rows / palette hits (contracts §10). The query is cached per node
 * (60 s), so many rows mounting at once cost one request each at most.
 */
export function TagChips({ workspaceId, nodeId, compact }: { workspaceId: string; nodeId: string; compact?: boolean }) {
  const { data } = useNodeTags(workspaceId, nodeId);
  if (!data?.length) return null;
  const max = compact ? 2 : data.length;
  const shown = data.slice(0, max);
  const rest = data.slice(max);
  return (
    <span data-testid="tag-chips" className="inline-flex min-w-0 items-center gap-1 align-middle">
      {shown.map((t) => (
        <Chip key={t.id} label={t.name} color={t.color} size="sm" muted={t.source === 'inline'} title={t.source === 'inline' ? `#${t.name} (from text)` : t.name} />
      ))}
      {rest.length ? (
        <Tooltip content={rest.map((t) => t.name).join(', ')}>
          <span className="inline-flex h-[18px] items-center rounded-sm bg-accent px-1 text-[11px] font-medium text-muted-foreground">+{rest.length}</span>
        </Tooltip>
      ) : null}
    </span>
  );
}
