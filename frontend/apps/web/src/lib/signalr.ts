import {
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
  type HubConnection,
} from '@microsoft/signalr';
import type { Node } from '@nook/api-client';

/** Server → client messages (contracts §5). */
export interface HubEvents {
  nodeChanged: (payload: { node: Node }) => void;
  nodeDeleted: (payload: { id: string }) => void;
  nodeMoved: (payload: { id: string; parentId: string | null; position: string }) => void;
  presence: (payload: {
    nodeId: string;
    users: { id: string; name: string; color: string }[];
  }) => void;
  documentChanged: (payload: { nodeId: string; version: number }) => void;
}

export type HubEventName = keyof HubEvents;

export interface RealtimeClient {
  readonly connection: HubConnection;
  start(): Promise<void>;
  stop(): Promise<void>;
  on<E extends HubEventName>(event: E, handler: HubEvents[E]): () => void;
  watchWorkspace(workspaceId: string): Promise<void>;
  enterNode(nodeId: string): Promise<void>;
  leaveNode(nodeId: string): Promise<void>;
  readonly state: HubConnectionState;
}

export function createRealtimeClient(url = '/hub'): RealtimeClient {
  const connection = new HubConnectionBuilder()
    .withUrl(url, { withCredentials: true })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build();

  let watched: string | null = null;
  const entered = new Set<string>();

  // Re-subscribe after reconnects — groups are lost on the server side.
  connection.onreconnected(() => {
    if (watched) void connection.invoke('watchWorkspace', watched).catch(() => {});
    for (const id of entered) void connection.invoke('enterNode', id).catch(() => {});
  });

  const invokeIfConnected = async (method: string, ...args: unknown[]) => {
    if (connection.state !== HubConnectionState.Connected) return;
    await connection.invoke(method, ...args);
  };

  return {
    connection,
    get state() {
      return connection.state;
    },
    async start() {
      if (connection.state === HubConnectionState.Disconnected) await connection.start();
    },
    async stop() {
      await connection.stop();
    },
    on(event, handler) {
      connection.on(event, handler as (...args: unknown[]) => void);
      return () => connection.off(event, handler as (...args: unknown[]) => void);
    },
    async watchWorkspace(workspaceId) {
      watched = workspaceId;
      await invokeIfConnected('watchWorkspace', workspaceId);
    },
    async enterNode(nodeId) {
      entered.add(nodeId);
      await invokeIfConnected('enterNode', nodeId);
    },
    async leaveNode(nodeId) {
      entered.delete(nodeId);
      await invokeIfConnected('leaveNode', nodeId);
    },
  };
}
