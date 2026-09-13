import { useEffect, useMemo, useRef, useState } from 'react';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation } from 'd3-force';
import { nodeRadius, type SimGraph, type SimLink, type SimNode } from '../lib/graph-transform';

export interface Viewport {
  scale: number;
  x: number;
  y: number;
}

export interface ForceGraph {
  nodes: SimNode[];
  links: SimLink[];
  /** Bumped on every simulation tick so the canvas redraws. */
  tick: number;
  reheat: () => void;
}

/**
 * Runs a d3-force layout (BSD-3) over the transformed graph. The simulation mutates `nodes`
 * in place; the canvas reads them on each `tick`. Re-created whenever the graph identity changes.
 */
export function useForceGraph(graph: SimGraph, width: number, height: number): ForceGraph {
  const [tick, setTick] = useState(0);
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  // Keep the same node objects across re-renders of the same data so positions survive.
  const data = useMemo(() => ({ nodes: graph.nodes, links: graph.links }), [graph]);

  useEffect(() => {
    if (!data.nodes.length) {
      setTick((t) => t + 1);
      return;
    }
    const sim = forceSimulation<SimNode>(data.nodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(data.links)
          .id((d) => d.id)
          .distance((l) => (l.kind === 'parent' ? 60 : l.kind === 'tag' ? 40 : 80))
          .strength((l) => (l.kind === 'tag' ? 0.15 : 0.35)),
      )
      .force('charge', forceManyBody<SimNode>().strength((d) => (d.kind === 'tag' ? -60 : -220)))
      .force('collide', forceCollide<SimNode>((d) => nodeRadius(d) + 6))
      .force('center', forceCenter(width / 2, height / 2))
      .force('x', forceX(width / 2).strength(0.03))
      .force('y', forceY(height / 2).strength(0.03))
      .alpha(0.9)
      .alphaDecay(0.035);
    sim.on('tick', () => setTick((t) => t + 1));
    simRef.current = sim;
    return () => {
      sim.on('tick', null);
      sim.stop();
      simRef.current = null;
    };
  }, [data, width, height]);

  return {
    nodes: data.nodes,
    links: data.links,
    tick,
    reheat: () => simRef.current?.alpha(0.6).restart(),
  };
}
