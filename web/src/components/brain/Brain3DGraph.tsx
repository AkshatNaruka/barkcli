import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import * as THREE from "three";
import ForceGraph3D, { type ForceGraph3DInstance } from "3d-force-graph";
import type { BrainNode, BrainEdge } from "../../lib/api";
import { TIER, KIND_ICON } from "./layout";
import { Icon } from "../Icon";
import { LabelChip } from "../LabelChip";
import { navigate } from "../../lib/hashnav";

export interface Brain3DGraphProps {
  nodes: BrainNode[];
  edges: BrainEdge[];
  selectedId: string | null;
  onSelectNode: (node: BrainNode | null) => void;
  searchQuery?: string;
  tierFilter?: string;
  kindFilter?: string;
  boardName?: string | null;
}

// Color palette inspired by second-brain-os with barkcli dark aesthetic
const KIND_COLORS: Record<string, string> = {
  root: "#ffffff",
  memory: "#60a5fa",   // blue
  fact: "#34d399",     // emerald
  session: "#fbbf24",  // amber
  card: "#a78bfa",     // purple
  agent: "#f43f5e",    // rose
  skill: "#38bdf8",    // sky
  hub: "#c084fc",      // lilac
};

// Soft rim shader for hubs and major nodes (from second-brain-os)
function createRimMaterial(colorStr: string) {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(colorStr) },
      opacity: { value: 0.65 },
    },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float opacity;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float a = pow(f, 2.2) * 0.85 + 0.05;
        gl_FragColor = vec4(color, a * opacity);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
}

const GEO = {
  sphere: new THREE.SphereGeometry(1, 24, 18),
  gem: new THREE.IcosahedronGeometry(1, 0),
  oct: new THREE.OctahedronGeometry(1, 0),
  shell: new THREE.SphereGeometry(1, 28, 20),
};

