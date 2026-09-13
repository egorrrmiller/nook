import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { ApiClient, Node } from '@nook/api-client';
import { useEditorApi } from './api-context';

/**
 * Everything a custom block / inline node needs from the host application: the typed API
 * client, the workspace + node it lives in, and in-app navigation. Custom blocks render inside
 * BlockNote node views, which stay within the React tree of `<BlockNoteView>`, so this context
 * reaches them.
 */
export interface EditorHost {
  api: ApiClient;
  workspaceId: string;
  nodeId: string;
  /** In-app navigation to an app-relative path (`/w/…/p/…`). Falls back to `location.assign`. */
  navigate: (to: string) => void;
  /** App-relative href for a page (optionally a block anchor). */
  pageHref: (nodeId: string, blockId?: string) => string;
  toast: (message: string) => void;
  /** Uploads a file for the current node; resolves to the block props to apply (`url`, `name`). */
  uploadFile?: (file: File, blockId?: string) => Promise<UploadResult>;
  /**
   * Creates a sub-page of the current one (`[[New title]]`). The host implementation keeps its
   * query cache in sync (sidebar, breadcrumbs); the fallback talks to the API directly.
   */
  createPage: (title: string) => Promise<Node>;
}

export interface UploadResult {
  url: string;
  name: string;
  attachmentId?: string;
  mime?: string;
  size?: number;
  pages?: number;
}

const HostContext = createContext<EditorHost | null>(null);

export interface EditorHostProviderProps {
  workspaceId: string;
  nodeId: string;
  navigate?: (to: string) => void;
  toast?: (message: string) => void;
  uploadFile?: EditorHost['uploadFile'];
  createPage?: EditorHost['createPage'];
  children: ReactNode;
}

export function pageHref(workspaceId: string, nodeId: string, blockId?: string): string {
  return `/w/${workspaceId}/p/${nodeId}${blockId ? `#b-${blockId}` : ''}`;
}

export function EditorHostProvider({
  workspaceId,
  nodeId,
  navigate,
  toast,
  uploadFile,
  createPage,
  children,
}: EditorHostProviderProps) {
  const api = useEditorApi();
  const value = useMemo<EditorHost>(
    () => ({
      api,
      workspaceId,
      nodeId,
      navigate: navigate ?? ((to) => window.location.assign(to)),
      pageHref: (id, blockId) => pageHref(workspaceId, id, blockId),
      toast: toast ?? ((m) => console.info('[editor]', m)),
      uploadFile,
      createPage: createPage ?? ((title: string) => api.nodes.create({ kind: 'page', title, parentId: nodeId })),
    }),
    [api, workspaceId, nodeId, navigate, toast, uploadFile, createPage],
  );
  return <HostContext.Provider value={value}>{children}</HostContext.Provider>;
}

export function useEditorHost(): EditorHost {
  const ctx = useContext(HostContext);
  if (!ctx) throw new Error('useEditorHost: wrap the editor in <EditorHostProvider>');
  return ctx;
}

/** Nullable variant for components that may render outside a page (history preview, peek). */
export function useOptionalEditorHost(): EditorHost | null {
  return useContext(HostContext);
}
