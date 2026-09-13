import type { CollabTokenClaims } from './types';

/** Decodes the payload of a JWT without verifying it (the server verifies). */
export function decodeJwtPayload<T = Record<string, unknown>>(token: string): T | null {
  const parts = token.split('.');
  const payload = parts[1];
  if (!payload) return null;
  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    // `atob` is available in browsers, workers and Node >= 16, which covers every target
    // this package runs in — no Node-only Buffer fallback needed.
    if (typeof atob !== 'function') return null;
    const json = decodeURIComponent(
      Array.from(atob(padded), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
    );
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function decodeCollabToken(token: string): CollabTokenClaims | null {
  return decodeJwtPayload<CollabTokenClaims>(token);
}
