import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SearchRequest } from '@nook/api-client';
import { server } from '../../../mocks/server';
import { SearchDialog } from '../search/SearchDialog';
import { nodeByTitle, renderWidget, signIn } from './helpers';

/** Records every `POST /api/search` body while keeping the real mock handler's response. */
function recordSearchBodies(): SearchRequest[] {
  const bodies: SearchRequest[] = [];
  server.events.on('request:start', async ({ request }) => {
    if (request.method === 'POST' && new URL(request.url).pathname === '/api/search') {
      bodies.push((await request.clone().json()) as SearchRequest);
    }
  });
  return bodies;
}

describe('SearchDialog', () => {
  it('searches, shows sanitised snippets and opens a hit with its block anchor', async () => {
    const { workspaceId } = signIn();
    const user = userEvent.setup();
    const { location, container } = renderWidget(<SearchDialog workspaceId={workspaceId} open onOpenChange={() => {}} />);

    await user.type(await screen.findByTestId('search-input'), 'zettelkasten');
    const results = await screen.findAllByTestId('search-result', undefined, { timeout: 3000 });
    expect(results).toHaveLength(1);
    expect(container.ownerDocument.body.querySelectorAll('mark').length).toBeGreaterThan(0);

    await user.click(results[0]!);
    const reading = nodeByTitle('Reading list');
    await waitFor(() => expect(location().pathname).toBe(`/w/${workspaceId}/p/${reading.id}`));
    expect(location().hash).toMatch(/^b-/);
    expect(JSON.parse(localStorage.getItem(`nook.search.recent:${workspaceId}`)!)).toEqual(['zettelkasten']);
  });

  it('sends the filters and sort in the request body', async () => {
    const { workspaceId } = signIn();
    const plan = nodeByTitle('Nook plan');
    const bodies = recordSearchBodies();
    const user = userEvent.setup();
    renderWidget(<SearchDialog workspaceId={workspaceId} open onOpenChange={() => {}} />, { path: `/w/${workspaceId}/p/${plan.id}` });

    await user.type(await screen.findByTestId('search-input'), 'nook');
    await waitFor(() => expect(bodies.length).toBeGreaterThan(0));

    await user.click(screen.getByTestId('search-filter-title-only'));
    await user.click(screen.getByTestId('search-filter-in-tree'));
    await user.click(screen.getByTestId('search-filter-archived'));
    await user.click(screen.getByTestId('search-sort'));
    await user.click(await screen.findByRole('menuitem', { name: 'Last edited' }));

    await waitFor(() => {
      const last = bodies[bodies.length - 1]!;
      expect(last).toMatchObject({
        query: 'nook',
        sort: 'updated',
        scope: { ancestorId: plan.id },
        filters: { titleOnly: true, includeArchived: true },
      });
    });
  });

  it('keeps the shared filter and input controls keyboard accessible', async () => {
    const { workspaceId } = signIn();
    const user = userEvent.setup();
    renderWidget(<SearchDialog workspaceId={workspaceId} open onOpenChange={() => {}} />);

    const input = await screen.findByRole('textbox', { name: 'Search query' });
    await user.type(input, 'nook');
    expect(screen.getByTestId('search-filter-title-only')).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByTestId('search-filter-title-only'));
    expect(screen.getByTestId('search-filter-title-only')).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Clear query' }));
    expect(input).toHaveValue('');
  });

  it('title-only search drops content matches', async () => {
    const { workspaceId } = signIn();
    const user = userEvent.setup();
    renderWidget(<SearchDialog workspaceId={workspaceId} open onOpenChange={() => {}} />);
    await user.type(await screen.findByTestId('search-input'), 'zettelkasten');
    await screen.findAllByTestId('search-result');

    await user.click(screen.getByTestId('search-filter-title-only'));
    await waitFor(() => expect(screen.queryAllByTestId('search-result')).toHaveLength(0));
    expect(await screen.findByText(/No results for/)).toBeInTheDocument();
  });

  it('matches an alias and labels the hit', async () => {
    const { workspaceId } = signIn();
    const user = userEvent.setup();
    renderWidget(<SearchDialog workspaceId={workspaceId} open onOpenChange={() => {}} />);
    await user.type(await screen.findByTestId('search-input'), 'roadmap');
    const hits = await screen.findAllByTestId('search-result');
    expect(hits.some((h) => /Alias/.test(h.textContent ?? ''))).toBe(true);
  });

  it('keyboard-navigates results with the arrow keys and Enter', async () => {
    const { workspaceId } = signIn();
    const user = userEvent.setup();
    const { location } = renderWidget(<SearchDialog workspaceId={workspaceId} open onOpenChange={() => {}} />);
    await user.type(await screen.findByTestId('search-input'), 'nook');
    const hits = await screen.findAllByTestId('search-result');
    expect(hits.length).toBeGreaterThan(1);

    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(screen.getAllByTestId('search-result')[1]).toHaveAttribute('aria-selected', 'true'));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(location().pathname).toMatch(/\/p\//));
  });

  it('offers recent searches on an empty query', async () => {
    const { workspaceId } = signIn();
    localStorage.setItem(`nook.search.recent:${workspaceId}`, JSON.stringify(['previous query']));
    const user = userEvent.setup();
    renderWidget(<SearchDialog workspaceId={workspaceId} open onOpenChange={() => {}} />);
    const recent = await screen.findByTestId('recent-search');
    expect(recent).toHaveTextContent('previous query');
    await user.click(recent);
    expect(await screen.findByTestId('search-input')).toHaveValue('previous query');
  });

  it('paginates with the cursor from the previous page', async () => {
    const { workspaceId } = signIn();
    const bodies: SearchRequest[] = [];
    server.use(
      http.post('/api/search', async ({ request }) => {
        const body = (await request.json()) as SearchRequest;
        bodies.push(body);
        const page = Number(body.cursor ?? 0);
        return HttpResponse.json({
          hits: [
            {
              node: nodeByTitle('Nook plan'),
              breadcrumb: [],
              snippet: `page ${page}`,
              score: 1,
              matchedIn: 'title',
              blockId: `blk-${page}`,
            },
          ],
          nextCursor: page < 20 ? String(page + 20) : undefined,
          total: 40,
        });
      }),
    );
    const user = userEvent.setup();
    renderWidget(<SearchDialog workspaceId={workspaceId} open onOpenChange={() => {}} />);
    await user.type(await screen.findByTestId('search-input'), 'nook');
    await screen.findAllByTestId('search-result');
    await user.click(await screen.findByTestId('search-load-more'));
    await waitFor(() => expect(screen.getAllByTestId('search-result')).toHaveLength(2));
    expect(bodies[bodies.length - 1]!.cursor).toBe('20');
  });
});
