import { setupWorker } from 'msw/browser';
import { handlers, mockApi } from './handlers';

export const worker = setupWorker(...handlers);

export async function startMockWorker() {
  // Auto sign-in is intentionally not done: the e2e smoke test exercises the login form.
  await worker.start({ onUnhandledRequest: 'bypass', quiet: true });
  (window as unknown as { __nookMock?: typeof mockApi }).__nookMock = mockApi;
}
