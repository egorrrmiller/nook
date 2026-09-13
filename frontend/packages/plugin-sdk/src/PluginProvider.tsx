import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { buildRegistry, emptyRegistry, type PluginRegistry } from './registry';
import type { NookPlugin } from './types';

const PluginContext = createContext<PluginRegistry>(emptyRegistry);

export interface PluginProviderProps {
  plugins: readonly NookPlugin[];
  children: ReactNode;
}

export function PluginProvider({ plugins, children }: PluginProviderProps) {
  const registry = useMemo(() => buildRegistry(plugins), [plugins]);
  return <PluginContext.Provider value={registry}>{children}</PluginContext.Provider>;
}

export function usePluginRegistry(): PluginRegistry {
  return useContext(PluginContext);
}
