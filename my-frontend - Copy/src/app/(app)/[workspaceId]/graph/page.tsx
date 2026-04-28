/**
 * app/(app)/[workspaceId]/graph/page.tsx — Knowledge Map
 *
 * What:    Full-page force-directed graph of all pages in the workspace.
 *          Nodes = pages  |  Edges = PAGE_LINK connections (incl. parent/child).
 *
 * URL:     /:workspaceId/graph
 *
 * Data:    GET /api/relations/workspace/{id}/graph/  via useWorkspaceGraph()
 *
 * Interactions:
 *   - Pan + zoom  — d3.zoom() on the SVG element
 *   - Click node  — router.push(`/${workspaceId}/${node.id}`)
 *   - Hover node  — tooltip with icon + title (no API call)
 *   - Search      — filter/highlight nodes by title (top-left input)
 *   - Controls    — zoom in / zoom out / reset (top-right buttons)
 *
 * Edge colours:
 *   page_link  → violet (manual [[link]])
 *   parent     → blue   (auto parent→child)
 *   child      → blue   (auto child→parent)
 */

'use client';

import { useParams, useRouter }             from 'next/navigation';
import { useState, useEffect, useRef,
         useCallback }                       from 'react';
import * as d3                              from 'd3';
import { ArrowLeft, ZoomIn, ZoomOut,
         RotateCcw, Search }                from 'lucide-react';
import { useWorkspaceGraph }               from '@/hooks/useWorkspaceGraph';
import type { GraphNode }                   from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// D3 simulation node/link types
// ─────────────────────────────────────────────────────────────────────────────

interface SimNode extends d3.SimulationNodeDatum, GraphNode {}
interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  type: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function edgeColor(type: string): string {
  return type === 'page_link' ? '#7c3aed66' : '#3b82f666';
}


// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function GraphPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router          = useRouter();

  const { data, isLoading, isError } = useWorkspaceGraph(workspaceId);

  const svgRef        = useRef<SVGSVGElement>(null);
  const zoomRef       = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const [search, setSearch]       = useState('');
  const [tooltip, setTooltip]     = useState<{
    x: number; y: number; node: GraphNode;
  } | null>(null);

  // ── Build and run the simulation ──────────────────────────────────────────
  const buildGraph = useCallback(() => {
    if (!svgRef.current || !data) return;

    const svg    = d3.select(svgRef.current);
    const width  = svgRef.current.clientWidth  || 900;
    const height = svgRef.current.clientHeight || 700;

    // Clear previous render
    svg.selectAll('*').remove();

    // Zoom layer
    const g = svg.append('g');

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);
    zoomRef.current = zoom;

    // Arrow marker for directed edges
    svg.append('defs').append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 28)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#7c3aed66');

    // Clone data into mutable simulation objects
    const nodes: SimNode[] = data.nodes.map((n) => ({ ...n }));
    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    const links: SimLink[] = data.edges
      .filter((e) => nodeById.has(e.source) && nodeById.has(e.target))
      .map((e) => ({
        source: nodeById.get(e.source)!,
        target: nodeById.get(e.target)!,
        type:   e.type,
      }));

    // Force simulation
    const sim = d3.forceSimulation<SimNode>(nodes)
      .force('link',   d3.forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide(40));

    // Edges
    const link = g.append('g')
      .selectAll<SVGLineElement, SimLink>('line')
      .data(links)
      .enter().append('line')
      .attr('stroke', (d) => edgeColor(d.type))
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#arrow)');

    // Node groups
    const node = g.append('g')
      .selectAll<SVGGElement, SimNode>('g')
      .data(nodes)
      .enter().append('g')
      .style('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, SimNode>()
          .on('start', (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );

    // Circle
    node.append('circle')
      .attr('r', 20)
      .attr('fill', (d) => `${d.color}33`)
      .attr('stroke', (d) => d.color)
      .attr('stroke-width', 2);

    // Icon
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('font-size', '14')
      .text((d) => d.icon || '📄');

    // Label below circle
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', 32)
      .attr('font-size', '11')
      .attr('fill', '#e5e5e5')
      .text((d) => d.title.length > 20 ? d.title.slice(0, 18) + '…' : d.title);

    // Click → navigate to page
    node.on('click', (_event, d) => {
      router.push(`/${workspaceId}/${d.id}`);
    });

    // Hover tooltip
    node.on('mouseenter', (event, d) => {
      const rect = svgRef.current!.getBoundingClientRect();
      setTooltip({
        x: event.clientX - rect.left + 12,
        y: event.clientY - rect.top  - 10,
        node: d,
      });
    });
    node.on('mouseleave', () => setTooltip(null));

    // Tick
    sim.on('tick', () => {
      link
        .attr('x1', (d) => (d.source as SimNode).x ?? 0)
        .attr('y1', (d) => (d.source as SimNode).y ?? 0)
        .attr('x2', (d) => (d.target as SimNode).x ?? 0)
        .attr('y2', (d) => (d.target as SimNode).y ?? 0);

      node.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => { sim.stop(); };
  }, [data, router, workspaceId]);

  useEffect(() => {
    const cleanup = buildGraph();
    return () => { cleanup?.(); };
  }, [buildGraph]);

  // ── Search: dim non-matching nodes ───────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const q   = search.trim().toLowerCase();

    svg.selectAll<SVGGElement, SimNode>('g g')
      .style('opacity', (d) => {
        if (!q) return '1';
        return d.title?.toLowerCase().includes(q) ? '1' : '0.15';
      });
  }, [search]);

  // ── Zoom controls ─────────────────────────────────────────────────────────
  function zoomBy(factor: number) {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current)
      .transition().duration(300)
      .call(zoomRef.current.scaleBy, factor);
  }

  function zoomReset() {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current)
      .transition().duration(400)
      .call(zoomRef.current.transform, d3.zoomIdentity);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex h-screen w-full flex-col bg-neutral-950 text-neutral-100">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-neutral-800 px-4 py-2">
        <button
          onClick={() => router.push(`/${workspaceId}`)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
        >
          <ArrowLeft size={14} />
          Back
        </button>

        <span className="text-sm font-medium text-neutral-200">Knowledge Map</span>

        <span className="ml-1 text-xs text-neutral-500">
          {data ? `${data.nodes.length} pages · ${data.edges.length} links` : ''}
        </span>

        {/* Search */}
        <div className="ml-auto flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1">
          <Search size={12} className="text-neutral-500" />
          <input
            type="text"
            placeholder="Search pages…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-40 bg-transparent text-xs text-neutral-300 placeholder-neutral-600 outline-none"
          />
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => zoomBy(1.3)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
            title="Zoom in"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={() => zoomBy(1 / 1.3)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={zoomReset}
            className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
            title="Reset view"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* ── Graph canvas ─────────────────────────────────────────────────── */}
      <div className="relative flex-1 overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm text-neutral-500 animate-pulse">Loading graph…</span>
          </div>
        )}

        {isError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm text-neutral-500">Failed to load graph.</span>
          </div>
        )}

        {data && data.nodes.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <span className="text-2xl">🕸️</span>
            <span className="text-sm text-neutral-500">No pages yet — create some pages to see the graph.</span>
          </div>
        )}

        <svg
          ref={svgRef}
          className="h-full w-full"
          style={{ display: data && data.nodes.length > 0 ? 'block' : 'none' }}
        />

        {/* Hover tooltip */}
        {tooltip && (
          <div
            className="pointer-events-none absolute rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 shadow-xl text-xs text-neutral-200"
            style={{ top: tooltip.y, left: tooltip.x, zIndex: 99999 }}
          >
            <span className="mr-1">{tooltip.node.icon || '📄'}</span>
            {tooltip.node.title}
          </div>
        )}
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-4 border-t border-neutral-800 px-4 py-1.5 text-[10px] text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-px w-6 bg-violet-500/60" />
          Page link
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-px w-6 bg-blue-500/60" />
          Parent / child
        </span>
        <span className="ml-auto">Click a node to open the page · Drag to rearrange</span>
      </div>
    </div>
  );
}
