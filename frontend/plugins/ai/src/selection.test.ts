import { describe, expect, it } from 'vitest';
import { applyAiPreview } from './apply';
import { blockText, selectBlocks } from './selection';
import type { AiBlock, AiPreview } from './types';

const document: AiBlock[] = [
  { id: 'b-2', type: 'future-block', props: { text: 'Second', vendor: { keep: true } }, children: [] },
  { id: 'b-1', type: 'paragraph', content: [{ type: 'text', text: 'First', styles: { bold: true } }] },
];

describe('AI block selection and apply boundary', () => {
  it('selects in document order and keeps unknown fields', () => {
    const selected = selectBlocks(document, ['b-1', 'b-2']);
    expect(selected.map((block) => block.id)).toEqual(['b-2', 'b-1']);
    expect(selected[0]).toEqual(document[0]!);
    expect(selected[0]).not.toBe(document[0]!);
    expect(blockText(selected[1]!)).toBe('First');
  });

  it('rejects duplicate or missing selection ids', () => {
    expect(() => selectBlocks(document, ['b-1', 'b-1'])).toThrow('only once');
    expect(() => selectBlocks(document, ['missing'])).toThrow('not found');
  });

  it('applies only changed snapshots without losing unknown JSON', () => {
    const original = document[0]!;
    const proposed = { ...original, props: { ...original.props, text: 'Changed' } };
    const preview: AiPreview = {
      action: 'rewrite',
      provider: 'mock',
      model: null,
      changes: [{ blockId: 'b-2', originalBlock: original, proposedBlock: proposed, changed: true, preservesUnknownFields: true }],
      propertySuggestions: [],
      warnings: [],
    };
    const applied: AiBlock[] = [];
    applyAiPreview(preview, { updateBlock: (_id, block) => applied.push(block) });
    const firstApplied = applied[0];
    expect(firstApplied).toBeDefined();
    expect(firstApplied!.props?.vendor).toEqual({ keep: true });
    expect(firstApplied).not.toBe(proposed);
  });
});
