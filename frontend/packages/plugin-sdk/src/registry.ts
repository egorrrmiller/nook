import type {
  NookPlugin,
  PluginBlockSpecs,
  PluginInlineContentSpecs,
  PluginPropertyRenderer,
  PluginSlashMenuItem,
  RegisteredCommand,
  RegisteredSettingsPage,
  RegisteredSidebarPanel,
} from './types';

export interface PluginRegistry {
  plugins: readonly NookPlugin[];
  commands: readonly RegisteredCommand[];
  blocks: PluginBlockSpecs;
  inlineContent: PluginInlineContentSpecs;
  slashMenuItems: readonly PluginSlashMenuItem[];
  sidebarPanels: readonly RegisteredSidebarPanel[];
  settingsPages: readonly RegisteredSettingsPage[];
  propertyRenderers: readonly PluginPropertyRenderer[];
}

export function buildRegistry(plugins: readonly NookPlugin[]): PluginRegistry {
  const ids = new Set<string>();
  const commands: RegisteredCommand[] = [];
  const blocks: PluginBlockSpecs = {};
  const inlineContent: PluginInlineContentSpecs = {};
  const slashMenuItems: PluginSlashMenuItem[] = [];
  const sidebarPanels: RegisteredSidebarPanel[] = [];
  const settingsPages: RegisteredSettingsPage[] = [];
  const propertyRenderers: PluginPropertyRenderer[] = [];

  for (const p of plugins) {
    if (ids.has(p.id)) throw new Error(`Plugin "${p.id}" registered twice`);
    ids.add(p.id);
    for (const c of p.commands ?? []) commands.push({ ...c, id: `${p.id}:${c.id}`, pluginId: p.id });
    for (const [type, spec] of Object.entries(p.blocks ?? {})) {
      if (blocks[type]) throw new Error(`Block type "${type}" registered by two plugins`);
      blocks[type] = spec;
    }
    for (const [type, spec] of Object.entries(p.inlineContent ?? {})) {
      if (inlineContent[type]) throw new Error(`Inline content "${type}" registered by two plugins`);
      inlineContent[type] = spec;
    }
    slashMenuItems.push(...(p.slashMenuItems ?? []));
    for (const s of p.sidebarPanels ?? []) sidebarPanels.push({ ...s, id: `${p.id}:${s.id}`, pluginId: p.id });
    for (const s of p.settingsPages ?? []) settingsPages.push({ ...s, id: `${p.id}:${s.id}`, pluginId: p.id });
    propertyRenderers.push(...(p.propertyRenderers ?? []));
  }

  return {
    plugins,
    commands,
    blocks,
    inlineContent,
    slashMenuItems,
    sidebarPanels,
    settingsPages,
    propertyRenderers,
  };
}

export const emptyRegistry: PluginRegistry = buildRegistry([]);
