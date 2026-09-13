import { setupWorker } from 'msw/browser';
import { getResponse } from 'msw';
import { handlers, mockApi } from './handlers';

export const worker = setupWorker(...handlers);

/**
 * Some embedded browsers (e.g. IDE preview panes) refuse to register service workers. Fall back
 * to resolving the same handlers in-process by wrapping `fetch`, so `VITE_MOCK=1` still works.
 */
function installFetchFallback() {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url, window.location.href);
    if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
      const response = await getResponse(handlers, request.clone());
      if (response) return response;
    }
    return original(request);
  };
  console.warn('[mock] service worker unavailable — using in-process fetch fallback');
}

export async function startMockWorker() {
  // Auto sign-in is intentionally not done: the e2e smoke test exercises the login form.
  try {
    await worker.start({ onUnhandledRequest: 'bypass', quiet: true });
  } catch {
    installFetchFallback();
  }
  (window as unknown as { __nookMock?: typeof mockApi }).__nookMock = mockApi;
}
