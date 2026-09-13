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
import { definePlugin } from '@nook/plugin-sdk';

describe('sidebar tree', () => {
  it('renders root pages and lazily loads children on expand', async () => {
    signInMock();
    const user = userEvent.setup();
    await renderApp({ path: `/w/${firstWorkspaceId()}` });
    const sidebar = await screen.findByTestId('sidebar');
    expect(await within(sidebar).findByText('Getting started')).toBeInTheDocument();
    expect(within(sidebar).getByText('Projects')).toBeInTheDocument();
    expect(within(sidebar).queryByText('Nook plan')).not.toBeInTheDocument();

    const projects = within(sidebar).getByText('Projects').closest('[data-testid="tree-item"]')!;
    await user.click(within(projects as HTMLElement).getByRole('button', { name: /expand/i }));
    expect(await within(sidebar).findByText('Nook plan')).toBeInTheDocument();
    expect(within(sidebar).getByText('Ideas')).toBeInTheDocument();
  });

  it('creates a page from the sidebar and navigates to it', async () => {
    signInMock();
    const user = userEvent.setup();
    const { router } = await renderApp({ path: `/w/${firstWorkspaceId()}` });
    await screen.findByTestId('sidebar');
    const before = mockApi.state.nodes.length;
    await user.click(screen.getByTestId('new-page'));
    await waitFor(() => expect(mockApi.state.nodes.length).toBe(before + 1));
    const created = mockApi.state.nodes[mockApi.state.nodes.length - 1]!;
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/w/${firstWorkspaceId()}/p/${created.id}`),
    );
    expect(await screen.findByTestId('page-view')).toBeInTheDocument();
  });

  it('renames a page inline', async () => {
    signInMock();
    const user = userEvent.setup();
    await renderApp({ path: `/w/${firstWorkspaceId()}` });
    const sidebar = await screen.findByTestId('sidebar');
    const link = await within(sidebar).findByText('Reading list');
    await user.dblClick(link);
    const input = await screen.findByRole('textbox', { name: /rename page/i });
    await user.clear(input);
    await user.type(input, 'Books{Enter}');
    expect(await within(sidebar).findByText('Books')).toBeInTheDocument();
    expect(mockApi.state.nodes.find((n) => n.title === 'Books')).toBeTruthy();
  });

  it('exposes plugin commands in the palette', async () => {
    signInMock();
    const user = userEvent.setup();
    const plugin = definePlugin({
      id: 'test',
      name: 'Test',
      commands: [{ id: 'hi', title: 'Test: say hi', run: ({ toast }) => toast('hi!') }],
    });
    await renderApp({ path: `/w/${firstWorkspaceId()}`, plugins: [plugin] });
    await screen.findByTestId('sidebar');
    await user.keyboard('{Meta>}k{/Meta}');
    const input = await screen.findByTestId('palette-input');
    await user.type(input, 'say hi');
    await user.click(await screen.findByText('Test: say hi'));
    // `role="status"` also matches dnd-kit's live regions (one per DndContext), so target the toast.
    expect(await screen.findByTestId('toast')).toHaveTextContent('hi!');
  });
});
