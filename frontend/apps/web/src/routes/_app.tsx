import { Outlet, createFileRoute } from '@tanstack/react-router';
import { requireAuth } from '../app/auth';

/** Pathless layout: everything below requires a session. */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    const me = await requireAuth(context.queryClient, location.href);
    return { me };
  },
  component: () => <Outlet />,
});
