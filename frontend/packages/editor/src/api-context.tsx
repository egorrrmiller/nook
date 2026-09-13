import { createContext, useContext, type ReactNode } from 'react';
import type { ApiClient } from '@nook/api-client';

const EditorApiContext = createContext<ApiClient | null>(null);

/** Lets the host app inject its configured API client (cookie session + X-Workspace-Id). */
export function EditorApiProvider({ api, children }: { api: ApiClient; children: ReactNode }) {
  return <EditorApiContext.Provider value={api}>{children}</EditorApiContext.Provider>;
}

export function useEditorApi(): ApiClient {
  const ctx = useContext(EditorApiContext);
  // The client carries the session and the active workspace, both of which only the host app
  // knows — there is no sensible default to fall back to.
  if (!ctx) throw new Error('useEditorApi: wrap the editor in <EditorApiProvider api={...}>');
  return ctx;
}
