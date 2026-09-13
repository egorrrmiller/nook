import type { Logger } from "./logger.js";
import type { Block } from "./types.js";

export interface DocumentRecord {
  /** base64-encoded Yjs update (full state) or null for a new document. */
  ydoc: string | null;
  version: number;
}

export interface StoreDocumentRequest {
  ydoc: string;
  version: number;
  title: string;
  blocks: Block[];
  updates?: string[];
  userIds: string[];
}

export class BackendHttpError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly url: string,
    readonly body: string,
  ) {
    super(`${method} ${url} -> ${status}${body ? `: ${body.slice(0, 200)}` : ""}`);
    this.name = "BackendHttpError";
  }
}

export class BackendConflictError extends BackendHttpError {
  constructor(method: string, url: string, body: string) {
    super(409, method, url, body);
    this.name = "BackendConflictError";
  }
}

/** Thin client for the C# internal document API (contracts.md §3). */
export class BackendClient {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string,
    private readonly timeoutMs: number,
    private readonly log: Logger,
  ) {}

  async getDocument(nodeId: string): Promise<DocumentRecord> {
    const url = `${this.baseUrl}/internal/documents/${encodeURIComponent(nodeId)}`;
    const res = await this.request("GET", url);
    const text = await res.text();
    if (!res.ok) throw new BackendHttpError(res.status, "GET", url, text);
    const json = JSON.parse(text) as Partial<DocumentRecord>;
    return {
      ydoc: typeof json.ydoc === "string" && json.ydoc.length > 0 ? json.ydoc : null,
      version: typeof json.version === "number" ? json.version : 0,
    };
  }

  async putDocument(nodeId: string, body: StoreDocumentRequest): Promise<{ version: number }> {
    const url = `${this.baseUrl}/internal/documents/${encodeURIComponent(nodeId)}`;
    const res = await this.request("PUT", url, JSON.stringify(body));
    const text = await res.text();
    if (res.status === 409) throw new BackendConflictError("PUT", url, text);
    if (!res.ok) throw new BackendHttpError(res.status, "PUT", url, text);
    const json = text ? (JSON.parse(text) as { version?: number }) : {};
    return { version: typeof json.version === "number" ? json.version : body.version + 1 };
  }

  private async request(method: string, url: string, body?: string): Promise<Response> {
    const headers: Record<string, string> = { "X-Internal-Token": this.internalToken, Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    this.log.trace({ method, url }, "backend request");
    return fetch(url, { method, headers, body, signal: AbortSignal.timeout(this.timeoutMs) });
  }
}
