import { jwtVerify } from "jose";

export const DOCUMENT_PREFIX = "node:";

export type Role = "editor" | "viewer";

export interface CollabUser {
  id: string;
  name: string;
  color: string;
}

/** Per-connection context returned by onAuthenticate (also used for direct connections). */
export interface ConnectionContext {
  user: CollabUser;
  role: Role;
  /** "ws" for client connections, "internal" for server-side edits through the internal API. */
  source: "ws" | "internal";
}

export interface CollabClaims {
  sub: string;
  name: string;
  color: string;
  node: string;
  role: Role;
}

export class AuthError extends Error {
  readonly reason = "permission-denied";
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/** `node:<uuid>` → `<uuid>`; throws for any other shape. */
export function nodeIdFromDocumentName(documentName: string): string {
  if (!documentName.startsWith(DOCUMENT_PREFIX)) {
    throw new AuthError(`document name must start with "${DOCUMENT_PREFIX}"`);
  }
  const id = documentName.slice(DOCUMENT_PREFIX.length);
  if (!id) throw new AuthError("document name has an empty node id");
  return id;
}

export function documentNameForNode(nodeId: string): string {
  return `${DOCUMENT_PREFIX}${nodeId}`;
}

/**
 * Verify the collab JWT (HS256) issued by the backend (`GET /api/collab/token`).
 * Claims: {sub, name, color, node, role}. `node` must equal the document's node id.
 */
export async function verifyCollabToken(
  token: string,
  secret: Uint8Array,
  documentName: string,
): Promise<{ claims: CollabClaims; context: ConnectionContext }> {
  const nodeId = nodeIdFromDocumentName(documentName);
  if (!token) throw new AuthError("missing token");

  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] }));
  } catch (err) {
    throw new AuthError(`invalid token: ${err instanceof Error ? err.message : String(err)}`);
  }

  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const node = typeof payload.node === "string" ? payload.node : "";
  const role = payload.role;
  if (!sub) throw new AuthError("token has no sub");
  if (role !== "editor" && role !== "viewer") throw new AuthError("token has an invalid role");
  if (node !== nodeId) throw new AuthError("token is not valid for this document");

  const claims: CollabClaims = {
    sub,
    name: typeof payload.name === "string" ? payload.name : sub,
    color: typeof payload.color === "string" ? payload.color : "#888888",
    node,
    role,
  };
  return {
    claims,
    context: { user: { id: claims.sub, name: claims.name, color: claims.color }, role, source: "ws" },
  };
}
