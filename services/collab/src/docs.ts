import * as Y from "yjs";

/** Cap on buffered incremental updates sent as `updates[]` in a store; beyond this they are merged. */
const MAX_BUFFERED_UPDATES = 256;
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024;

/** Document-level state kept next to each loaded Hocuspocus document. */
export interface DocState {
  documentName: string;
  nodeId: string;
  /** Last version acknowledged by the backend. */
  version: number;
  /** Incremental Y updates since the last successful store (optional `updates` field of PUT). */
  updates: Uint8Array[];
  updatesBytes: number;
  /** User ids that contributed updates since the last successful store. */
  authors: Set<string>;
  /** True when in-memory state differs from what the backend has. */
  dirty: boolean;
  /** Consecutive failed store attempts (drives the retry backoff). */
  failures: number;
  retryTimer?: NodeJS.Timeout;
}

export class DocRegistry {
  private readonly states = new Map<string, DocState>();

  get(documentName: string): DocState | undefined {
    return this.states.get(documentName);
  }

  ensure(documentName: string, nodeId: string): DocState {
    let s = this.states.get(documentName);
    if (!s) {
      s = { documentName, nodeId, version: 0, updates: [], updatesBytes: 0, authors: new Set(), dirty: false, failures: 0 };
      this.states.set(documentName, s);
    }
    return s;
  }

  delete(documentName: string): void {
    const s = this.states.get(documentName);
    if (s?.retryTimer) clearTimeout(s.retryTimer);
    this.states.delete(documentName);
  }

  all(): DocState[] {
    return [...this.states.values()];
  }

  recordChange(state: DocState, update: Uint8Array, userId: string | undefined): void {
    state.dirty = true;
    if (userId) state.authors.add(userId);
    state.updates.push(update);
    state.updatesBytes += update.byteLength;
    if (state.updates.length > MAX_BUFFERED_UPDATES || state.updatesBytes > MAX_BUFFERED_BYTES) {
      const merged = Y.mergeUpdates(state.updates);
      state.updates = [merged];
      state.updatesBytes = merged.byteLength;
    }
  }

  /** Snapshot what a store will send; `commit` clears it only after the backend acknowledged. */
  takeBatch(state: DocState): { updates: Uint8Array[]; authors: string[]; commit: () => void } {
    const updates = state.updates;
    const authors = [...state.authors];
    return {
      updates,
      authors,
      commit: () => {
        // Anything recorded while the PUT was in flight stays for the next store.
        state.updates = state.updates.filter((u) => !updates.includes(u));
        state.updatesBytes = state.updates.reduce((n, u) => n + u.byteLength, 0);
        for (const a of authors) state.authors.delete(a);
      },
    };
  }
}
