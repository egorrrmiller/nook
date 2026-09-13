import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WorkspaceState {
  activeWorkspaceId: string | null;
  setActive: (id: string | null) => void;
}

/** Active workspace; `X-Workspace-Id` is read from here on every API call. */
export const useWorkspaceStore = create<WorkspaceState>()(
  persist((set) => ({ activeWorkspaceId: null, setActive: (id) => set({ activeWorkspaceId: id }) }), {
    name: 'nook.workspace',
  }),
);
