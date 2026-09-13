import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/w/$workspaceId/settings/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/w/$workspaceId/settings/$section',
      params: { workspaceId: params.workspaceId, section: 'account' },
    });
  },
});
