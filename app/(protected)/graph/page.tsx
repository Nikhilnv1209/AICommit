"use client";

import { getGraphData } from "@/app/actions";
import useProject from "@/hooks/use-project";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  FileCode, GitFork, Phone, Search, X, Loader2, Network,
} from "lucide-react";
import type { GraphType, GraphNode, GraphLink } from "@/lib/graph-extraction";
import { precalculateLayout } from "@/lib/precalculate-layout";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  ),
});

const LANGUAGE_COLORS: Record<string, string> = {
  typescript: "#3178c6",
  javascript: "#f7df1e",
  python: "#3776ab",
  kotlin: "#7f52ff",
  java: "#ed8b00",
  go: "#00add8",
  rust: "#dea584",
  ruby: "#cc342d",
  php: "#777bb4",
  swift: "#f05138",
  cpp: "#00599c",
  csharp: "#239120",
  scala: "#dc322f",
  dart: "#0175c2",
  lua: "#000080",
  r: "#276dc3",
  shell: "#89e051",
  unknown: "#888888",
};

const GRAPH_TYPES: { id: GraphType; label: string; icon: typeof FileCode }[] = [
  { id: "files", label: "File Dependencies", icon: FileCode },
  { id: "calls", label: "Call Graph", icon: Phone },
  { id: "classes", label: "Class Hierarchy", icon: GitFork },
];

const NODE_REL_SIZE = 6;
const getNodeRadius = (degree: number) => Math.sqrt(Math.max(1, degree + 1)) * NODE_REL_SIZE;

