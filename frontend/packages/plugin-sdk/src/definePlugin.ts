import type { NookPlugin } from './types';

const ID = /^[a-z0-9][a-z0-9._-]*$/i;

/** Validates and returns the plugin definition (identity function with checks). */
export function definePlugin<const P extends NookPlugin>(plugin: P): P {
  if (!plugin.id || !ID.test(plugin.id)) {
    throw new Error(`definePlugin: invalid plugin id "${plugin.id}"`);
  }
  if (!plugin.name) throw new Error(`definePlugin(${plugin.id}): name is required`);
  const seen = new Set<string>();
  for (const c of plugin.commands ?? []) {
    if (seen.has(c.id)) throw new Error(`definePlugin(${plugin.id}): duplicate command id "${c.id}"`);
    seen.add(c.id);
  }
  return plugin;
}
