import { createFileRoute, redirect } from '@tanstack/react-router';
import { ApiError } from '@nook/api-client';
import { meQuery } from '../lib/queries';
import { pickWorkspace } from '../app/auth';
import { LoginScreen } from '../components/auth/LoginScreen';

export interface LoginSearch {
  redirect?: string;
}

export const Route = createFileRoute('/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  beforeLoad: async ({ context, search }) => {
    // Already signed in → go home.
    try {
      const me = await context.queryClient.ensureQueryData(meQuery());
      const workspaceId = pickWorkspace(me);
      if (search.redirect) throw redirect({ href: search.redirect });
      if (workspaceId) throw redirect({ to: '/w/$workspaceId', params: { workspaceId } });
      throw redirect({ to: '/' });
    } catch (err) {
      if (err instanceof ApiError) return; // 401 → show the form
      throw err;
    }
  },
  component: LoginScreen,
});