export function Brain3DGraph({
  nodes,
  edges,
  selectedId,
  onSelectNode,
  searchQuery = "",
  tierFilter = "",
  kindFilter = "",
  boardName,
}: Brain3DGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const labelsRef = useRef<HTMLDivElement | null>(null);
  const graphRef = useRef<ForceGraph3DInstance | null>(null);

  const [spin, setSpin] = useState(true);
  const [hoveredNode, setHoveredNode] = useState<BrainNode | null>(null);
  const [activeNeighbors, setActiveNeighbors] = useState<BrainNode[]>([]);
  const [ringPos, setRingPos] = useState<{ x: number; y: number; size: number; visible: boolean }>({
    x: 0,
    y: 0,
    size: 24,
    visible: false,
  });

  // Filter nodes based on tier, kind, and search
  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => {
      if (tierFilter && n.tier !== tierFilter) return false;
      if (kindFilter && n.kind !== kindFilter) return false;
      return true;
    });
  }, [nodes, tierFilter, kindFilter]);

  const nodeMap = useMemo(() => {
    return new Map(filteredNodes.map((n) => [n.id, n]));
  }, [filteredNodes]);

  // Filter edges to only include nodes that exist in filtered set
  const filteredEdges = useMemo(() => {
    return edges.filter((e) => nodeMap.has(e.from) && nodeMap.has(e.to));
  }, [edges, nodeMap]);

  // Map of neighbors for fast focus highlighting
  const neighborMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const n of filteredNodes) {
      map.set(n.id, new Set());
    }
    for (const e of filteredEdges) {
      map.get(e.from)?.add(e.to);
      map.get(e.to)?.add(e.from);
    }
    return map;
  }, [filteredNodes, filteredEdges]);

  // Selected node object
  const selectedNode = useMemo(() => {
    return selectedId ? nodeMap.get(selectedId) || nodes.find((n) => n.id === selectedId) || null : null;
  }, [selectedId, nodeMap, nodes]);

  // Resolve active neighbors for selected node
  useEffect(() => {
    if (!selectedId) {
      setActiveNeighbors([]);
      return;
    }
    const neighborIds = neighborMap.get(selectedId) || new Set();
    const result: BrainNode[] = [];
    for (const nid of neighborIds) {
      const found = nodeMap.get(nid) || nodes.find((n) => n.id === nid);
      if (found) result.push(found);
    }
    setActiveNeighbors(result);
  }, [selectedId, neighborMap, nodeMap, nodes]);

  // Get color for a node
  const getNodeColor = useCallback((n: BrainNode) => {
    if (n.tier && TIER[n.tier]?.color) {
      return TIER[n.tier].color;
    }
    return KIND_COLORS[n.kind] || "#94a3b8";
  }, []);

  // Initialize ForceGraph3D
  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous canvas if any
    containerRef.current.innerHTML = "";

    const graph = ForceGraph3D({
      controlType: "orbit",
      rendererConfig: { antialias: true, alpha: true, powerPreference: "high-performance" },
    })(containerRef.current);

    graphRef.current = graph;

    // Styling & setup
    graph
      .backgroundColor("rgba(0,0,0,0)")
      .showNavInfo(false)
      .nodeId("id")
      .nodeVal((n: any) => Math.max(3, (n.importance || 0.4) * 12 + (n.access_count ? Math.log2(n.access_count + 1) * 2 : 0)))
      .nodeLabel((n: any) => {
        const color = getNodeColor(n);
        return `
          <div style="background: rgba(18, 22, 20, 0.94); border: 1px solid rgba(255,255,255,0.14); border-radius: 8px; padding: 7px 11px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); font-family: ui-monospace, SFMono-Regular, monospace; max-width: 240px; color: #f3f4f6;">
            <div style="display: flex; align-items: center; gap: 5px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: ${color}; margin-bottom: 3px;">
              <span style="width: 6px; height: 6px; border-radius: 50%; background: ${color}; display: inline-block;"></span>
              <span>${n.kind || "node"}</span>
              ${n.tier ? `<span style="opacity: 0.6;">· ${n.tier}</span>` : ""}
            </div>
            <div style="font-size: 12px; font-weight: 600; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${n.label}</div>
            ${n.importance !== undefined ? `<div style="font-size: 9.5px; opacity: 0.55; margin-top: 3px;">Importance: ${(n.importance * 100).toFixed(0)}%</div>` : ""}
          </div>
        `;
      })
      .nodeThreeObject((n: any) => {
        const g = new THREE.Group();
        const baseRadius = Math.cbrt(Math.max(2, (n.importance || 0.4) * 10 + (n.access_count || 1) * 0.5)) * 2.2;
        const colorStr = getNodeColor(n);

        // Geometries according to node kind
        const geo = n.kind === "fact" ? GEO.gem : n.kind === "agent" || n.kind === "skill" ? GEO.oct : GEO.sphere;

        const isHub = (n.access_count && n.access_count > 3) || (n.importance && n.importance > 0.8) || n.kind === "agent";

        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(colorStr),
          roughness: 0.52,
          metalness: 0.08,
          flatShading: geo !== GEO.sphere,
        });

        const core = new THREE.Mesh(geo, mat);
        core.scale.setScalar(geo === GEO.sphere ? baseRadius : baseRadius * 1.15);
        g.add(core);

        // Add glowing rim bubble for important/hub nodes
        if (isHub) {
          const shellMat = createRimMaterial(colorStr);
          const shell = new THREE.Mesh(GEO.shell, shellMat);
          shell.scale.setScalar(baseRadius * 1.6);
          shell.renderOrder = 2;
          g.add(shell);
        }

        return g;
      })
      .nodeThreeObjectExtend(false)
      .linkColor((l: any) => {
        const fromColor = getNodeColor(nodeMap.get(l.from) || l.source);
        return fromColor || "rgba(255,255,255,0.2)";
      })
      .linkWidth((l: any) => {
        if (selectedId && (l.from === selectedId || l.to === selectedId)) return 2.2;
        return 0.8 + (l.weight || 0.5) * 1.2;
      })
      .linkOpacity(0.28)
      .linkDirectionalParticles((l: any) => {
        if (selectedId && (l.from === selectedId || l.to === selectedId)) return 3;
        return 0;
      })
      .linkDirectionalParticleSpeed(0.007)
      .linkDirectionalParticleWidth(2.5)
      .linkDirectionalParticleColor((l: any) => getNodeColor(nodeMap.get(l.from) || l.source))
      .enableNodeDrag(true)
      .warmupTicks(80)
      .cooldownTicks(200)
      .d3AlphaDecay(0.02)
      .d3VelocityDecay(0.35)
      .onNodeClick((n: any) => {
        if (!n) return;
        onSelectNode(n);

        // Fly camera to node
        const distance = 80;
        const distRatio = 1 + distance / Math.hypot(n.x, n.y, n.z);
        graph.cameraPosition(
          { x: n.x * distRatio, y: n.y * distRatio + 15, z: n.z * distRatio },
          { x: n.x, y: n.y, z: n.z },
          1200
        );
      })
      .onNodeHover((n: any) => {
        setHoveredNode(n || null);
        if (containerRef.current) {
          containerRef.current.style.cursor = n ? "pointer" : "grab";
        }
      })
      .onBackgroundClick(() => {
        onSelectNode(null);
      });

    // Lights
    const scene = graph.scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(100, 200, 150);
    scene.add(dirLight);

    // Orbit controls damping & auto-rotate
    const controls = graph.controls();
    if (controls) {
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.autoRotate = spin;
      controls.autoRotateSpeed = 0.45;
    }

    // Window / element resize observer
    const ro = new ResizeObserver(() => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      if (w > 0 && h > 0) {
        graph.width(w).height(h);
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      try {
        graph._destructor();
      } catch {}
    };
  }, []);

  // Update Graph Data when filtered nodes/edges change
  useEffect(() => {
    if (!graphRef.current) return;
    const gData = {
      nodes: filteredNodes.map((n) => ({ ...n })),
      links: filteredEdges.map((e) => ({ ...e, source: e.from, target: e.to })),
    };
    graphRef.current.graphData(gData);
  }, [filteredNodes, filteredEdges]);

  // Update auto-rotation on spin change
  useEffect(() => {
    if (!graphRef.current) return;
    const controls = graphRef.current.controls();
    if (controls) {
      controls.autoRotate = spin && !selectedId;
    }
  }, [spin, selectedId]);

  // Update link highlighting and particle pulses on selectedId change
  useEffect(() => {
    if (!graphRef.current) return;
    graphRef.current
      .linkWidth((l: any) => {
        const fromId = typeof l.source === "object" ? l.source.id : l.source;
        const toId = typeof l.target === "object" ? l.target.id : l.target;
        if (selectedId && (fromId === selectedId || toId === selectedId)) return 2.6;
        if (hoveredNode && (fromId === hoveredNode.id || toId === hoveredNode.id)) return 2.0;
        return 0.8 + (l.weight || 0.5) * 1.0;
      })
      .linkOpacity(selectedId ? 0.6 : 0.28)
      .linkDirectionalParticles((l: any) => {
        const fromId = typeof l.source === "object" ? l.source.id : l.source;
        const toId = typeof l.target === "object" ? l.target.id : l.target;
        if (selectedId && (fromId === selectedId || toId === selectedId)) return 3;
        return 0;
      });
  }, [selectedId, hoveredNode]);

  // Update screen-space selection ring
  useEffect(() => {
    let animId: number;
    const updateRing = () => {
      if (!selectedId || !graphRef.current || !containerRef.current) {
        setRingPos((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        animId = requestAnimationFrame(updateRing);
        return;
      }

      const gData = graphRef.current.graphData();
      const nodeObj = gData.nodes.find((n: any) => n.id === selectedId);
      if (nodeObj && nodeObj.x !== undefined) {
        const camera = graphRef.current.camera();
        const rect = containerRef.current.getBoundingClientRect();
        const v = new THREE.Vector3(nodeObj.x, nodeObj.y, nodeObj.z);
        v.project(camera);

        const isBehind = v.z > 1;
        if (isBehind) {
          setRingPos((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        } else {
          const x = ((v.x + 1) / 2) * rect.width;
          const y = ((-v.y + 1) / 2) * rect.height;
          const dist = camera.position.distanceTo(new THREE.Vector3(nodeObj.x, nodeObj.y, nodeObj.z));
          const size = Math.max(20, Math.min(80, (400 / dist) * 28));

          setRingPos({ x, y, size, visible: true });
        }
      } else {
        setRingPos((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      }

      animId = requestAnimationFrame(updateRing);
    };

    animId = requestAnimationFrame(updateRing);
    return () => cancelAnimationFrame(animId);
  }, [selectedId]);

  // Fly camera to a specific node by ID
  const focusOnNode = (id: string) => {
    const target = nodeMap.get(id) || nodes.find((n) => n.id === id);
    if (!target) return;
    onSelectNode(target);

    if (graphRef.current) {
      const gData = graphRef.current.graphData();
      const nodeObj = gData.nodes.find((n: any) => n.id === id);
      if (nodeObj && nodeObj.x !== undefined) {
        const distance = 90;
        const distRatio = 1 + distance / Math.hypot(nodeObj.x, nodeObj.y, nodeObj.z);
        graphRef.current.cameraPosition(
          { x: nodeObj.x * distRatio, y: nodeObj.y * distRatio + 15, z: nodeObj.z * distRatio },
          { x: nodeObj.x, y: nodeObj.y, z: nodeObj.z },
          1200
        );
      }
    }
  };

  const handleRecenter = () => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(1000, 30);
    }
  };

  return (
    <div className="relative w-full h-full flex overflow-hidden bg-bg/80 select-none">
      {/* 3D Force Graph Stage */}
      <div className="relative flex-1 h-full min-h-0 overflow-hidden">
        <div ref={containerRef} className="w-full h-full outline-none" />

        {/* Floating Screen-Space Pulsing Ring on Selected Node */}
        {ringPos.visible && (
          <div
            className="absolute pointer-events-none transform -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300"
            style={{
              left: `${ringPos.x}px`,
              top: `${ringPos.y}px`,
              width: `${ringPos.size}px`,
              height: `${ringPos.size}px`,
            }}
          >
            <div className="w-full h-full rounded-full border-2 border-accent/90 animate-ping opacity-75" />
            <div className="absolute inset-0 rounded-full border border-accent shadow-[0_0_15px_rgba(31,107,82,0.8)]" />
          </div>
        )}

        {/* 3D Graph Floating Controls (Bottom-Left) */}
        <div className="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 p-1 rounded-lg bg-surface/80 backdrop-blur-md border border-border/60 shadow-lg text-xs">
          <button
            type="button"
            onClick={() => setSpin(!spin)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors ${
              spin ? "bg-accent/15 text-accent font-medium" : "text-muted hover:text-text"
            }`}
            title={spin ? "Pause 3D rotation" : "Resume 3D rotation"}
          >
            <Icon name="refresh" size={13} className={spin ? "animate-spin" : ""} />
            <span>{spin ? "Spinning" : "Paused"}</span>
          </button>
          <button
            type="button"
            onClick={handleRecenter}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-muted hover:text-text hover:bg-white/[0.04] transition-colors"
            title="Recenter and fit graph"
          >
            <Icon name="search" size={13} />
            <span>Recenter</span>
          </button>
          <div className="h-3 w-[1px] bg-border/60 mx-0.5" />
          <span className="px-2 text-[11px] font-mono text-muted/70">
            {filteredNodes.length} nodes · {filteredEdges.length} links
          </span>
        </div>
      </div>

      {/* Selected Node Details Drawer / Inspector (Right Side) */}
      {selectedNode && (
        <aside className="w-80 h-full border-l border-border/60 bg-surface/90 backdrop-blur-md flex flex-col p-4 overflow-y-auto shadow-2xl z-20 animate-in slide-in-from-right-4 duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
                style={{ background: getNodeColor(selectedNode) }}
              />
              <span className="text-[11px] uppercase tracking-wider font-mono font-semibold text-muted">
                {selectedNode.kind}
              </span>
              {selectedNode.tier && (
                <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-card border border-border/60 text-muted-strong">
                  {TIER[selectedNode.tier]?.label || selectedNode.tier}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onSelectNode(null)}
              className="p-1 text-muted hover:text-text rounded hover:bg-white/[0.06] transition-colors cursor-pointer"
              title="Close panel (Esc)"
            >
              <Icon name="x" size={13} />
            </button>
          </div>

          <div className="mt-3.5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-text leading-snug break-words">
                {selectedNode.label}
              </h3>
              <p className="text-[11.5px] font-mono text-muted/60 mt-1 break-all">
                {selectedNode.id}
              </p>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-bg/50 border border-border/50 text-[11px]">
              <div>
                <span className="text-muted block text-[10px]">Importance</span>
                <span className="font-semibold text-text">
                  {((selectedNode.importance || 0) * 100).toFixed(0)}%
                </span>
              </div>
              <div>
                <span className="text-muted block text-[10px]">Access Count</span>
                <span className="font-semibold text-text">{selectedNode.access_count}×</span>
              </div>
              {selectedNode.created_at && (
                <div className="col-span-2 pt-1 border-t border-border/30">
                  <span className="text-muted block text-[10px]">Created</span>
                  <span className="font-mono text-muted-strong text-[10.5px]">
                    {new Date(selectedNode.created_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>

            {/* Tags */}
            {selectedNode.tags && selectedNode.tags.length > 0 && (
              <div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-muted block mb-1.5">
                  Tags
                </span>
                <div className="flex flex-wrap gap-1">
                  {selectedNode.tags.map((tag) => (
                    <LabelChip key={tag} name={tag} />
                  ))}
                </div>
              </div>
            )}

            {/* Connected Neighbors (Click to jump & fly) */}
            <div>
              <div className="flex items-center justify-between text-[10px] uppercase font-mono tracking-wider text-muted mb-2">
                <span>Direct Connections</span>
                <span className="font-mono">{activeNeighbors.length}</span>
              </div>

              {activeNeighbors.length === 0 ? (
                <p className="text-[11.5px] text-muted/60 italic p-2 rounded bg-card/40">
                  No direct connections linked yet.
                </p>
              ) : (
                <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
                  {activeNeighbors.map((n) => {
                    const color = getNodeColor(n);
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => focusOnNode(n.id)}
                        className="w-full text-left flex items-center justify-between p-2 rounded-lg bg-card/60 hover:bg-card border border-border/40 hover:border-accent/40 transition-all group cursor-pointer"
                        title={`Fly camera to ${n.label}`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: color }}
                          />
                          <span className="text-[12px] text-text group-hover:text-accent font-medium truncate">
                            {n.label}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-muted/60 uppercase ml-2 shrink-0">
                          {n.kind}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-2 border-t border-border/40 space-y-1.5">
              {selectedNode.kind === "session" && (
                <button
                  type="button"
                  onClick={() => navigate("chat", { thread: selectedNode.id, board: boardName || undefined })}
                  className="w-full py-1.5 px-3 rounded-md text-[12px] font-medium bg-accent text-bg hover:opacity-90 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Icon name="comment" size={13} />
                  <span>Open Thread</span>
                </button>
              )}
              {selectedNode.kind === "card" && (
                <button
                  type="button"
                  onClick={() => navigate("board", { board: boardName || undefined })}
                  className="w-full py-1.5 px-3 rounded-md text-[12px] font-medium bg-accent text-bg hover:opacity-90 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Icon name="board" size={13} />
                  <span>Open in Board</span>
                </button>
              )}
              {(selectedNode.kind === "memory" || selectedNode.kind === "fact") && (
                <button
                  type="button"
                  onClick={() => navigate("brain", { tool: "memory" })}
                  className="w-full py-1.5 px-3 rounded-md text-[12px] font-medium border border-border hover:bg-card text-text flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Icon name="db" size={13} />
                  <span>View in Memory Table</span>
                </button>
              )}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
