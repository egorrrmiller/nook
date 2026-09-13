import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, signInMock, firstWorkspaceId } from './render';
import { MOCK_OWNER } from '../mocks/db';
import { useWorkspaceStore } from '../stores/workspace';

describe('auth flow', () => {
  it('redirects an anonymous visitor from / to /login', async () => {
    const { router } = await renderApp({ path: '/' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(await screen.findByRole('heading', { name: /sign in to nook/i })).toBeInTheDocument();
  });

  it('shows an error on wrong credentials and signs in on correct ones', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp({ path: '/login' });
    const email = await screen.findByLabelText(/email/i);
    await user.clear(email);
    await user.type(email, MOCK_OWNER.email);
    await user.type(screen.getByLabelText(/password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid email or password/i);

    await user.clear(screen.getByLabelText(/password/i));
    await user.type(screen.getByLabelText(/password/i), MOCK_OWNER.password);
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/w/${firstWorkspaceId()}`));
    expect(await screen.findByTestId('sidebar')).toBeInTheDocument();
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe(firstWorkspaceId());
  });

  it('guards /w/* and preserves the redirect target', async () => {
    const { router } = await renderApp({ path: `/w/${firstWorkspaceId()}` });
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
    expect(router.state.location.search).toMatchObject({
      redirect: expect.stringContaining('/w/'),
    });
  });

  it('validates the invite on /register', async () => {
    await renderApp({ path: '/register?invite=nope' });
    expect(await screen.findByRole('heading', { name: /invite not valid/i })).toBeInTheDocument();
  });

  it('registers with a valid invite', async () => {
    const user = userEvent.setup();
    const { router } = await renderApp({ path: '/register?invite=welcome' });
    await user.type(await screen.findByLabelText(/^email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/display name/i), 'New User');
    await user.type(screen.getByLabelText(/^password/i), 'password123');
    await user.type(screen.getByLabelText(/confirm password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/w\//));
  });

  it('logs out from the user menu', async () => {
    signInMock();
    const user = userEvent.setup();
    const { router } = await renderApp({ path: `/w/${firstWorkspaceId()}` });
    await user.click(await screen.findByTestId('workspace-switcher'));
    await user.click(await screen.findByRole('menuitem', { name: /log out/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});
