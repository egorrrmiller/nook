import { usePluginRegistry } from './PluginProvider';

export function usePlugins() {
  return usePluginRegistry().plugins;
}
export function usePluginCommands() {
  return usePluginRegistry().commands;
}
export function usePluginBlocks() {
  return usePluginRegistry().blocks;
}
export function usePluginInlineContent() {
  return usePluginRegistry().inlineContent;
}
export function usePluginSlashMenuItems() {
  return usePluginRegistry().slashMenuItems;
}
export function usePluginSidebarPanels() {
  return usePluginRegistry().sidebarPanels;
}
export function usePluginSettingsPages() {
  return usePluginRegistry().settingsPages;
}
export function usePluginPropertyRenderers() {
  return usePluginRegistry().propertyRenderers;
}
