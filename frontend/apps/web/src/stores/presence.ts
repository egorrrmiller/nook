import { create } from 'zustand';

export interface PresenceUser {
  id: string;
  name: string;
  color: string;
}

interface PresenceState {
  byNode: Record<string, PresenceUser[]>;
  setPresence: (nodeId: string, users: PresenceUser[]) => void;
}

export const usePresenceStore = create<PresenceState>()((set, get) => ({
  byNode: {},
  setPresence: (nodeId, users) => set({ byNode: { ...get().byNode, [nodeId]: users } }),
}));
