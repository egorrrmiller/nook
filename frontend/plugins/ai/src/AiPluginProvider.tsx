import { createContext, useContext, type ReactNode } from 'react';
import type { AiApiClient } from './api';

const AiApiContext = createContext<AiApiClient | null>(null);

export function AiPluginProvider({ client, children }: { client: AiApiClient; children: ReactNode }) {
  return <AiApiContext.Provider value={client}>{children}</AiApiContext.Provider>;
}

export function useAiApi(): AiApiClient {
  const client = useContext(AiApiContext);
  if (!client) throw new Error('AI plugin requires AiPluginProvider.');
  return client;
}
