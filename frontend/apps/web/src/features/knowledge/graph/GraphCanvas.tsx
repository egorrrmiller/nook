import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconButton } from '@nook/ui';
import { nodeRadius, type SimLink, type SimNode } from '../lib/graph-transform';
import { useForceGraph, type Viewport } from './useForceGraph';

export interface GraphCanvasProps {
  nodes: SimNode[];
  links: SimLink[];
  highlighted: Set<string>;
  onOpen: (node: SimNode) => void;
  /** Emphasised node (the page the graph is focused on). */
  rootId?: string | null;
}

interface Palette {
  bg: string;
  edge: string;
  edgeParent: string;
  node: string;
  nodeDim: string;
  tag: string;
  root: string;
  highlight: string;
  label: string;
}

function readPalette(el: HTMLElement): Palette {
  const s = getComputedStyle(el);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    bg: v('--background', '#fff'),
    edge: v('--border-strong', 'rgba(0,0,0,.2)'),
    edgeParent: v('--border', 'rgba(0,0,0,.1)'),
    node: v('--foreground-secondary', '#787774'),
    nodeDim: v('--foreground-tertiary', '#9b9a97'),
    tag: v('--primary', '#2383e2'),
    root: v('--primary', '#2383e2'),
    highlight: v('--primary', '#2383e2'),
    label: v('--foreground', '#37352f'),
  };
}

const end = (e: string | SimNode): SimNode | null => (typeof e === 'string' ? null : e);

/**
 * Canvas renderer for the force graph: zoom (wheel / buttons), pan (drag), hover label,
 * click-to-open. Canvas (not SVG) so a few thousand nodes stay smooth.
 */
