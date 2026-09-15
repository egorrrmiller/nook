export type AiAction = 'continue' | 'rewrite' | 'shorten' | 'translate' | 'custom-prompt' | 'autofill-properties';

/** Deliberately open JSON shape: this package must not erase blocks added by another plugin. */
export interface AiBlock {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: AiBlock[];
  [key: string]: unknown;
}

export interface AiPropertyDefinition {
  name: string;
  type: string;
}

export interface AiPreviewRequest {
  workspaceId: string;
  nodeId: string;
  action: AiAction;
  blocks: AiBlock[];
  targetLanguage?: string;
  prompt?: string;
  properties?: AiPropertyDefinition[];
}

export interface AiSettings {
  provider: string | null;
  model: string | null;
  endpoint: string | null;
  apiKeyConfigured: boolean;
}

export interface AiSettingsUpdate {
  provider?: string | null;
  model?: string | null;
  endpoint?: string | null;
  /** Sent only to the secret-store boundary; never persisted in this package's state. */
  apiKey?: string;
  clearApiKey?: boolean;
}

export interface AiBlockChange {
  blockId: string;
  originalBlock: AiBlock;
  proposedBlock: AiBlock;
  changed: boolean;
  preservesUnknownFields: boolean;
}

export interface AiPropertySuggestion {
  name: string;
  type: string;
  value: unknown;
  isFormula: boolean;
  warning?: string | null;
}

export interface AiPreview {
  action: AiAction;
  provider: string;
  model: string | null;
  changes: AiBlockChange[];
  propertySuggestions: AiPropertySuggestion[];
  warnings: string[];
}
