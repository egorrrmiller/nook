import { useEffect } from 'react';
import type { AnyEditor, LooseBlock } from '@nook/editor';
import { IS_MOCK } from '../../lib/api';

/**
 * Mock-mode only: mirrors the editor's document to the MSW backend the way the collab service's
 * `onStoreDocument` mirrors it to `PUT /internal/documents/{id}` (contracts §3). Without it the
 * mock has no idea what a page contains, so history, page embeds and `GET /nodes/{id}/blocks`
 * would all stay empty in `VITE_MOCK=1`. It is a no-op against the real API.
 */
export function useMockDocSync(nodeId: string, editor: AnyEditor | null, title: string, workspaceId: string): void {
  useEffect(() => {
    if (!IS_MOCK || !editor) return;
    let timer: number | undefined;
    const push = () => {
      const blocks = editor.document as unknown as LooseBlock[];
      void fetch(`/api/nodes/${nodeId}/blocks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Workspace-Id': workspaceId },
        body: JSON.stringify({ title, blocks }),
      }).catch(() => {});
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(push, 400);
    };
    push();
    const off = editor.onChange(schedule);
    return () => {
      window.clearTimeout(timer);
      off?.();
    };
  }, [editor, nodeId, title, workspaceId]);
}