export function GraphCanvas({ nodes, links, highlighted, onOpen, rootId }: GraphCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<Viewport>({ scale: 1, x: 0, y: 0 });
  const [hover, setHover] = useState<SimNode | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const graph = useMemo(() => ({ nodes, links }), [nodes, links]);
  const sim = useForceGraph(graph, size.w, size.h);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => setSize({ w: Math.max(320, el.clientWidth), h: Math.max(240, el.clientHeight) });
    apply();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: (clientX - rect.left - view.x) / view.scale, y: (clientY - rect.top - view.y) / view.scale };
    },
    [view],
  );

  const nodeAt = useCallback(
    (clientX: number, clientY: number): SimNode | null => {
      const { x, y } = toWorld(clientX, clientY);
      let best: SimNode | null = null;
      let bestD = Infinity;
      for (const n of sim.nodes) {
        if (n.x === undefined || n.y === undefined) continue;
        const r = nodeRadius(n) + 4;
        const d = (n.x - x) ** 2 + (n.y - y) ** 2;
        if (d <= r * r && d < bestD) {
          best = n;
          bestD = d;
        }
      }
      return best;
    },
    [sim.nodes, toWorld],
  );

  // Draw on every tick / view change.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    if (canvas.width !== size.w * dpr || canvas.height !== size.h * dpr) {
      canvas.width = size.w * dpr;
      canvas.height = size.h * dpr;
    }
    const p = readPalette(wrap);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);

    const dim = highlighted.size > 0;
    ctx.lineWidth = 1 / view.scale;
    for (const l of sim.links) {
      const s = end(l.source);
      const t = end(l.target);
      if (!s || !t || s.x === undefined || t.x === undefined) continue;
      const lit = dim && (highlighted.has(s.id) || highlighted.has(t.id));
      ctx.globalAlpha = dim ? (lit ? 0.9 : 0.12) : l.kind === 'parent' ? 0.35 : 0.55;
      ctx.strokeStyle = lit ? p.highlight : l.kind === 'parent' ? p.edgeParent : p.edge;
      if (l.kind === 'parent') ctx.setLineDash([3 / view.scale, 3 / view.scale]);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y!);
      ctx.lineTo(t.x, t.y!);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (const n of sim.nodes) {
      if (n.x === undefined || n.y === undefined) continue;
      const lit = highlighted.has(n.id);
      ctx.globalAlpha = dim ? (lit ? 1 : 0.25) : 1;
      const r = nodeRadius(n);
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = lit ? p.highlight : n.id === rootId ? p.root : n.kind === 'tag' ? p.tag : p.node;
      ctx.fill();
      if (n.id === rootId || hover?.id === n.id) {
        ctx.lineWidth = 2 / view.scale;
        ctx.strokeStyle = p.highlight;
        ctx.stroke();
      }
      // Labels only when zoomed in enough or for big / lit nodes — keeps the canvas readable.
      if (view.scale > 0.75 || lit || n.degree > 3 || hover?.id === n.id) {
        ctx.globalAlpha = dim && !lit ? 0.3 : 1;
        ctx.fillStyle = p.label;
        ctx.font = `${n.kind === 'tag' ? 9 : 11}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const label = n.kind === 'tag' ? `#${n.title}` : n.title || 'Untitled';
        ctx.fillText(label.length > 28 ? `${label.slice(0, 27)}…` : label, n.x, n.y + r + 3);
      }
    }
    ctx.restore();
  }, [sim.tick, sim.nodes, sim.links, size, view, highlighted, hover, rootId]);

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        data-testid="graph-canvas"
        aria-label={`Link graph with ${sim.nodes.length} nodes`}
        role="img"
        style={{ width: size.w, height: size.h, cursor: hover ? 'pointer' : drag.current ? 'grabbing' : 'grab' }}
        onPointerDown={(e) => {
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) {
            const dx = e.clientX - d.x;
            const dy = e.clientY - d.y;
            if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
            setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
            return;
          }
          setHover(nodeAt(e.clientX, e.clientY));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) {
            const n = nodeAt(e.clientX, e.clientY);
            if (n && n.kind !== 'tag') onOpen(n);
          }
        }}
        onPointerLeave={() => {
          drag.current = null;
          setHover(null);
        }}
        onWheel={(e) => {
          const factor = Math.exp(-e.deltaY * 0.0015);
          setView((v) => {
            const scale = Math.min(4, Math.max(0.2, v.scale * factor));
            const rect = canvasRef.current!.getBoundingClientRect();
            const cx = e.clientX - rect.left;
            const cy = e.clientY - rect.top;
            return { scale, x: cx - ((cx - v.x) / v.scale) * scale, y: cy - ((cy - v.y) / v.scale) * scale };
          });
        }}
      />
      {hover ? (
        <div
          data-testid="graph-hover-label"
          className="pointer-events-none absolute z-10 max-w-56 truncate rounded-sm bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md"
          style={{ left: Math.min(size.w - 180, (hover.x ?? 0) * view.scale + view.x + 10), top: (hover.y ?? 0) * view.scale + view.y - 28 }}
        >
          {hover.kind === 'tag' ? `#${hover.title}` : hover.title || 'Untitled'}
          <span className="ml-1 font-normal opacity-70">· {hover.degree} links</span>
        </div>
      ) : null}
      <div className="absolute right-2 bottom-2 flex flex-col gap-1">
        {(
          [
            ['+', 'Zoom in', 1.3],
            ['−', 'Zoom out', 1 / 1.3],
          ] as const
        ).map(([glyph, label, f]) => (
          <IconButton
            key={label}
            label={label}
            size="icon"
            tooltip={false}
            onClick={() =>
              setView((v) => {
                const scale = Math.min(4, Math.max(0.2, v.scale * f));
                const cx = size.w / 2;
                const cy = size.h / 2;
                return { scale, x: cx - ((cx - v.x) / v.scale) * scale, y: cy - ((cy - v.y) / v.scale) * scale };
              })
            }
            className="border-border bg-popover text-sm text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
          >
            {glyph}
          </IconButton>
        ))}
        <IconButton
          label="Reset view"
          size="icon"
          tooltip={false}
          onClick={() => {
            setView({ scale: 1, x: 0, y: 0 });
            sim.reheat();
          }}
          className="border-border bg-popover text-[10px] font-medium text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
        >
          1:1
        </IconButton>
      </div>
    </div>
  );
}
