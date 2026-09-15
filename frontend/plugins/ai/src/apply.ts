import { cloneBlock } from './selection';
import type { AiBlock, AiPreview, AiPropertySuggestion } from './types';

export interface AiApplyAdapter {
  /** The host editor applies the complete snapshot in its own collaboration transaction. */
  updateBlock: (blockId: string, block: AiBlock) => void;
  updateProperties?: (suggestions: AiPropertySuggestion[]) => void;
}

export interface AiApplyResult {
  blocksApplied: number;
  propertiesApplied: number;
}

/** Applies only accepted preview changes; cloning prevents an editor adapter from mutating preview state. */
export function applyAiPreview(preview: AiPreview, adapter: AiApplyAdapter): AiApplyResult {
  let blocksApplied = 0;
  for (const change of preview.changes) {
    if (!change.changed) continue;
    adapter.updateBlock(change.blockId, cloneBlock(change.proposedBlock));
    blocksApplied += 1;
  }

  const suggestions = preview.propertySuggestions.filter((suggestion) => !suggestion.isFormula);
  if (suggestions.length && adapter.updateProperties) adapter.updateProperties(suggestions);
  return { blocksApplied, propertiesApplied: adapter.updateProperties ? suggestions.length : 0 };
}
