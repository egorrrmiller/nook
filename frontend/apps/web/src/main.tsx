import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { PluginProvider } from '@nook/plugin-sdk';
import { EditorApiProvider } from '@nook/editor';
import './styles/globals.css';
import { createQueryClient } from './app/query-client';
import { createAppRouter } from './app/router';
import { plugins } from './app/plugins';
import { api, IS_MOCK } from './lib/api';
import { applyTheme, useUiStore } from './stores/ui';

async function bootstrap() {
  if (IS_MOCK) {
    const { startMockWorker } = await import('./mocks/browser');
    await startMockWorker();
  }
  applyTheme(useUiStore.getState().theme);

  const queryClient = createQueryClient();
  const router = createAppRouter(queryClient);

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <PluginProvider plugins={plugins}>
          <EditorApiProvider api={api}>
            <RouterProvider router={router} />
          </EditorApiProvider>
        </PluginProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}

void bootstrap();
