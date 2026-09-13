import type { BlockSpec, InlineContentSpec, InlineContentConfig, BlockNoteEditor } from '@blocknote/core';
import type { ComponentType, ReactNode } from 'react';

/** Editor instance handed to slash-menu items. Schema is plugin-defined, hence `any`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyBlockNoteEditor = BlockNoteEditor<any, any, any>;

export interface PluginCommandContext {
  /** Active workspace (null before bootstrap). */
  workspaceId: string | null;
  /** Current node when the palette is opened from a page. */
  nodeId: string | null;
  navigate: (to: string) => void;
  toast: (message: string) => void;
  /** Editor mounted on the current page, if any. */
  editor: AnyBlockNoteEditor | null;
}

export interface PluginCommand {
  id: string;
  /** Shown in the command palette, e.g. "Sample: say hi". */
  title: string;
  keywords?: string[];
  icon?: ComponentType<{ className?: string }>;
  /** Display-only hint like "⌘⇧S". */
  shortcut?: string;
  run: (ctx: PluginCommandContext) => void | Promise<void>;
  /** Hide the command from the palette when it makes no sense in the current context. */
  isAvailable?: (ctx: PluginCommandContext) => boolean;
}

export interface PluginSlashMenuItem {
  title: string;
  subtext?: string;
  aliases?: string[];
  group?: string;
  icon?: ReactNode;
  onItemClick: (editor: AnyBlockNoteEditor) => void;
}

export interface PluginSidebarPanel {
  id: string;
  title: string;
  icon?: ComponentType<{ className?: string }>;
  component: ComponentType<{ workspaceId: string }>;
}

export interface PluginSettingsPage {
  id: string;
  title: string;
  component: ComponentType;
}

export interface PropertyRendererProps<V = unknown> {
  value: V;
  onChange?: (value: V) => void;
  readOnly?: boolean;
}

export interface PluginPropertyRenderer<V = unknown> {
  /** Collection property type this renderer handles. */
  type: string;
  display: ComponentType<PropertyRendererProps<V>>;
  edit?: ComponentType<PropertyRendererProps<V>>;
}

// BlockNote spec maps are keyed by block type name.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PluginBlockSpecs = Record<string, BlockSpec<any, any, any>>;
export type PluginInlineContentSpecs = Record<string, InlineContentSpec<InlineContentConfig>>;

export interface NookPlugin {
  /** Stable, namespaced id, e.g. "nook.sample". */
  id: string;
  name: string;
  version?: string;
  blocks?: PluginBlockSpecs;
  inlineContent?: PluginInlineContentSpecs;
  slashMenuItems?: PluginSlashMenuItem[];
  commands?: PluginCommand[];
  sidebarPanels?: PluginSidebarPanel[];
  settingsPages?: PluginSettingsPage[];
  propertyRenderers?: PluginPropertyRenderer[];
}

/** Namespaced ids as exposed by the registry (`<pluginId>:<localId>`). */
export interface RegisteredCommand extends PluginCommand {
  pluginId: string;
}
export interface RegisteredSidebarPanel extends PluginSidebarPanel {
  pluginId: string;
}
export interface RegisteredSettingsPage extends PluginSettingsPage {
  pluginId: string;
}
