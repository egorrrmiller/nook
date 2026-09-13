import { Outlet, createRootRouteWithContext } from '@tanstack/react-router';
import { TooltipProvider } from '@nook/ui';
import type { RouterContext } from '../app/router';
import { Toasts } from '../components/shell/Toasts';

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <TooltipProvider delay={400}>
      <Outlet />
      <Toasts />
    </TooltipProvider>
  );
}
