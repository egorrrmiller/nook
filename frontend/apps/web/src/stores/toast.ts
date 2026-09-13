import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error';
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, kind?: Toast['kind']) => void;
  dismiss: (id: number) => void;
}

let seq = 0;

export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (message, kind = 'info') => {
    const id = ++seq;
    set({ toasts: [...get().toasts, { id, message, kind }] });
    setTimeout(() => get().dismiss(id), 3500);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (message: string, kind?: Toast['kind']) => useToastStore.getState().push(message, kind);
