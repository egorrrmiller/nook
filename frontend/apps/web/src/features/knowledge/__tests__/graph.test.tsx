import { beforeAll, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GraphView } from '../graph/GraphView';
import { nodeByTitle, renderWidget, signIn } from './helpers';

// jsdom has no 2D canvas; the renderer only needs a context-shaped object to draw into.
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () =>
      new Proxy(
        {},
        {
          get: (_t, prop) => (prop === 'canvas' ? null : () => undefined),
          set: () => true,
        },
      ),
  ) as unknown as HTMLCanvasElement['getContext'];
});

describe('GraphView', () => {
  it('renders the canvas and the broken-links list', async () => {
    const { workspaceId } = signIn();
    renderWidget(<GraphView workspaceId={workspaceId} />, { path: `/w/${workspaceId}/graph` });

    const canvas = await screen.findByTestId('graph-canvas');
    expect(canvas).toHaveAttribute('aria-label', expect.stringMatching(/\d+ nodes/));
    const broken = await screen.findByTestId('broken-links');
    const items = await screen.findAllByTestId('broken-link-item');
    expect(items.length).toBeGreaterThan(0);
    expect(broken).toHaveTextContent('[[Missing page]]');
    expect(items[0]!.getAttribute('href')).toMatch(new RegExp(`^/w/${workspaceId}/p/`));
  });

  it('highlights nodes matching the search box', async () => {
    const { workspaceId } = signIn();
    const user = userEvent.setup();
    renderWidget(<GraphView workspaceId={workspaceId} />, { path: `/w/${workspaceId}/graph` });
    await screen.findByTestId('graph-canvas');
    await user.type(screen.getByTestId('graph-search'), 'nook');
    await waitFor(() => expect(screen.getByTestId('graph-search').parentElement).toHaveTextContent('1'));
  });

  it('switches to the page scope and asks for a rooted graph', async () => {
    const { workspaceId } = signIn();
    const plan = nodeByTitle('Nook plan');
    const user = userEvent.setup();
    renderWidget(<GraphView workspaceId={workspaceId} focusNodeId={plan.id} />, { path: `/w/${workspaceId}/graph` });
    await screen.findByTestId('graph-canvas');

    await user.click(screen.getByRole('button', { name: 'Whole workspace' }));
    await waitFor(() => expect(screen.getByTestId('graph-canvas').getAttribute('aria-label')).toMatch(/7 nodes|5 nodes/));
    await user.click(screen.getByTestId('graph-scope-page'));
    await waitFor(() => expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument());
  });

  it('toggles parent edges off', async () => {
    const { workspaceId } = signIn();
    const user = userEvent.setup();
    renderWidget(<GraphView workspaceId={workspaceId} />, { path: `/w/${workspaceId}/graph` });
    await screen.findByTestId('graph-canvas');
    const before = screen.getByText(/links · scroll to zoom/).textContent!;
    await user.click(screen.getByTestId('graph-toggle-parents'));
    await waitFor(() => expect(screen.getByText(/links · scroll to zoom/).textContent).not.toBe(before));
  });

  it('exposes graph controls as shared accessible buttons', async () => {
    const { workspaceId } = signIn();
    renderWidget(<GraphView workspaceId={workspaceId} />, { path: `/w/${workspaceId}/graph` });
    await screen.findByTestId('graph-canvas');

    expect(screen.getByTestId('graph-toggle-parents')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeInTheDocument();
  });
});
