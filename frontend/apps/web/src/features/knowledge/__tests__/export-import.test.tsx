import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ImportResponse } from '@nook/api-client';
import { server } from '../../../mocks/server';
import { ExportDialog } from '../export/ExportDialog';
import { ImportDialog } from '../import/ImportDialog';
import { nodeByTitle, renderWidget, signIn } from './helpers';

describe('ExportDialog', () => {
  it('downloads a zip with the chosen format', async () => {
    const { workspaceId } = signIn();
    const plan = nodeByTitle('Nook plan');
    const user = userEvent.setup();
    const clicks: HTMLAnchorElement[] = [];
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      clicks.push(this as HTMLAnchorElement);
    };
    // jsdom has no object URLs.
    const createURL = vi.fn(() => 'blob:mock');
    Object.assign(URL, { createObjectURL: createURL, revokeObjectURL: vi.fn() });

    try {
      renderWidget(<ExportDialog workspaceId={workspaceId} nodeIds={[plan.id]} open onOpenChange={() => {}} />);
      expect(screen.getByRole('checkbox', { name: 'Include sub-pages' })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: 'Include files and images' })).toBeChecked();
      await user.click(await screen.findByTestId('export-format-html'));
      await user.click(screen.getByTestId('export-run'));
      await waitFor(() => expect(screen.getByTestId('export-done')).toBeInTheDocument());
      expect(clicks).toHaveLength(1);
      expect(clicks[0]!.download).toMatch(/\.zip$/);
      expect(createURL).toHaveBeenCalled();
    } finally {
      HTMLAnchorElement.prototype.click = realClick;
    }
  });
});

function mdFile(name = 'notes.md') {
  return new File(['# Imported notes\n\nHello from markdown.'], name, { type: 'text/markdown' });
}

/**
 * `request.formData()` never resolves under jsdom (jsdom Blobs are not readable by undici), so the
 * multipart handler in mocks/handlers/knowledge.ts is exercised by e2e/knowledge.spec.ts in a real
 * browser; here the route is stubbed with canned §9.8 responses to test the dialog itself.
 */
function stubImport(response: ImportResponse, status = 200) {
  server.use(http.post('/api/import', () => HttpResponse.json(response, { status })));
}

describe('ImportDialog', () => {
  it('imports a markdown file and opens the created page', async () => {
    const { workspaceId } = signIn();
    const created = nodeByTitle('Ideas').id;
    stubImport({ pagesCreated: 1, nodeIds: [created], warnings: [] });
    const user = userEvent.setup();
    const { location } = renderWidget(<ImportDialog workspaceId={workspaceId} parentId={null} open onOpenChange={() => {}} />);

    await user.upload(await screen.findByTestId('import-file-input'), mdFile());
    expect(await screen.findByText('notes.md')).toBeInTheDocument();
    await user.click(await screen.findByTestId('import-run'));

    const result = await screen.findByTestId('import-result');
    expect(result).toHaveTextContent('Imported 1 page');

    await user.click(screen.getByTestId('import-open-first'));
    await waitFor(() => expect(location().pathname).toBe(`/w/${workspaceId}/p/${created}`));
  });

  it('shows the warnings returned by the server', async () => {
    const { workspaceId } = signIn();
    stubImport({ pagesCreated: 3, nodeIds: [nodeByTitle('Ideas').id], warnings: ['Skipped 1 unsupported file: notes.canvas'] });
    const user = userEvent.setup();
    renderWidget(<ImportDialog workspaceId={workspaceId} open onOpenChange={() => {}} />);
    await user.upload(await screen.findByTestId('import-file-input'), new File(['zip'], 'vault.zip', { type: 'application/zip' }));
    await user.click(await screen.findByTestId('import-run'));
    const result = await screen.findByTestId('import-result');
    expect(result).toHaveTextContent('Imported 3 pages');
    expect(result).toHaveTextContent('notes.canvas');
  });

  it('rejects an unsupported file dropped on the zone', async () => {
    const { workspaceId } = signIn();
    renderWidget(<ImportDialog workspaceId={workspaceId} open onOpenChange={() => {}} />);
    const zone = await screen.findByTestId('import-dropzone');
    // `user.upload` honours the input's `accept`, so the rejected path is exercised through a drop.
    fireEvent.drop(zone, { dataTransfer: { files: [new File(['x'], 'photo.png', { type: 'image/png' })], types: ['Files'] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/Unsupported file type/);
    expect(await screen.findByTestId('import-run')).toBeDisabled();
  });

  it('polls the job for the 202 background path', async () => {
    const { workspaceId } = signIn();
    const created = nodeByTitle('Ideas').id;
    let polls = 0;
    server.use(
      http.post('/api/import', () => HttpResponse.json({ jobId: 'job-1' }, { status: 202 })),
      http.get('/api/import/:jobId', () => {
        polls += 1;
        return polls < 2
          ? HttpResponse.json({ status: 'running' })
          : HttpResponse.json({ status: 'done', result: { pagesCreated: 3, nodeIds: [created], warnings: [] } });
      }),
    );
    const user = userEvent.setup();
    renderWidget(<ImportDialog workspaceId={workspaceId} open onOpenChange={() => {}} />);
    await user.upload(await screen.findByTestId('import-file-input'), new File(['zip'], 'large-vault.zip', { type: 'application/zip' }));
    await user.click(await screen.findByTestId('import-run'));
    expect(await screen.findByText(/processing in the background/i)).toBeInTheDocument();
    const result = await screen.findByTestId('import-result', undefined, { timeout: 10_000 });
    expect(result).toHaveTextContent('Imported 3 pages');
    expect(polls).toBeGreaterThanOrEqual(2);
  }, 20_000);

  it('surfaces a failed import', async () => {
    const { workspaceId } = signIn();
    server.use(http.post('/api/import', () => HttpResponse.json({ title: 'Unsupported file type .zip' }, { status: 415 })));
    const user = userEvent.setup();
    renderWidget(<ImportDialog workspaceId={workspaceId} open onOpenChange={() => {}} />);
    await user.upload(await screen.findByTestId('import-file-input'), mdFile());
    await user.click(await screen.findByTestId('import-run'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported file type');
  });
});
