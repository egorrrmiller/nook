import { useQueryClient } from '@tanstack/react-query';
import { HomeIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Node } from '@nook/api-client';
import { CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandPalette } from '@nook/ui';
import { useDebouncedValue } from '../../lib/hooks';
import { queryKeys, useMoveNode, useQuickFind } from '../../lib/queries';
import { nodeTitle } from '../../lib/utils';
import { toast } from '../../stores/toast';
import { useUiStore } from '../../stores/ui';
import { NodeIcon } from './NodeIcon';
import { BreadcrumbText } from './BreadcrumbText';

/** "Move to…" picker driven by quick find (§7.4); opened via `useUiStore().moveNodeId`. */
export function MoveToDialog({ workspaceId }: { workspaceId: string }) {
  const nodeId = useUiStore((s) => s.moveNodeId);
  const setMoveNodeId = useUiStore((s) => s.setMoveNodeId);
  const qc = useQueryClient();
  const move = useMoveNode(workspaceId);
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query, 150);
  const open = nodeId !== null;
  const { data: hits } = useQuickFind(workspaceId, q, open);
  const node = nodeId ? qc.getQueryData<Node>(queryKeys.node(workspaceId, nodeId)) : undefined;

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const doMove = (target: Node | null) => {
    if (!nodeId) return;
    setMoveNodeId(null);
    move.mutate(
      { id: nodeId, parentId: target?.id ?? null, position: undefined },
      { onSuccess: () => toast(`Moved to ${target ? nodeTitle(target.title) : 'the workspace root'}`) },
    );
  };

  const candidates = (hits ?? []).filter((h) => h.node.id !== nodeId && h.node.parentId !== nodeId);

  return (
    <CommandPalette open={open} onOpenChange={(o) => !o && setMoveNodeId(null)} label="Move page" shouldFilter={false}>
      <CommandInput
        placeholder={node ? `Move “${nodeTitle(node.title)}” to…` : 'Move to…'}
        value={query}
        onValueChange={setQuery}
        data-testid="move-to-input"
      />
      <CommandList>
        <CommandEmpty>No pages found.</CommandEmpty>
        <CommandGroup heading="Destination">
          {!q ? (
            <CommandItem value="__root" onSelect={() => doMove(null)}>
              <HomeIcon /> Workspace root
            </CommandItem>
          ) : null}
          {candidates.map((h) => (
            <CommandItem key={h.node.id} value={h.node.id} onSelect={() => doMove(h.node)}>
              <NodeIcon icon={h.node.icon} kind={h.node.kind} size={18} />
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{nodeTitle(h.node.title)}</span>
                {h.breadcrumb.length ? <BreadcrumbText crumbs={h.breadcrumb} /> : null}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandPalette>
  );
}
