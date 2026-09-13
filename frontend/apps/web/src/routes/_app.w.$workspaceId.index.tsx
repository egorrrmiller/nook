import { createFileRoute } from '@tanstack/react-router';
import { HomeScreen } from '../components/page/HomeScreen';

export const Route = createFileRoute('/_app/w/$workspaceId/')({
  component: WorkspaceHomePage,
});

function WorkspaceHomePage() {
  const { workspaceId } = Route.useParams();
  return <HomeScreen workspaceId={workspaceId} />;
}
