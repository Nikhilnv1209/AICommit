// @ts-nocheck
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
} from "d3-force";

const NODE_REL_SIZE = 6;
const getNodeRadius = (degree: number) => Math.sqrt(Math.max(1, degree + 1)) * NODE_REL_SIZE;

/**
 * Pre-compute a stable, compact layout so the graph doesn't jitter on mount.
 *
 * Notes:
 * - forceCenter alone only recenters the mean; it doesn't pull outliers in.
 *   The weak x/y forces are what keep the graph compact.
 * - The collision radius is larger than the visual node radius so labels have
 *   some breathing room.
 */
export function precalculateLayout(
  nodes: { id: string; degree: number }[],
  links: { source: string; target: string }[],
  ticks = 400
): { positions: Map<string, { x: number; y: number }> } {
  if (nodes.length === 0) return { positions: new Map() };

  // Clone so we don't mutate the original data
  const simNodes = nodes.map((n) => ({
    id: n.id,
    degree: n.degree,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
  }));
  const simLinks = links.map((l) => ({ source: l.source, target: l.target }));

  const simulation: any = forceSimulation(simNodes)
    .force("charge", forceManyBody().strength(-400))
    .force(
      "link",
      forceLink(simLinks)
        .id((d: any) => d.id)
        .distance(100)
        .strength(0.3)
    )
    .force("center", forceCenter(0, 0))
    .force("x", forceX(0).strength(0.08))
    .force("y", forceY(0).strength(0.08))
    .force(
      "collide",
      forceCollide().radius((d: any) => getNodeRadius(d.degree || 0) + 40)
    )
    .stop();

  for (let i = 0; i < ticks; i++) simulation.tick();

  const positions = new Map<string, { x: number; y: number }>();
  for (const n of simNodes) positions.set(n.id, { x: n.x, y: n.y });

  return { positions };
}
