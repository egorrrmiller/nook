import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { firstWorkspaceId, renderApp, signInMock } from './render';

describe('settings controls', () => {
  it('opens the workspace icon picker instead of rendering a text field', async () => {
    const user = userEvent.setup();
    signInMock();
    await renderApp({ path: `/w/${firstWorkspaceId()}/settings/workspace` });

    await screen.findByTestId('settings-workspace');
    expect(screen.queryByRole('textbox', { name: 'Icon' })).not.toBeInTheDocument();

    await user.click(screen.getByTestId('workspace-icon-picker'));
    const picker = await screen.findByTestId('icon-picker');
    expect(picker).toBeInTheDocument();
    expect(within(picker).queryByRole('tab', { name: 'Upload' })).not.toBeInTheDocument();
  });

  it('keeps theme choices as accessible buttons with one active choice', async () => {
    const user = userEvent.setup();
    signInMock();
    await renderApp({ path: `/w/${firstWorkspaceId()}/settings/appearance` });

    await screen.findByTestId('settings-appearance');
    const light = screen.getByTestId('theme-light');
    const dark = screen.getByTestId('theme-dark');

    expect(light).toHaveAttribute('aria-pressed');
    expect(dark).toHaveAttribute('aria-pressed');

    await user.click(light);

    expect(light).toHaveAttribute('aria-pressed', 'true');
    expect(dark).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps token scopes keyboard and label accessible', async () => {
    const user = userEvent.setup();
    signInMock();
    await renderApp({ path: `/w/${firstWorkspaceId()}/settings/tokens` });

    await screen.findByTestId('settings-tokens');
    const read = screen.getByRole('checkbox', { name: 'read' });
    const write = screen.getByRole('checkbox', { name: 'write' });

    expect(read).toBeChecked();
    expect(write).not.toBeChecked();

    await user.click(write);
    await user.click(read);

    expect(write).toBeChecked();
    expect(read).not.toBeChecked();
  });
});
