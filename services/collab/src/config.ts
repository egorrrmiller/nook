import { existsSync } from "node:fs";
import { resolve } from "node:path";

export interface CollabConfig {
  /** Port for the Hocuspocus WebSocket server (also serves GET /healthz). */
  port: number;
  /** Port for the internal HTTP API (X-Internal-Token guarded). */
  internalPort: number;
  /** Bind address for both listeners. */
  host: string;
  /** Base URL of the C# backend that exposes /internal/documents/{id}. */
  apiBase: string;
  /** Shared secret sent as X-Internal-Token to the backend and required from callers of our internal API. */
  internalToken: string;
  /** HS256 secret used to verify collab JWTs issued by the backend. */
  jwtSecret: string;
  /** Debounce for onStoreDocument in ms. */
  storeDebounceMs: number;
  /** Max debounce for onStoreDocument in ms. */
  storeMaxDebounceMs: number;
  /** Timeout for a single backend HTTP call in ms. */
  backendTimeoutMs: number;
  /** Log level for pino. */
  logLevel: string;
  /** Pretty-print logs (dev only). */
  logPretty: boolean;
  /** How long graceful shutdown waits for pending stores before giving up, in ms. */
  shutdownTimeoutMs: number;
}

/**
 * In development, load the repo-root `.env` (two levels above services/collab) if present.
 * Uses Node's built-in loader; existing process env wins.
 */
export function loadDotEnv(): string | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
    resolve(import.meta.dirname, "../../../.env"),
  ];
  for (const file of candidates) {
    if (existsSync(file)) {
      try {
        process.loadEnvFile(file);
        return file;
      } catch {
        // ignore malformed .env, fall through to process env
      }
    }
  }
  return undefined;
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) throw new Error(`Environment variable ${name} must be an integer, got "${raw}"`);
  return n;
}

export function loadConfig(overrides: Partial<CollabConfig> = {}): CollabConfig {
  const env = process.env;
  const cfg: CollabConfig = {
    port: intEnv("COLLAB_PORT", 1234),
    internalPort: intEnv("COLLAB_INTERNAL_PORT", 1235),
    host: env.COLLAB_HOST ?? "0.0.0.0",
    apiBase: (env.COLLAB_API_BASE ?? "http://localhost:5000").replace(/\/+$/, ""),
    internalToken: env.NOOK_INTERNAL_TOKEN ?? "",
    jwtSecret: env.NOOK_COLLAB_JWT_SECRET ?? "",
    storeDebounceMs: intEnv("COLLAB_STORE_DEBOUNCE_MS", 2000),
    storeMaxDebounceMs: intEnv("COLLAB_STORE_MAX_DEBOUNCE_MS", 10000),
    backendTimeoutMs: intEnv("COLLAB_BACKEND_TIMEOUT_MS", 10000),
    logLevel: env.LOG_LEVEL ?? "info",
    logPretty: env.LOG_PRETTY === "1" || env.LOG_PRETTY === "true",
    shutdownTimeoutMs: intEnv("COLLAB_SHUTDOWN_TIMEOUT_MS", 20000),
    ...overrides,
  };
  if (!cfg.internalToken) throw new Error("NOOK_INTERNAL_TOKEN is required");
  if (!cfg.jwtSecret) throw new Error("NOOK_COLLAB_JWT_SECRET is required");
  return cfg;
}
