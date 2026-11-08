/// <reference types="vite/client" />

declare module '3d-force-graph' {
  export interface ForceGraph3DInstance {
    (element: HTMLElement): ForceGraph3DInstance;
    width(): number;
    width(width: number): ForceGraph3DInstance;
    height(): number;
    height(height: number): ForceGraph3DInstance;
    graphData(): { nodes: any[]; links: any[] };
    graphData(data: { nodes: any[]; links: any[] }): ForceGraph3DInstance;
    nodeId(): string;
    nodeId(id: string): ForceGraph3DInstance;
    nodeLabel(): (node: any) => string;
    nodeLabel(label: string | ((node: any) => string)): ForceGraph3DInstance;
    nodeVal(): number | string | ((node: any) => number);
    nodeVal(val: number | string | ((node: any) => number)): ForceGraph3DInstance;
    nodeColor(): string | ((node: any) => string);
    nodeColor(color: string | ((node: any) => string)): ForceGraph3DInstance;
    nodeThreeObject(): (node: any) => any;
    nodeThreeObject(obj: (node: any) => any): ForceGraph3DInstance;
    nodeThreeObjectExtend(): boolean;
    nodeThreeObjectExtend(extend: boolean): ForceGraph3DInstance;
    linkColor(): string | ((link: any) => string);
    linkColor(color: string | ((link: any) => string)): ForceGraph3DInstance;
    linkWidth(): number | string | ((link: any) => number);
    linkWidth(width: number | string | ((link: any) => number)): ForceGraph3DInstance;
    linkVisibility(): boolean | ((link: any) => boolean);
    linkVisibility(visible: boolean | ((link: any) => boolean)): ForceGraph3DInstance;
    linkOpacity(): number;
    linkOpacity(opacity: number): ForceGraph3DInstance;
    linkDirectionalParticles(): number | string | ((link: any) => number);
    linkDirectionalParticles(num: number | string | ((link: any) => number)): ForceGraph3DInstance;
    linkDirectionalParticleSpeed(): number | string | ((link: any) => number);
    linkDirectionalParticleSpeed(speed: number | string | ((link: any) => number)): ForceGraph3DInstance;
    linkDirectionalParticleWidth(): number | string | ((link: any) => number);
    linkDirectionalParticleWidth(width: number | string | ((link: any) => number)): ForceGraph3DInstance;
    linkDirectionalParticleColor(): string | ((link: any) => string);
    linkDirectionalParticleColor(color: string | ((link: any) => string)): ForceGraph3DInstance;
    backgroundColor(): string;
    backgroundColor(color: string): ForceGraph3DInstance;
    showNavInfo(): boolean;
    showNavInfo(show: boolean): ForceGraph3DInstance;
    enableNodeDrag(): boolean;
    enableNodeDrag(enable: boolean): ForceGraph3DInstance;
    enableNavigationControls(): boolean;
    enableNavigationControls(enable: boolean): ForceGraph3DInstance;
    cameraPosition(position?: { x?: number; y?: number; z?: number }, lookAt?: { x?: number; y?: number; z?: number }, transitionMs?: number): ForceGraph3DInstance;
    zoomToFit(durationMs?: number, padding?: number, nodeFilterFn?: (node: any) => boolean): ForceGraph3DInstance;
    onNodeClick(callback: (node: any, event: MouseEvent) => void): ForceGraph3DInstance;
    onNodeHover(callback: (node: any | null, prevNode: any | null) => void): ForceGraph3DInstance;
    onLinkClick(callback: (link: any, event: MouseEvent) => void): ForceGraph3DInstance;
    onBackgroundClick(callback: (event: MouseEvent) => void): ForceGraph3DInstance;
    onEngineTick(callback: () => void): ForceGraph3DInstance;
    d3Force(forceName: string): any;
    d3Force(forceName: string, forceFn: any): ForceGraph3DInstance;
    d3AlphaDecay(): number;
    d3AlphaDecay(decay: number): ForceGraph3DInstance;
    d3VelocityDecay(): number;
    d3VelocityDecay(decay: number): ForceGraph3DInstance;
    warmupTicks(): number;
    warmupTicks(ticks: number): ForceGraph3DInstance;
    cooldownTicks(): number;
    cooldownTicks(ticks: number): ForceGraph3DInstance;
    scene(): any;
    camera(): any;
    renderer(): any;
    controls(): any;
    refresh(): ForceGraph3DInstance;
    _destructor(): void;
    pauseAnimation(): ForceGraph3DInstance;
    resumeAnimation(): ForceGraph3DInstance;
  }

  export default function ForceGraph3D(options?: { controlType?: string; rendererConfig?: any }): ForceGraph3DInstance;
}
