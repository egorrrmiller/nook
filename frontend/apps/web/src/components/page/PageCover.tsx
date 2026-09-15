import { useEffect, useState } from 'react';
import type { NodeCover } from '@nook/api-client';
import { Button } from '@nook/ui';
import { CoverPicker } from '../pickers';

/** `NodeCover` → image URL (contracts §8: upload → `/api/files/{id}`, gallery → `/api/covers`). */
export function coverUrl(cover: NodeCover, gallery: Record<string, string> = {}): string {
  if (cover.type === 'upload') return `/api/files/${cover.value}`;
  if (cover.type === 'gallery') return gallery[cover.value] ?? `/covers/${cover.value}`;
  return cover.value;
}

/**
 * Notion-style page cover: fixed-height banner with a vertical focus point (`cover.position`,
 * 0..1). Repositioning is done by dragging; the picker (frontend-shell) owns gallery/upload/url.
 */
export function PageCover({
  cover,
  nodeId,
  readOnly,
  onChange,
}: {
  cover: NodeCover;
  nodeId: string;
  readOnly?: boolean;
  onChange: (cover: NodeCover | null) => void;
}) {
  const [position, setPosition] = useState(cover.position ?? 0.5);
  const [dragging, setDragging] = useState<{ startY: number; startPos: number } | null>(null);

  useEffect(() => setPosition(cover.position ?? 0.5), [cover.position, cover.value]);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const delta = (e.clientY - dragging.startY) / 320;
      setPosition(Math.min(1, Math.max(0, dragging.startPos - delta)));
    };
    const up = () => {
      setDragging(null);
      setPosition((p) => {
        onChange({ ...cover, position: Math.round(p * 100) / 100 });
        return p;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging, cover, onChange]);

  return (
    <div className="nook-page__cover" data-testid="page-cover" data-dragging={dragging ? '' : undefined}>
      <img
        src={coverUrl(cover)}
        alt=""
        style={{ objectPosition: `center ${Math.round(position * 100)}%` }}
        onPointerDown={(e) => {
          if (readOnly) return;
          e.preventDefault();
          setDragging({ startY: e.clientY, startPos: position });
        }}
      />
      {!readOnly ? (
        <div className="nook-page__cover-actions">
          <CoverPicker value={cover} nodeId={nodeId} onChange={onChange}>
            <Button type="button" variant="secondary" size="sm" data-testid="change-cover">
              Change cover
            </Button>
          </CoverPicker>
          <span className="nook-page__cover-hint">Drag to reposition</span>
          <Button type="button" variant="secondary" size="sm" data-testid="remove-cover" onClick={() => onChange(null)}>
            Remove
          </Button>
        </div>
      ) : null}
    </div>
  );
}
