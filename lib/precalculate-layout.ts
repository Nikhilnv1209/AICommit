// @ts-nocheck
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide } from "d3-force";

const NODE_REL_SIZE = 6;
const getNodeRadius = (degree: number) => Math.sqrt(Math.max(1, degree + 1)) * NODE_REL_SIZE;

export type ViewTransform = {
  cx: number;
  cy: number;
  zoom: number;
};

export function precalculateLayout(
  nodes: { id: string; degree: number }[],
  links: { source: string; target: string }[],
  ticks = 150
): { positions: Map<string, { x: number; y: number }>; view: ViewTransform | null } {
  if (nodes.length === 0) return { positions: new Map(), view: null };

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
    .force("charge", forceManyBody().strength(-800))
    .force(
      "link",
      forceLink(simLinks)
        .id((d: any) => d.id)
        .distance(120)
        .strength(0.3)
    )
    .force("center", forceCenter(0, 0).strength(0))
    .force(
      "collide",
      forceCollide().radius((d: any) => getNodeRadius(d.degree || 0) + 18)
    )
    .stop();

  for (let i = 0; i < ticks; i++) simulation.tick();

  const positions = new Map<string, { x: number; y: number }>();
  for (const n of simNodes) positions.set(n.id, { x: n.x, y: n.y });

  // Find the densest cluster from the pre-calculated positions
  const pts = simNodes.filter((n) => n.x != null && n.y != null);
  if (pts.length === 0) return { positions, view: null };

  // Average pairwise distance (sampled)
  const sample = pts.slice(0, Math.min(pts.length, 80));
  const dists: number[] = [];
  for (let i = 0; i < sample.length; i++) {
    for (let j = i + 1; j < sample.length; j++) {
      dists.push(Math.hypot(sample[i].x - sample[j].x, sample[i].y - sample[j].y));
    }
  }
  const avgDist = dists.length > 0 ? dists.reduce((a, b) => a + b, 0) / dists.length : 100;

  // Node with the most neighbors within avgDist = crowd center
  let best = pts[0];
  let bestCount = 0;
  for (const p of pts) {
    let count = 0;
    for (const q of pts) {
      if (Math.hypot(p.x - q.x, p.y - q.y) < avgDist) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = p;
    }
  }

  const cluster = pts.filter((n) => Math.hypot(n.x - best.x, n.y - best.y) < avgDist);
  const cx = cluster.reduce((s, n) => s + n.x, 0) / cluster.length;
  const cy = cluster.reduce((s, n) => s + n.y, 0) / cluster.length;

  const minX = Math.min(...cluster.map((n) => n.x));
  const maxX = Math.max(...cluster.map((n) => n.x));
  const minY = Math.min(...cluster.map((n) => n.y));
  const maxY = Math.max(...cluster.map((n) => n.y));
  const clusterW = Math.max(maxX - minX, 50);
  const clusterH = Math.max(maxY - minY, 50);

  return {
    positions,
    view: { cx, cy, zoom: 0 }, // zoom calculated in component where we have dimensions
  };
}
