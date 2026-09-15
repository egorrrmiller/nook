import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { server } from '../mocks/server';
import { mockApi } from '../mocks/handlers';
import { useTabsStore } from '../stores/tabs';
import { useUiStore } from '../stores/ui';

// jsdom lacks these; Base UI / cmdk touch them.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = vi.fn();
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  mockApi.reset();
  localStorage.clear();
  // Zustand stores are module singletons: without this, tabs and UI flags leak between tests.
  useTabsStore.setState({ tabs: [], activeId: null });
  useUiStore.setState({
    sidebarOpen: true,
    pageMode: 'edit',
    paletteOpen: false,
    searchOpen: false,
    shortcutsOpen: false,
    moveNodeId: null,
    peekNodeId: null,
    inspector: null,
    expanded: {},
    collapsedSections: {},
    showArchived: false,
  });
});
afterAll(() => server.close());
