import { HubConnectionBuilder, HubConnectionState, LogLevel, type HubConnection } from '@microsoft/signalr';
import type { Node } from '@nook/api-client';

/** Server → client messages (contracts §5). */
export interface HubEvents {
  nodeChanged: { node: Node };
  nodeDeleted: { id: string };
  nodeMoved: { id: string; parentId: string | null; position: string };
  presence: { nodeId: string; users: { id: string; name: string; color: string }[] };
  documentChanged: { nodeId: string; version: number };
}

export type HubEventName = keyof HubEvents;
export type HubHandler<K extends HubEventName> = (payload: HubEvents[K]) => void;

/** Typed wrapper over the SignalR hub at `/hub`. */
export class NookHub {
  private readonly conn: HubConnection;
  private watched: string | null = null;
  private readonly entered = new Set<string>();

  constructor(url = '/hub') {
    this.conn = new HubConnectionBuilder()
      .withUrl(url)
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();
    this.conn.onreconnected(() => {
      // Re-subscribe after a dropped connection.
      if (this.watched) void this.invoke('watchWorkspace', this.watched);
      for (const id of this.entered) void this.invoke('enterNode', id);
    });
  }

  get state(): HubConnectionState {
    return this.conn.state;
  }

  async start(): Promise<void> {
    if (this.conn.state === HubConnectionState.Disconnected) await this.conn.start();
  }

  async stop(): Promise<void> {
    await this.conn.stop();
  }

  on<K extends HubEventName>(event: K, handler: HubHandler<K>): () => void {
    const h = (payload: HubEvents[K]) => handler(payload);
    this.conn.on(event, h);
    return () => this.conn.off(event, h);
  }

  async watchWorkspace(workspaceId: string): Promise<void> {
    this.watched = workspaceId;
    await this.invoke('watchWorkspace', workspaceId);
  }

  async enterNode(nodeId: string): Promise<void> {
    this.entered.add(nodeId);
    await this.invoke('enterNode', nodeId);
  }

  async leaveNode(nodeId: string): Promise<void> {
    this.entered.delete(nodeId);
    await this.invoke('leaveNode', nodeId);
  }

  private async invoke(method: 'watchWorkspace' | 'enterNode' | 'leaveNode', arg: string): Promise<void> {
    if (this.conn.state !== HubConnectionState.Connected) return;
    try {
      await this.conn.invoke(method, arg);
    } catch (e) {
      console.warn(`[hub] ${method} failed`, e);
    }
  }
}

let singleton: NookHub | null = null;
export function getHub(): NookHub {
  singleton ??= new NookHub();
  return singleton;
}
