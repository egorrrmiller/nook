export interface ApiConfig {
  /** Prefix for every path, default '' (same origin, paths already start with /api). */
  baseUrl: string;
  /** Active workspace; sent as `X-Workspace-Id` on every request when present. */
  getWorkspaceId: () => string | null | undefined;
  /** Injected for tests / non-browser runtimes. */
  fetch?: typeof fetch;
  /** Called on 401 for authenticated endpoints. */
  onUnauthorized?: (path: string) => void;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly path: string;

  constructor(status: number, path: string, body: unknown) {
    super(ApiError.describe(status, body));
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.path = path;
  }

  private static describe(status: number, body: unknown): string {
    if (body && typeof body === 'object') {
      const b = body as Record<string, unknown>;
      const msg = b.title ?? b.message ?? b.error ?? b.detail;
      if (typeof msg === 'string' && msg.length > 0) return msg;
    }
    if (typeof body === 'string' && body.length > 0) return body;
    return `Request failed with status ${status}`;
  }
}

export type Query = Record<string, string | number | boolean | undefined | null>;

export interface RequestOptions {
  /** JSON-serialised unless it is a `FormData` (sent as multipart, no Content-Type set). */
  body?: unknown;
  query?: Query;
  /** Skip the `X-Workspace-Id` header (auth endpoints). */
  noWorkspace?: boolean;
  signal?: AbortSignal;
  /**
   * Return the raw `Response` instead of parsing JSON (binary downloads such as the export zip).
   * Non-2xx responses still throw `ApiError`.
   */
  raw?: boolean;
}

export interface RawRequestOptions extends RequestOptions {
  raw: true;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export function buildQuery(query?: Query): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

function isFormData(body: unknown): body is FormData {
  return typeof FormData !== 'undefined' && body instanceof FormData;
}

/** Parses a response body as JSON when possible, falling back to the raw text (empty → undefined). */
async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createHttp(config: ApiConfig) {
  const doFetch: typeof fetch = (input, init) => (config.fetch ?? globalThis.fetch)(input, init);

  async function request(method: HttpMethod, path: string, opts: RawRequestOptions): Promise<Response>;
  async function request<T>(method: HttpMethod, path: string, opts?: RequestOptions): Promise<T>;
  async function request<T>(
    method: HttpMethod,
    path: string,
    opts: RequestOptions = {},
  ): Promise<T | Response> {
    const headers = new Headers({ Accept: opts.raw ? '*/*' : 'application/json' });
    const multipart = isFormData(opts.body);
    if (opts.body !== undefined && !multipart) headers.set('Content-Type', 'application/json');
    if (!opts.noWorkspace) {
      const ws = config.getWorkspaceId();
      if (ws) headers.set('X-Workspace-Id', ws);
    }
    const url = `${config.baseUrl}${path}${buildQuery(opts.query)}`;
    const res = await doFetch(url, {
      method,
      headers,
      credentials: 'include',
      body:
        opts.body === undefined
          ? undefined
          : multipart
            ? (opts.body as FormData)
            : JSON.stringify(opts.body),
      signal: opts.signal,
    });

    if (!res.ok) {
      if (res.status === 401) config.onUnauthorized?.(path);
      throw new ApiError(res.status, path, await readBody(res));
    }
    if (opts.raw) return res;
    if (res.status === 204) return undefined as T;
    return (await readBody(res)) as T;
  }

  return request;
}

export type Http = ReturnType<typeof createHttp>;
