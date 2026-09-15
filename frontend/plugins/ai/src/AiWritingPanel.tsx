import { useMemo, useState } from 'react';
import { applyAiPreview, type AiApplyAdapter } from './apply';
import { useAiApi } from './AiPluginProvider';
import { blockText, selectBlocks } from './selection';
import type { AiAction, AiBlock, AiPreview, AiPropertyDefinition } from './types';

export interface AiWritingPanelProps {
  workspaceId: string;
  nodeId: string;
  document: AiBlock[];
  selectedBlockIds: string[];
  propertyDefinitions?: AiPropertyDefinition[];
  applyAdapter?: AiApplyAdapter;
  onApplied?: (preview: AiPreview) => void;
}

const ACTIONS: { value: AiAction; label: string }[] = [
  { value: 'continue', label: 'Continue' },
  { value: 'rewrite', label: 'Rewrite' },
  { value: 'shorten', label: 'Shorten' },
  { value: 'translate', label: 'Translate' },
  { value: 'custom-prompt', label: 'Custom prompt' },
  { value: 'autofill-properties', label: 'Autofill properties' },
];

export function AiWritingPanel({
  workspaceId,
  nodeId,
  document,
  selectedBlockIds,
  propertyDefinitions = [],
  applyAdapter,
  onApplied,
}: AiWritingPanelProps) {
  const api = useAiApi();
  const [action, setAction] = useState<AiAction>('rewrite');
  const [targetLanguage, setTargetLanguage] = useState('English');
  const [prompt, setPrompt] = useState('');
  const [preview, setPreview] = useState<AiPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = useMemo(() => selectBlocks(document, selectedBlockIds), [document, selectedBlockIds]);

  const makePreview = async () => {
    setBusy(true);
    setError(null);
    try {
      setPreview(
        await api.preview({
          workspaceId,
          nodeId,
          action,
          blocks: selected,
          targetLanguage: action === 'translate' ? targetLanguage : undefined,
          prompt: action === 'custom-prompt' ? prompt : undefined,
          properties: action === 'autofill-properties' ? propertyDefinitions : undefined,
        }),
      );
    } catch (cause) {
      setPreview(null);
      setError(cause instanceof Error ? cause.message : 'AI preview failed.');
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!preview || !applyAdapter) return;
    applyAiPreview(preview, applyAdapter);
    onApplied?.(preview);
  };

  return (
    <section aria-label="AI writing" data-testid="ai-writing-panel">
      <label>
        Action
        <select value={action} onChange={(event) => setAction(event.target.value as AiAction)}>
          {ACTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      {action === 'translate' ? (
        <label>
          Target language
          <input value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)} />
        </label>
      ) : null}
      {action === 'custom-prompt' ? (
        <label>
          Instruction
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={4000} />
        </label>
      ) : null}
      <p>{selected.length} selected block{selected.length === 1 ? '' : 's'}</p>
      <button type="button" onClick={() => void makePreview()} disabled={busy || selected.length === 0}>
        {busy ? 'Generating…' : 'Preview'}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {preview ? (
        <div data-testid="ai-preview">
          {preview.changes.map((change) => (
            <article key={change.blockId}>
              <small>{change.blockId}</small>
              <p>{blockText(change.originalBlock)} → {blockText(change.proposedBlock)}</p>
            </article>
          ))}
          {preview.warnings.map((warning) => <p key={warning} role="status">{warning}</p>)}
          <button type="button" onClick={apply} disabled={!applyAdapter}>Apply</button>
        </div>
      ) : null}
    </section>
  );
}
