import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi } from '../../../mocks/handlers';
import { TagsRow } from '../properties/TagsRow';
import { TagChips } from '../tags/TagChips';
import { nodeByTitle, renderWidget, signIn } from './helpers';

describe('tags', () => {
  it('autocompletes existing tags and toggles them', async () => {
    const { workspaceId } = signIn();
    const node = nodeByTitle('Reading list');
    const user = userEvent.setup();
    renderWidget(<TagsRow workspaceId={workspaceId} nodeId={node.id} />);

    await user.click(await screen.findByTestId('tags-trigger'));
    const input = await screen.findByLabelText('Search tags');
    await user.type(input, 'no');
    const option = await screen.findByRole('option', { name: /nook/ });
    await user.click(option);
    await waitFor(() => {
      const tag = mockApi.state.tags.find((t) => t.name === 'nook')!;
      expect(mockApi.state.nodeTags.some((nt) => nt.nodeId === node.id && nt.tagId === tag.id && nt.source === 'manual')).toBe(true);
    });
  });

  it('creates a tag from the query', async () => {
    const { workspaceId } = signIn();
    const node = nodeByTitle('Reading list');
    const user = userEvent.setup();
    renderWidget(<TagsRow workspaceId={workspaceId} nodeId={node.id} />);

    await user.click(await screen.findByTestId('tags-trigger'));
    await user.type(await screen.findByLabelText('Search tags'), 'books');
    await user.click(await screen.findByRole('option', { name: /Create/ }));
    await waitFor(() => expect(mockApi.state.tags.some((t) => t.name === 'books')).toBe(true));
    const created = mockApi.state.tags.find((t) => t.name === 'books')!;
    expect(mockApi.state.nodeTags.some((nt) => nt.nodeId === node.id && nt.tagId === created.id)).toBe(true);
  });

  it('shows inline tags as read-only chips', async () => {
    const { workspaceId } = signIn();
    const node = nodeByTitle('Nook plan');
    renderWidget(<TagsRow workspaceId={workspaceId} nodeId={node.id} />);
    expect(await screen.findByText('#roadmap')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove #roadmap' })).not.toBeInTheDocument();
  });

  it('TagChips renders at most two chips plus a +N badge in compact mode', async () => {
    const { workspaceId } = signIn();
    const node = nodeByTitle('Nook plan');
    // three tags on this node after seeding: nook (manual+inline), roadmap (inline) → add one more
    const extra = { id: 'tag-extra', workspaceId, name: 'extra', color: null, count: 0 };
    mockApi.state.tags.push(extra);
    mockApi.state.nodeTags.push({ nodeId: node.id, tagId: extra.id, source: 'manual' });

    renderWidget(<TagChips workspaceId={workspaceId} nodeId={node.id} compact />);
    const chips = await screen.findByTestId('tag-chips');
    await waitFor(() => expect(chips.textContent).toMatch(/\+1/));
  });

  it('TagChips renders nothing for a node without tags', async () => {
    const { workspaceId } = signIn();
    const node = nodeByTitle('Team home');
    const { container } = renderWidget(<TagChips workspaceId={workspaceId} nodeId={node.id} />);
    await waitFor(() => expect(container.querySelector('[data-testid="tag-chips"]')).toBeNull());
  });
});
