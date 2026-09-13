import { describe, expect, it, vi } from 'vitest';

// BlockNote/ProseMirror need a real layout engine; the page route only needs to mount here.
vi.mock('@nook/editor', () => ({
  NookEditor: () => <div data-testid="editor-stub" />,
  EditorApiProvider: ({ children }: { children: ReactNode }) => children,
}));
import { screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { renderApp, signInMock, firstWorkspaceId } from './render';
import { mockApi } from '../mocks/handlers';

async function openPalette(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard('{Meta>}k{/Meta}');
  const input = await screen.findByTestId('palette-input');
  // Page titles also appear in the sidebar, so every assertion is scoped to the palette popup.
  const popup = input.closest('[role="dialog"]') as HTMLElement;
  return { input, popup };
}

describe('command palette (quick find)', () => {
  it('shows recents with an empty query and server hits while typing', async () => {
    signInMock();
    const user = userEvent.setup();
    await renderApp({ path: `/w/${firstWorkspaceId()}` });
    await screen.findByTestId('sidebar');

    const { input, popup } = await openPalette(user);
    // Empty query → the Recent group (seeded visit to "Nook plan") plus the quick-find fallback.
    expect(await within(popup).findByText('Recent')).toBeInTheDocument();
    expect(await within(popup).findAllByText('Nook plan')).not.toHaveLength(0);

    await user.type(input, 'reading');
    // Quick find ranks exact/prefix/substring matches above fuzzy (trigram) ones, so the page we
    // typed is the first hit; looser matches may follow, exactly like pg_trgm on the server.
    await waitFor(() =>
      expect(within(popup).getAllByTestId('palette-hit')[0]).toHaveTextContent('Reading list'),
    );
    expect(within(popup).queryByText('Recent')).not.toBeInTheDocument();
  });

  it('renders the breadcrumb and an alias badge on a hit', async () => {
    signInMock();
    const ws = firstWorkspaceId();
    const nested = mockApi.state.nodes.find((n) => n.title === 'Nook plan')!;
    mockApi.state.aliases.push({ workspaceId: ws, nodeId: nested.id, value: 'roadmap' });
    const user = userEvent.setup();
    await renderApp({ path: `/w/${ws}` });
    await screen.findByTestId('sidebar');

    const { input, popup } = await openPalette(user);
    await user.type(input, 'roadmap');
    const hit = await within(popup).findByTestId('palette-hit');
    expect(within(hit).getByText('Nook plan')).toBeInTheDocument();
    expect(within(hit).getByText('Projects')).toBeInTheDocument();
    expect(within(hit).getByText(/alias: roadmap/)).toBeInTheDocument();
  });

  it('navigates to the selected page and records the visit', async () => {
    signInMock();
    const ws = firstWorkspaceId();
    const user = userEvent.setup();
    const { router } = await renderApp({ path: `/w/${ws}` });
    await screen.findByTestId('sidebar');

    const { input, popup } = await openPalette(user);
    await user.type(input, 'reading');
    await waitFor(() =>
      expect(within(popup).getAllByTestId('palette-hit')[0]).toHaveTextContent('Reading list'),
    );
    await user.click(within(popup).getAllByTestId('palette-hit')[0]!);

    const target = mockApi.state.nodes.find((n) => n.title === 'Reading list')!;
    await waitFor(() => expect(router.state.location.pathname).toBe(`/w/${ws}/p/${target.id}`));
  });

  it('keeps actions searchable and opens the trash route', async () => {
    signInMock();
    const ws = firstWorkspaceId();
    const user = userEvent.setup();
    const { router } = await renderApp({ path: `/w/${ws}` });
    await screen.findByTestId('sidebar');

    const { input, popup } = await openPalette(user);
    await user.type(input, 'trash');
    await user.click(await within(popup).findByText('Open trash'));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/w/${ws}/trash`));
    expect(await screen.findByTestId('trash-view')).toBeInTheDocument();
  });
});
