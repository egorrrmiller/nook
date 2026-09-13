import { createFileRoute, notFound } from '@tanstack/react-router';
import { SettingsScreen, isSettingsSection } from '../components/settings/SettingsScreen';

export const Route = createFileRoute('/_app/w/$workspaceId/settings/$section')({
  beforeLoad: ({ params }) => {
    if (!isSettingsSection(params.section)) throw notFound();
  },
  component: SettingsPage,
  notFoundComponent: () => (
    <div className="flex h-full items-center justify-center text-fg-muted">Unknown settings section.</div>
  ),
});

function SettingsPage() {
  const { workspaceId, section } = Route.useParams();
  return <SettingsScreen workspaceId={workspaceId} section={section} />;
}
