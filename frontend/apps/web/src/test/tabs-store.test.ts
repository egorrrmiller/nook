import { beforeEach, describe, expect, it } from 'vitest';
import { useTabsStore } from '../stores/tabs';

const ws = 'ws-1';
const href = (p: string) => `/w/${ws}${p}`;

describe('tabs store', () => {
  beforeEach(() => {
    useTabsStore.setState({ tabs: [], activeId: null });
  });

  it('ensure() creates one tab for the current route when empty', () => {
    useTabsStore.getState().ensure(ws, href('/'));
    const { tabs, activeId } = useTabsStore.getState();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]!.href).toBe(href('/'));
    expect(activeId).toBe(tabs[0]!.id);
  });

  it('open() inserts after the active tab and activates it; close() picks the neighbour', () => {
    const s = useTabsStore.getState();
    const a = s.open(href('/p/a'), 'A');
    const b = s.open(href('/p/b'), 'B');
    useTabsStore.getState().activate(a);
    const c = useTabsStore.getState().open(href('/p/c'), 'C');
    expect(useTabsStore.getState().tabs.map((t) => t.id)).toEqual([a, c, b]);
    expect(useTabsStore.getState().activeId).toBe(c);

    useTabsStore.getState().close(c);
    expect(useTabsStore.getState().tabs.map((t) => t.id)).toEqual([a, b]);
    expect(useTabsStore.getState().activeId).toBe(b);

    useTabsStore.getState().close();
    expect(useTabsStore.getState().activeId).toBe(a);
    useTabsStore.getState().close();
    expect(useTabsStore.getState().tabs).toHaveLength(0);
    expect(useTabsStore.getState().activeId).toBeNull();
  });

  it('navigate() moves the active tab and setMeta() labels it', () => {
    const s = useTabsStore.getState();
    const a = s.open(href('/p/a'), 'A', '📘');
    useTabsStore.getState().navigate(href('/p/z'));
    const tab = useTabsStore.getState().tabs.find((t) => t.id === a)!;
    expect(tab.href).toBe(href('/p/z'));
    expect(tab.title).toBe('');
    useTabsStore.getState().setMeta(href('/p/z'), 'Zed', '🧭');
    expect(useTabsStore.getState().tabs[0]).toMatchObject({ title: 'Zed', icon: '🧭' });
  });

  it('next()/prev() cycle and reorder() moves tabs', () => {
    const s = useTabsStore.getState();
    const a = s.open(href('/p/a'));
    const b = useTabsStore.getState().open(href('/p/b'));
    const c = useTabsStore.getState().open(href('/p/c'));
    expect(useTabsStore.getState().activeId).toBe(c);
    useTabsStore.getState().next();
    expect(useTabsStore.getState().activeId).toBe(a);
    useTabsStore.getState().prev();
    expect(useTabsStore.getState().activeId).toBe(c);
    useTabsStore.getState().reorder(2, 0);
    expect(useTabsStore.getState().tabs.map((t) => t.id)).toEqual([c, a, b]);
  });

  it('ensure() drops tabs from another workspace', () => {
    const s = useTabsStore.getState();
    s.open('/w/other/p/x', 'X');
    const mine = useTabsStore.getState().open(href('/p/a'), 'A');
    useTabsStore.getState().activate(mine);
    useTabsStore.getState().ensure(ws, href('/p/a'));
    expect(useTabsStore.getState().tabs.map((t) => t.id)).toEqual([mine]);
    // Active tab belonged to the other workspace → first remaining tab adopts the route.
    useTabsStore.setState({ tabs: [], activeId: null });
    const other = useTabsStore.getState().open('/w/other/p/x', 'X');
    useTabsStore.getState().open(href('/p/a'), 'A');
    useTabsStore.getState().activate(other);
    useTabsStore.getState().ensure(ws, href('/p/q'));
    expect(useTabsStore.getState().tabs).toHaveLength(1);
    expect(useTabsStore.getState().tabs[0]!.href).toBe(href('/p/q'));
  });
});