const GraphPage = () => {
  const { projectId } = useProject();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [graphType, setGraphType] = useState<GraphType>("files");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightNodes, setHighlightNodes] = useState<Set<string> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fgRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    setDimensions({ width: el.clientWidth, height: el.clientHeight });
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [mounted]);

  const { data, isLoading } = useQuery({
    queryKey: ["graph-data", projectId, graphType],
    queryFn: async () => {
      if (!projectId) return { success: false, graph: { nodes: [], links: [] } };
      return await getGraphData(projectId, graphType);
    },
    enabled: !!projectId && mounted,
  });

  const graph = useMemo(() => {
    if (!data?.success) return { nodes: [], links: [] };
    return data.graph as { nodes: GraphNode[]; links: GraphLink[] };
  }, [data]);

  // Pre-calculate layout synchronously — no jitter when graph renders
  const layout = useMemo(() => {
    if (graph.nodes.length === 0) return null;
    return precalculateLayout(graph.nodes, graph.links);
  }, [graph]);

  // Apply pre-calculated positions to nodes
  const graphWithPositions = useMemo(() => {
    if (!layout) return graph;
    return {
      nodes: graph.nodes.map((n) => ({
        ...n,
        x: layout.positions.get(n.id)?.x,
        y: layout.positions.get(n.id)?.y,
      })),
      links: graph.links,
    };
  }, [graph, layout]);

  // Apply center/zoom immediately when ForceGraph2D mounts
  useEffect(() => {
    if (!layout) return;
    const apply = () => {
      const fg = fgRef.current;
      if (!fg) {
        setTimeout(apply, 50);
        return;
      }
      // Calculate zoom from cluster bounding box + current dimensions
      const nodes = graph.nodes
        .map((n) => {
          const p = layout.positions.get(n.id);
          return p ? { x: p.x, y: p.y } : null;
        })
        .filter((p): p is { x: number; y: number } => p !== null);
      if (nodes.length === 0) return;

      const sample = nodes.slice(0, Math.min(nodes.length, 80));
      const dists: number[] = [];
      for (let i = 0; i < sample.length; i++) {
        for (let j = i + 1; j < sample.length; j++) {
          dists.push(Math.hypot(sample[i].x - sample[j].x, sample[i].y - sample[j].y));
        }
      }
      const avgDist = dists.length > 0 ? dists.reduce((a, b) => a + b, 0) / dists.length : 100;

      let best = nodes[0];
      let bestCount = 0;
      for (const p of nodes) {
        let count = 0;
        for (const q of nodes) {
          if (Math.hypot(p.x - q.x, p.y - q.y) < avgDist) count++;
        }
        if (count > bestCount) {
          bestCount = count;
          best = p;
        }
      }

      const cluster = nodes.filter((n) => Math.hypot(n.x - best.x, n.y - best.y) < avgDist);
      const cx = cluster.reduce((s, n) => s + n.x, 0) / cluster.length;
      const cy = cluster.reduce((s, n) => s + n.y, 0) / cluster.length;

      const minX = Math.min(...cluster.map((n) => n.x));
      const maxX = Math.max(...cluster.map((n) => n.x));
      const minY = Math.min(...cluster.map((n) => n.y));
      const maxY = Math.max(...cluster.map((n) => n.y));
      const clusterW = Math.max(maxX - minX, 50);
      const clusterH = Math.max(maxY - minY, 50);

      const zoomX = (dimensions.width - 80) / clusterW;
      const zoomY = (dimensions.height - 80) / clusterH;
      const zoomLevel = Math.max(0.1, Math.min(zoomX, zoomY));

      fg.centerAt(cx, cy, 0);
      fg.zoom(zoomLevel, 0);
    };
    apply();
  }, [layout, dimensions, graph]);

  const adjacencyMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const link of graph.links) {
      const source = typeof link.source === "string" ? link.source : (link.source as any).id;
      const target = typeof link.target === "string" ? link.target : (link.target as any).id;
      if (!map.has(source)) map.set(source, new Set());
      if (!map.has(target)) map.set(target, new Set());
      map.get(source)!.add(target);
      map.get(target)!.add(source);
    }
    return map;
  }, [graph]);

  const presentLanguages = useMemo(() => {
    const langs = new Set<string>();
    for (const node of graph.nodes) langs.add(node.group);
    return Object.entries(LANGUAGE_COLORS).filter(([lang]) => langs.has(lang));
  }, [graph.nodes]);

  const hasImplementsLinks = useMemo(
    () => graph.links.some(l => l.type === "implements"),
    [graph.links]
  );

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) { setHighlightNodes(null); return; }
    const lower = query.toLowerCase();
    const matches = new Set<string>();
    for (const node of graph.nodes) {
      if (node.label.toLowerCase().includes(lower) || node.id.toLowerCase().includes(lower)) {
        matches.add(node.id);
        adjacencyMap.get(node.id)?.forEach(n => matches.add(n));
      }
    }
    setHighlightNodes(matches);
  };

  // Refs for stable canvas callbacks (avoids re-rendering the force graph)
  const highlightNodesRef = useRef<Set<string> | null>(null);
  const selectedNodeRef = useRef<GraphNode | null>(null);
  const themeRef = useRef<string | undefined>(undefined);

  useEffect(() => { highlightNodesRef.current = highlightNodes; }, [highlightNodes]);
  useEffect(() => { selectedNodeRef.current = selectedNode; }, [selectedNode]);
  useEffect(() => { themeRef.current = resolvedTheme; }, [resolvedTheme]);

  const nodeColorFn = useCallback((node: any) => {
    const color = LANGUAGE_COLORS[node.group] || LANGUAGE_COLORS.unknown;
    const hn = highlightNodesRef.current;
    const isHighlighted = !hn || hn.has(node.id);
    return isHighlighted ? color : color + "33";
  }, []);

  const nodeCanvasObject = useCallback((node: any, ctx: any, globalScale: number) => {
    const nodeRadius = getNodeRadius(node.degree || 0);
    const hn = highlightNodesRef.current;
    const isHighlighted = !hn || hn.has(node.id);

    // Selected node border
    const sn = selectedNodeRef.current;
    if (sn?.id === node.id) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = themeRef.current === "dark" ? "#fff" : "#000";
      ctx.lineWidth = 3 / globalScale;
      ctx.beginPath();
      ctx.arc(node.x, node.y, nodeRadius + 2, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // Draw label with background pill for readability
    if (!node.label) return;

    ctx.globalAlpha = isHighlighted ? 1 : 0.5;
    const fontSize = Math.max(9, 13 / globalScale);
    ctx.font = `${fontSize}px ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const isDark = themeRef.current === "dark";
    const label = node.label.length > 22 ? node.label.slice(0, 20) + "…" : node.label;
    const labelY = node.y + nodeRadius + fontSize;
    const textWidth = ctx.measureText(label).width;
    const padX = 4 / globalScale;
    const padY = 2 / globalScale;

    ctx.fillStyle = isDark ? "rgba(10,10,11,0.9)" : "rgba(255,255,255,0.9)";
    ctx.fillRect(
      node.x - textWidth / 2 - padX,
      labelY - fontSize / 2 - padY,
      textWidth + padX * 2,
      fontSize + padY * 2
    );

    ctx.fillStyle = isDark ? "#e5e5e5" : "#1a1a1a";
    ctx.fillText(label, node.x, labelY);

    ctx.globalAlpha = 1;
  }, []);

  // Shadow canvas hit area for node dragging
  const nodePointerAreaPaint = useCallback((node: any, color: string, ctx: any) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(node.x, node.y, getNodeRadius(node.degree || 0) + 10, 0, 2 * Math.PI);
    ctx.fill();
  }, []);

  const linkCanvasObject = useCallback((link: any, ctx: any, globalScale: number) => {
    const source = typeof link.source === "object" ? link.source : { x: 0, y: 0 };
    const target = typeof link.target === "object" ? link.target : { x: 0, y: 0 };
    const hn = highlightNodesRef.current;
    const isHighlighted = !hn || (hn.has(source.id) && hn.has(target.id));

    ctx.globalAlpha = isHighlighted ? 0.6 : 0.05;
    ctx.strokeStyle = themeRef.current === "dark" ? "#555" : "#aaa";
    ctx.lineWidth = 1 / globalScale;

    if (link.type === "implements") ctx.setLineDash([4 / globalScale, 4 / globalScale]);

    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }, []);

  // Manual click detection — library's shadow canvas is unreliable (800ms throttle,
  // doesn't repaint for all nodes). We attach a click listener to the canvas and do
  // coordinate-based hit detection using the d3-zoom transform.
  useEffect(() => {
    if (graphWithPositions.nodes.length === 0) return;

    let cleanup: (() => void) | null = null;
    let cancelled = false;
    let retries = 0;

    const findCanvas = () => {
      if (cancelled) return;
      const canvas = containerRef.current?.querySelector("canvas");
      if (!canvas) {
        if (retries++ < 60) requestAnimationFrame(findCanvas);
        return;
      }

      const handleClick = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const transform = (canvas as any).__zoom || { x: 0, y: 0, k: 1 };
        const graphX = (e.clientX - rect.left - transform.x) / transform.k;
        const graphY = (e.clientY - rect.top - transform.y) / transform.k;

        let nearest: GraphNode | null = null;
        let minDist = Infinity;

        for (const node of graphWithPositions.nodes) {
          const n = node as any;
          if (n.x == null || n.y == null) continue;
          const dx = n.x - graphX;
          const dy = n.y - graphY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < getNodeRadius(n.degree || 0) + 15 && dist < minDist) {
            minDist = dist;
            nearest = node;
          }
        }

        setSelectedNode(nearest);
      };

      canvas.addEventListener("click", handleClick);
      cleanup = () => canvas.removeEventListener("click", handleClick);
    };

    requestAnimationFrame(findCanvas);
    return () => { cancelled = true; cleanup?.(); };
  }, [graphWithPositions.nodes]);

  const selectedNodeNeighbors = useMemo(() => {
    if (!selectedNode) return [];
    const neighbors = adjacencyMap.get(selectedNode.id);
    return neighbors ? graph.nodes.filter(n => neighbors.has(n.id)) : [];
  }, [selectedNode, adjacencyMap, graph.nodes]);

  const selectedNodeLinks = useMemo(() => {
    if (!selectedNode) return [];
    return graph.links.filter(l => {
      const s = typeof l.source === "string" ? l.source : (l.source as any).id;
      const t = typeof l.target === "string" ? l.target : (l.target as any).id;
      return s === selectedNode.id || t === selectedNode.id;
    });
  }, [selectedNode, graph.links]);

  if (!mounted) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      {/* Top bar */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-1">
          {GRAPH_TYPES.map((gt) => {
            const Icon = gt.icon;
            return (
              <button
                key={gt.id}
                onClick={() => { setGraphType(gt.id); setSelectedNode(null); setHighlightNodes(null); }}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-[11px] transition-colors ${
                  graphType === gt.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Icon className="size-3.5" />
                {gt.label}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
          <input
            type="text"
            placeholder="search files..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-48 rounded-md border border-border bg-background py-1.5 pl-8 pr-3 font-mono text-[11px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
      </div>

      {/* Graph + side panel */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          ref={containerRef}
          className="relative min-w-0 flex-1 overflow-hidden"
          style={{
            backgroundColor: resolvedTheme === "dark" ? "#0a0a0b" : "#f8f8f8",
            backgroundImage: resolvedTheme === "dark"
              ? "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.04) 1px, transparent 0)"
              : "radial-gradient(circle at 1px 1px, rgba(0,0,0,0.04) 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        >
          {!projectId ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="flex size-12 items-center justify-center rounded-lg border border-border bg-background">
                <Network className="size-5 text-muted-foreground" />
              </div>
              <p className="font-mono text-sm text-muted-foreground">select a project to view its code graph</p>
            </div>
          ) : isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : graph.nodes.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="flex size-12 items-center justify-center rounded-lg border border-border bg-background">
                <Network className="size-5 text-muted-foreground" />
              </div>
              <p className="font-mono text-sm text-muted-foreground">
                {graphType === "classes"
                  ? "no classes found in this codebase"
                  : "no code files found — index the project first"}
              </p>
            </div>
          ) : (
            <>
              <ForceGraph2D
                ref={fgRef}
                graphData={graphWithPositions}
                nodeColor={nodeColorFn}
                nodeVal={(node: any) => Math.max(1, (node.degree || 0) + 1)}
                nodeRelSize={NODE_REL_SIZE}
                nodeCanvasObject={nodeCanvasObject}
                nodeCanvasObjectMode={() => "after"}
                nodePointerAreaPaint={nodePointerAreaPaint}
                linkCanvasObject={linkCanvasObject}
                width={dimensions.width}
                height={dimensions.height}
                linkDirectionalArrowLength={4}
                linkDirectionalArrowRelPos={1}
                cooldownTicks={0}
                enableNodeDrag
                enableZoomInteraction
                enablePanInteraction
                autoPauseRedraw={false}
              />
              {/* Legend */}
              <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-x-4 gap-y-1.5 rounded-lg border border-border bg-background/80 px-3 py-2 backdrop-blur">
                {presentLanguages.map(([lang, color]) => (
                  <div key={lang} className="flex items-center gap-1.5">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
                    <span className="font-mono text-[10px] text-muted-foreground">{lang}</span>
                  </div>
                ))}
                {hasImplementsLinks && (
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-4 border-t border-dashed border-muted-foreground" />
                    <span className="font-mono text-[10px] text-muted-foreground">implements</span>
                  </div>
                )}
              </div>
              {/* Node count */}
              <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-border bg-background/80 px-2.5 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur">
                {graph.nodes.length} nodes · {graph.links.length} edges
              </div>
            </>
          )}
        </div>

        {/* Side panel */}
        {selectedNode && (
          <div className="flex w-72 shrink-0 flex-col border-l-2 border-border bg-card">
            <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
              <span className="font-mono text-[11px] text-primary">{"// details"}</span>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: LANGUAGE_COLORS[selectedNode.group] || LANGUAGE_COLORS.unknown }}
                  />
                  <span className="font-mono text-sm font-medium">{selectedNode.label}</span>
                </div>
                {selectedNode.id !== selectedNode.label && (
                  <p className="mt-1.5 break-all font-mono text-[10px] text-muted-foreground/60">
                    {selectedNode.id}
                  </p>
                )}
              </div>

              <div className="mb-4 flex gap-2">
                <span className="rounded-md border border-border bg-muted/20 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {selectedNode.group}
                </span>
                <span className="rounded-md border border-border bg-muted/20 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {selectedNode.degree} connections
                </span>
              </div>

              {selectedNode.summary && (
                <div className="mb-4">
                  <p className="mb-1.5 font-mono text-[10px] text-muted-foreground/50">summary</p>
                  <p className="text-[12px] leading-relaxed text-foreground/80">{selectedNode.summary}</p>
                </div>
              )}

              {selectedNodeNeighbors.length > 0 && (
                <div className="mb-4">
                  <p className="mb-1.5 font-mono text-[10px] text-muted-foreground/50">
                    connections ({selectedNodeNeighbors.length})
                  </p>
                  <div className="space-y-1">
                    {selectedNodeNeighbors.slice(0, 20).map((n) => (
                      <button
                        key={n.id}
                        onClick={() => setSelectedNode(n)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors hover:bg-accent"
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: LANGUAGE_COLORS[n.group] || LANGUAGE_COLORS.unknown }}
                        />
                        <span className="truncate font-mono text-[11px] text-foreground/70">{n.label}</span>
                      </button>
                    ))}
                    {selectedNodeNeighbors.length > 20 && (
                      <p className="px-2 font-mono text-[10px] text-muted-foreground/40">
                        +{selectedNodeNeighbors.length - 20} more
                      </p>
                    )}
                  </div>
                </div>
              )}

              {selectedNodeLinks.length > 0 && (
                <div>
                  <p className="mb-1.5 font-mono text-[10px] text-muted-foreground/50">
                    relationships ({selectedNodeLinks.length})
                  </p>
                  <div className="space-y-1">
                    {selectedNodeLinks.slice(0, 15).map((link, i) => {
                      const s = typeof link.source === "string" ? link.source : (link.source as any).id;
                      const t = typeof link.target === "string" ? link.target : (link.target as any).id;
                      const direction = s === selectedNode.id ? "→" : "←";
                      const other = s === selectedNode.id ? t : s;
                      return (
                        <div key={i} className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground/60">
                          <span>{direction}</span>
                          <span className="truncate">{other.split("/").pop()}</span>
                          <span className="ml-auto rounded bg-muted/30 px-1 text-[9px]">{link.type}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GraphPage;
