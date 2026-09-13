import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { QuickHit } from '@nook/api-client';
import { useEditorHost } from '../host-context';
import { NodeIcon } from './NodeIcon';
import { nodeTitle } from '../util/nodeCache';

/**
 * Inline quick-find list (contracts §7.4) used by empty page-link / page-embed blocks. Debounced;
 * arrow keys + Enter select, Escape calls `onCancel`.
 */
export function PagePicker({
  placeholder = 'Search pages…',
  onPick,
  onCancel,
  autoFocus = true,
}: {
  placeholder?: string;
  onPick: (hit: QuickHit) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const { api } = useEditorHost();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<QuickHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      api.search
        .quick({ q, limit: 10 })
        .then((r) => {
          if (seq.current !== id) return;
          setHits(r);
          setActive(0);
        })
        .catch(() => {
          if (seq.current === id) setHits([]);
        })
        .finally(() => {
          if (seq.current === id) setLoading(false);
        });
    }, 150);
    return () => clearTimeout(t);
  }, [api, q]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = hits[active];
      if (hit) onPick(hit);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel?.();
    }
  };

  return (
    <div className="nook-page-picker" contentEditable={false} data-testid="page-picker">
      <input
        className="nook-page-picker__input"
        autoFocus={autoFocus}
        value={q}
        placeholder={placeholder}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        aria-label={placeholder}
      />
      <ul className="nook-page-picker__list" role="listbox">
        {hits.map((h, i) => (
          <li
            key={h.node.id}
            role="option"
            aria-selected={i === active}
            className="nook-page-picker__item"
            data-active={i === active || undefined}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(h)}
          >
            <NodeIcon icon={h.node.icon} kind={h.node.kind} />
            <span className="nook-page-picker__title">{nodeTitle(h.node)}</span>
            {h.breadcrumb.length ? (
              <span className="nook-page-picker__crumb">{h.breadcrumb.map((b) => nodeTitle(b)).join(' / ')}</span>
            ) : null}
          </li>
        ))}
        {!loading && hits.length === 0 ? <li className="nook-page-picker__empty">No pages found</li> : null}
      </ul>
    </div>
  );
}
