/**
 * Turns the `wsUrl` from `GET /api/collab/token` (`/collab`, same origin) into an
 * absolute ws(s) URL. Absolute http(s)/ws(s) URLs are passed through (protocol mapped).
 */
export function resolveWsUrl(wsUrl: string, loc: { protocol: string; host: string } = window.location): string {
  if (/^wss?:\/\//i.test(wsUrl)) return wsUrl;
  if (/^https?:\/\//i.test(wsUrl)) return wsUrl.replace(/^http/i, 'ws');
  const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
  const path = wsUrl.startsWith('/') ? wsUrl : `/${wsUrl}`;
  return `${scheme}://${loc.host}${path}`;
}

/** Hocuspocus document name per contracts §3. */
export function documentName(nodeId: string): string {
  return `node:${nodeId}`;
}
