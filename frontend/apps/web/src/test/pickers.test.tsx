import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Button, TooltipProvider } from '@nook/ui';
import type { NodeCover, NodeIcon } from '@nook/api-client';
import { createQueryClient } from '../app/query-client';
import { CoverPicker, IconPicker } from '../components/pickers';
import { mockApi } from '../mocks/handlers';
import { useWorkspaceStore } from '../stores/workspace';
import { firstWorkspaceId, signInMock } from './render';

/** Signs in and makes the API calls carry `X-Workspace-Id` (renderApp does this for route tests). */
function signInWithWorkspace() {
  const user = signInMock();
  useWorkspaceStore.getState().setActive(firstWorkspaceId());
  return user;
}

function mount(ui: ReactNode) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  );
}

function nodeId() {
  return mockApi.state.nodes[0]!.id;
}

describe('IconPicker (contracts §10)', () => {
  it('picks an emoji, searches, and remembers recents', async () => {
    signInWithWorkspace();
    const user = userEvent.setup();
    const onChange = vi.fn<(icon: NodeIcon | null) => void>();
    mount(
      <IconPicker value={null} nodeId={nodeId()} onChange={onChange}>
        <Button>Add icon</Button>
      </IconPicker>,
    );

    await user.click(screen.getByRole('button', { name: 'Add icon' }));
    const popover = await screen.findByTestId('icon-picker');
    expect(within(popover).getByText('Smileys & people')).toBeInTheDocument();

    await user.type(within(popover).getByTestId('emoji-search'), 'rocket');
    const rocket = await within(popover).findByRole('button', { name: '🚀' });
    await user.click(rocket);
    expect(onChange).toHaveBeenCalledWith({ type: 'emoji', value: '🚀' });
    expect(JSON.parse(localStorage.getItem('nook.emoji.recent') ?? '[]')).toContain('🚀');
  });

  it('accepts an image URL and can remove an existing icon', async () => {
    signInWithWorkspace();
    const user = userEvent.setup();
    const onChange = vi.fn<(icon: NodeIcon | null) => void>();
    mount(
      <IconPicker value={{ type: 'emoji', value: '📘' }} nodeId={nodeId()} onChange={onChange}>
        <Button>Change icon</Button>
      </IconPicker>,
    );

    await user.click(screen.getByRole('button', { name: 'Change icon' }));
    const popover = await screen.findByTestId('icon-picker');
    await user.click(within(popover).getByRole('tab', { name: 'Link' }));
    await user.type(within(popover).getByLabelText('Icon image URL'), 'https://example.com/i.png');
    await user.click(within(popover).getByRole('button', { name: 'Submit' }));
    expect(onChange).toHaveBeenCalledWith({ type: 'url', value: 'https://example.com/i.png' });

    await user.click(screen.getByRole('button', { name: 'Change icon' }));
    await user.click(within(await screen.findByTestId('icon-picker')).getByTestId('icon-remove'));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('offers the upload tab (the multipart round-trip is covered in e2e)', async () => {
    signInWithWorkspace();
    const user = userEvent.setup();
    mount(
      <IconPicker value={null} nodeId={nodeId()} onChange={vi.fn()}>
        <Button>Add icon</Button>
      </IconPicker>,
    );

    await user.click(screen.getByRole('button', { name: 'Add icon' }));
    const popover = await screen.findByTestId('icon-picker');
    await user.click(within(popover).getByRole('tab', { name: 'Upload' }));
    expect(within(popover).getByRole('button', { name: /Choose an image/ })).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeTruthy();
  });
});

describe('CoverPicker (contracts §10)', () => {
  it('lists the gallery and picks a cover', async () => {
    signInWithWorkspace();
    const user = userEvent.setup();
    const onChange = vi.fn<(cover: NodeCover | null) => void>();
    mount(
      <CoverPicker value={null} nodeId={nodeId()} onChange={onChange}>
        <Button>Add cover</Button>
      </CoverPicker>,
    );

    await user.click(screen.getByRole('button', { name: 'Add cover' }));
    const popover = await screen.findByTestId('cover-picker');
    const items = await within(popover).findAllByTestId('cover-gallery-item');
    expect(items.length).toBeGreaterThan(4);
    await user.click(items[0]!);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ type: 'gallery', position: 0.5 }));
  });

  it('repositions an existing cover with the keyboard', async () => {
    signInWithWorkspace();
    const user = userEvent.setup();
    const onChange = vi.fn<(cover: NodeCover | null) => void>();
    mount(
      <CoverPicker value={{ type: 'gallery', value: 'gradient-blue', position: 0.5 }} nodeId={nodeId()} onChange={onChange}>
        <Button>Change cover</Button>
      </CoverPicker>,
    );

    await user.click(screen.getByRole('button', { name: 'Change cover' }));
    const popover = await screen.findByTestId('cover-picker');
    await user.click(within(popover).getByRole('tab', { name: 'Reposition' }));
    const pad = await within(popover).findByTestId('cover-reposition');
    pad.focus();
    await user.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ position: 0.55 }));
    await user.keyboard('{ArrowDown}');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ position: 0.45 }));
  });
});
