import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BacklinksPanel } from '../backlinks/BacklinksPanel';
import { nodeByTitle, renderWidget, signIn } from './helpers';

describe('BacklinksPanel', () => {
  it('groups backlinks by source page with a block anchor href', async () => {
    const { workspaceId } = signIn();
    const plan = nodeByTitle('Nook plan');
    renderWidget(<BacklinksPanel workspaceId={workspaceId} nodeId={plan.id} />, { path: `/w/${workspaceId}/p/${plan.id}` });

    const groups = await screen.findAllByTestId('backlink-group');
    expect(groups.length).toBe(2); // Ideas + Projects
    expect(screen.getByText('Ideas')).toBeInTheDocument();
    const item = (await screen.findAllByTestId('backlink-item'))[0]!;
    expect(item.getAttribute('href')).toMatch(new RegExp(`^/w/${workspaceId}/p/[^#]+#b-blk-`));
    expect(screen.getAllByText(/Embed|Mention/i).length).toBeGreaterThan(0);
  });

  it('highlights the page title inside the snippet', async () => {
    const { workspaceId } = signIn();
    const plan = nodeByTitle('Nook plan');
    const { container } = renderWidget(<BacklinksPanel workspaceId={workspaceId} nodeId={plan.id} />);
    await screen.findAllByTestId('backlink-item');
    await waitFor(() => expect(container.querySelectorAll('mark').length).toBeGreaterThan(0));
    expect([...container.querySelectorAll('mark')].some((m) => /nook plan/i.test(m.textContent ?? ''))).toBe(true);
  });

  it('navigates to the source block when a backlink is clicked', async () => {
    const { workspaceId } = signIn();
    const plan = nodeByTitle('Nook plan');
    const ideas = nodeByTitle('Ideas');
    const user = userEvent.setup();
    const { location } = renderWidget(<BacklinksPanel workspaceId={workspaceId} nodeId={plan.id} />, { path: `/w/${workspaceId}/p/${plan.id}` });

    const group = (await screen.findAllByTestId('backlink-group')).find((g) => within(g).queryByText('Ideas'))!;
    await user.click(within(group).getAllByTestId('backlink-item')[0]!);
    await waitFor(() => expect(location().pathname).toBe(`/w/${workspaceId}/p/${ideas.id}`));
    expect(location().hash).toBe('b-blk-snap-ideas-1');
  });

  it('lists outgoing links and flags broken ones', async () => {
    const { workspaceId } = signIn();
    const reading = nodeByTitle('Reading list');
    renderWidget(<BacklinksPanel workspaceId={workspaceId} nodeId={reading.id} />);
    const rows = await screen.findAllByTestId('outgoing-link');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveAttribute('data-broken', 'true');
    expect(screen.getAllByText(/broken/i).length).toBeGreaterThan(0);
  });

  it('shows an empty state when nothing links here', async () => {
    const { workspaceId } = signIn();
    const ideas = nodeByTitle('Ideas');
    renderWidget(<BacklinksPanel workspaceId={workspaceId} nodeId={ideas.id} />);
    expect(await screen.findByText('No backlinks yet')).toBeInTheDocument();
  });
});
