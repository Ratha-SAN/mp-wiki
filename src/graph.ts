import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';

import type { GraphData, GraphEdge, GraphNode } from './types';

interface SimNode extends SimulationNodeDatum {
  readonly ref: GraphNode;
}
interface SimLink extends SimulationLinkDatum<SimNode> {
  source: SimNode;
  target: SimNode;
  type: GraphEdge['type'];
}

interface GraphOptions {
  container: HTMLElement;
  data: GraphData;
  onOpen: (id: string) => void;
}

interface Theme {
  surface: string;
  node: string;
  nodeMuted: string;
  active: string;
  unresolved: string;
  edge: string;
  edgeStrong: string;
  label: string;
  labelHalo: string;
}

const MIN_ZOOM = 0.12;
const MAX_ZOOM = 6;

export class GraphView {
  private readonly opts: GraphOptions;
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly countEl = document.createElement('p');

  private readonly nodes: SimNode[];
  private readonly byId: Map<string, SimNode>;
  private readonly neighbours: Map<number, Set<number>>;

  private simulation: Simulation<SimNode, SimLink> | null = null;
  private visible: SimNode[] = [];
  private links: SimLink[] = [];
  private visibleSet = new Set<number>();

  private transform = { k: 1, x: 0, y: 0 };
  private theme!: Theme;
  private width = 0;
  private height = 0;
  private frame = 0;

  private activeId: string | null = null;
  private hovered: SimNode | null = null;
  private dragging: SimNode | null = null;
  private panning: { x: number; y: number } | null = null;
  private moved = false;
  /** Once the reader pans or zooms, stop re-framing the view under them. */
  private userFramed = false;

  private folders = new Set<string>();
  private tags = new Set<string>();
  private showUnresolved = true;
  private hops = 0; // 0 = whole vault

  constructor(opts: GraphOptions) {
    this.opts = opts;
    this.nodes = opts.data.nodes.map((ref) => ({ ref }));
    this.byId = new Map(this.nodes.map((node) => [node.ref.id, node]));
    this.neighbours = buildAdjacency(opts.data);

    this.canvas.className = 'graph-canvas';
    this.canvas.setAttribute('role', 'application');
    this.canvas.setAttribute('aria-label', 'Note graph. Use the file explorer for keyboard navigation.');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    this.ctx = ctx;

    opts.container.append(this.buildToolbar(), this.canvas, this.buildLegend());

    this.readTheme();
    this.bindPointer();

    new ResizeObserver(() => this.resize()).observe(opts.container);
    new MutationObserver(() => {
      this.readTheme();
      this.draw();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    this.resize();
    this.rebuild(true);
  }

  setActive(id: string | null): void {
    this.activeId = id;
    if (this.hops > 0) this.rebuild(false);
    else this.draw();
  }

  /** Re-centre the view on everything currently drawn. */
  fit(animate = true): void {
    if (!this.visible.length) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of this.visible) {
      minX = Math.min(minX, node.x ?? 0);
      maxX = Math.max(maxX, node.x ?? 0);
      minY = Math.min(minY, node.y ?? 0);
      maxY = Math.max(maxY, node.y ?? 0);
    }
    const pad = 60;
    const k = clamp(
      Math.min((this.width - pad * 2) / Math.max(maxX - minX, 1), (this.height - pad * 2) / Math.max(maxY - minY, 1)),
      MIN_ZOOM,
      1.6,
    );
    const target = {
      k,
      x: this.width / 2 - ((minX + maxX) / 2) * k,
      y: this.height / 2 - ((minY + maxY) / 2) * k,
    };
    if (!animate) {
      this.transform = target;
      this.draw();
      return;
    }
    const from = { ...this.transform };
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 260);
      const e = t * (2 - t);
      this.transform = {
        k: from.k + (target.k - from.k) * e,
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
      };
      this.draw();
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* -------------------------------------------------------------- controls */

  private buildToolbar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'graph-toolbar';

    const folderItems = uniqueFolders(this.opts.data).map((folder) => ({
      value: folder.path,
      label: folder.path || '(root)',
      count: folder.count,
    }));
    bar.append(
      filterMenu('Folders', folderItems, this.folders, () => this.rebuild(false)),
      filterMenu(
        'Tags',
        this.opts.data.tags.map((t) => ({ value: t.tag, label: `#${t.tag}`, count: t.count })),
        this.tags,
        () => this.rebuild(false),
      ),
    );

    const hopsWrap = document.createElement('label');
    hopsWrap.className = 'graph-field';
    hopsWrap.innerHTML = '<span>Depth</span>';
    const hops = document.createElement('select');
    hops.innerHTML = [
      '<option value="0">Whole vault</option>',
      '<option value="1">1 hop</option>',
      '<option value="2">2 hops</option>',
      '<option value="3">3 hops</option>',
      '<option value="4">4 hops</option>',
    ].join('');
    hops.title = 'Show only notes within N links of the open note';
    hops.addEventListener('change', () => {
      this.hops = Number(hops.value);
      this.rebuild(false);
      this.fit();
    });
    hopsWrap.append(hops);

    const unresolved = document.createElement('label');
    unresolved.className = 'graph-check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = this.showUnresolved;
    box.addEventListener('change', () => {
      this.showUnresolved = box.checked;
      this.rebuild(false);
    });
    unresolved.append(box, document.createTextNode('Unresolved'));

    const fit = document.createElement('button');
    fit.type = 'button';
    fit.className = 'graph-button';
    fit.textContent = 'Fit';
    fit.addEventListener('click', () => {
      this.userFramed = false;
      this.fit();
    });

    this.countEl.className = 'graph-count';
    bar.append(hopsWrap, unresolved, fit, this.countEl);
    return bar;
  }

  private buildLegend(): HTMLElement {
    const legend = document.createElement('ul');
    legend.className = 'graph-legend';
    legend.innerHTML = `
      <li><span class="swatch swatch-note"></span>Note</li>
      <li><span class="swatch swatch-active"></span>Open note</li>
      <li><span class="swatch swatch-unresolved"></span>Unresolved link</li>
    `;
    return legend;
  }

  /* --------------------------------------------------------- graph rebuild */

  private rebuild(initial: boolean): void {
    const allowed = new Set<number>();
    for (const node of this.nodes) {
      const ref = node.ref;
      if (ref.kind === 'unresolved') continue;
      if (this.folders.size && !matchesFolder(ref.folder ?? '', this.folders)) continue;
      if (this.tags.size && !ref.tags.some((tag) => this.tags.has(tag))) continue;
      allowed.add(ref.i);
    }
    if (this.showUnresolved) {
      for (const node of this.nodes) {
        if (node.ref.kind !== 'unresolved') continue;
        // A dangling node earns its place only if something visible points at it.
        for (const other of this.neighbours.get(node.ref.i) ?? []) {
          if (allowed.has(other)) {
            allowed.add(node.ref.i);
            break;
          }
        }
      }
    }

    let keep = allowed;
    const active = this.activeId ? this.byId.get(this.activeId) : null;
    if (this.hops > 0 && active) {
      keep = this.withinHops(active.ref.i, this.hops, allowed);
      keep.add(active.ref.i);
    }

    this.visibleSet = keep;
    this.visible = this.nodes.filter((node) => keep.has(node.ref.i));

    spread(this.visible, this.width, this.height);

    this.links = this.opts.data.edges
      .filter((edge) => keep.has(edge.s) && keep.has(edge.t))
      .map((edge) => ({
        source: this.nodes[edge.s],
        target: this.nodes[edge.t],
        type: edge.type,
      }));

    this.countEl.textContent = `${this.visible.length} notes · ${this.links.length} links`;

    this.simulation?.stop();
    this.simulation = forceSimulation(this.visible)
      .force(
        'link',
        forceLink<SimNode, SimLink>(this.links)
          .distance((link) => 34 + 5 * Math.min(8, (link.source.ref.deg + link.target.ref.deg) / 2))
          .strength(0.35),
      )
      .force('charge', forceManyBody<SimNode>().strength(-180).distanceMax(650))
      .force('collide', forceCollide<SimNode>((node) => radiusOf(node.ref) + 6))
      .force('x', forceX(this.width / 2).strength(0.035))
      .force('y', forceY(this.height / 2).strength(0.035))
      .alpha(initial ? 1 : 0.55)
      .alphaDecay(0.028)
      .on('tick', () => this.draw());

    // Warm the layout off-screen so the view never opens on a hairball, then frame it.
    this.simulation.tick(initial ? 140 : 70);
    this.fit(!initial);
    this.userFramed = false;
  }

  private withinHops(start: number, hops: number, allowed: Set<number>): Set<number> {
    const seen = new Set<number>([start]);
    let frontier = [start];
    for (let depth = 0; depth < hops; depth += 1) {
      const next: number[] = [];
      for (const current of frontier) {
        for (const neighbour of this.neighbours.get(current) ?? []) {
          if (seen.has(neighbour) || !allowed.has(neighbour)) continue;
          seen.add(neighbour);
          next.push(neighbour);
        }
      }
      frontier = next;
      if (!frontier.length) break;
    }
    return seen;
  }

  /* ------------------------------------------------------------- rendering */

  private resize(): void {
    const rect = this.opts.container.getBoundingClientRect();
    const changed = Math.abs(rect.width - this.width) > 1 || Math.abs(rect.height - this.height) > 1;
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (changed && !this.userFramed && this.visible.length) this.fit(false);
    else this.draw();
  }

  private readTheme(): void {
    const styles = getComputedStyle(this.opts.container);
    const pick = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
    this.theme = {
      surface: pick('--graph-surface', '#ffffff'),
      node: pick('--graph-node', '#2a78d6'),
      nodeMuted: pick('--graph-node-muted', '#c3c8d0'),
      active: pick('--graph-active', '#eb6834'),
      unresolved: pick('--graph-unresolved', '#8d8d87'),
      edge: pick('--graph-edge', '#d5d8dd'),
      edgeStrong: pick('--graph-edge-strong', '#8f959f'),
      label: pick('--graph-label', '#2b2b2b'),
      labelHalo: pick('--graph-label-halo', '#ffffff'),
    };
  }

  private draw(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.paint();
    });
  }

  private paint(): void {
    const { ctx, theme, transform: t } = this;
    ctx.save();
    ctx.clearRect(0, 0, this.width, this.height);

    const highlight = this.highlightSet();
    const dim = highlight !== null;

    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    // Edges
    ctx.lineWidth = 1 / t.k;
    for (const link of this.links) {
      const lit =
        !dim || (highlight!.has(link.source.ref.i) && highlight!.has(link.target.ref.i));
      ctx.strokeStyle = lit ? (dim ? theme.edgeStrong : theme.edge) : theme.edge;
      ctx.globalAlpha = lit ? 0.9 : 0.12;
      ctx.setLineDash(link.type === 'embed' ? [3 / t.k, 3 / t.k] : []);
      ctx.beginPath();
      ctx.moveTo(link.source.x ?? 0, link.source.y ?? 0);
      ctx.lineTo(link.target.x ?? 0, link.target.y ?? 0);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Nodes
    for (const node of this.visible) {
      const lit = !dim || highlight!.has(node.ref.i);
      const isActive = node.ref.id === this.activeId;
      const radius = radiusOf(node.ref);
      ctx.globalAlpha = lit ? 1 : 0.22;
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, Math.PI * 2);

      if (node.ref.kind === 'unresolved') {
        ctx.fillStyle = theme.surface;
        ctx.fill();
        ctx.setLineDash([2.5 / t.k, 2.5 / t.k]);
        ctx.lineWidth = 1.6 / t.k;
        ctx.strokeStyle = theme.unresolved;
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = isActive ? theme.active : lit ? theme.node : theme.nodeMuted;
        ctx.fill();
        if (isActive || node === this.hovered) {
          ctx.lineWidth = 2.5 / t.k;
          ctx.strokeStyle = theme.surface;
          ctx.stroke();
          ctx.lineWidth = 1.5 / t.k;
          ctx.strokeStyle = isActive ? theme.active : theme.node;
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    this.paintLabels(highlight);
  }

  private paintLabels(highlight: Set<number> | null): void {
    const { ctx, theme, transform: t } = this;
    const showAll = t.k >= 0.95;
    ctx.save();
    ctx.font = '500 12px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';

    for (const node of this.visible) {
      const emphasised = node === this.hovered || node.ref.id === this.activeId;
      const near = highlight?.has(node.ref.i) ?? false;
      if (!showAll && !emphasised && !near) continue;
      if (highlight && !near && !emphasised) continue;

      const x = (node.x ?? 0) * t.k + t.x;
      const y = (node.y ?? 0) * t.k + t.y + radiusOf(node.ref) * t.k + 4;
      if (x < -80 || x > this.width + 80 || y < -20 || y > this.height + 20) continue;

      const text = truncate(node.ref.title, emphasised ? 48 : 26);
      ctx.globalAlpha = emphasised ? 1 : 0.88;
      ctx.lineWidth = 3;
      ctx.strokeStyle = theme.labelHalo;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = node.ref.kind === 'unresolved' ? theme.unresolved : theme.label;
      ctx.fillText(text, x, y);
    }
    ctx.restore();
  }

  private highlightSet(): Set<number> | null {
    if (!this.hovered) return null;
    const set = new Set<number>([this.hovered.ref.i]);
    for (const neighbour of this.neighbours.get(this.hovered.ref.i) ?? []) {
      if (this.visibleSet.has(neighbour)) set.add(neighbour);
    }
    return set;
  }

  /* --------------------------------------------------------------- pointer */

  private bindPointer(): void {
    const canvas = this.canvas;

    canvas.addEventListener('pointerdown', (event) => {
      canvas.setPointerCapture(event.pointerId);
      this.moved = false;
      const hit = this.nodeAt(event);
      if (hit) {
        this.dragging = hit;
        hit.fx = hit.x;
        hit.fy = hit.y;
        this.simulation?.alphaTarget(0.25).restart();
      } else {
        this.panning = { x: event.clientX - this.transform.x, y: event.clientY - this.transform.y };
      }
    });

    canvas.addEventListener('pointermove', (event) => {
      if (this.dragging) {
        this.moved = true;
        const world = this.toWorld(event);
        this.dragging.fx = world.x;
        this.dragging.fy = world.y;
        this.draw();
        return;
      }
      if (this.panning) {
        this.moved = true;
        this.userFramed = true;
        this.transform.x = event.clientX - this.panning.x;
        this.transform.y = event.clientY - this.panning.y;
        this.draw();
        return;
      }
      const hit = this.nodeAt(event);
      if (hit !== this.hovered) {
        this.hovered = hit;
        canvas.style.cursor = hit ? 'pointer' : 'grab';
        canvas.title = hit ? `${hit.ref.title}${hit.ref.path ? `\n${hit.ref.path}` : '\nunresolved link'}` : '';
        this.draw();
      }
    });

    const release = (event: PointerEvent) => {
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (this.dragging) {
        this.dragging.fx = null;
        this.dragging.fy = null;
        this.simulation?.alphaTarget(0);
        this.dragging = null;
      }
      this.panning = null;
    };
    canvas.addEventListener('pointerup', (event) => {
      const hit = this.nodeAt(event);
      release(event);
      if (!this.moved && hit) this.opts.onOpen(hit.ref.id);
    });
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', () => {
      if (this.hovered) {
        this.hovered = null;
        this.draw();
      }
    });

    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.userFramed = true;
        const rect = canvas.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.02 : 0.0016));
        const k = clamp(this.transform.k * factor, MIN_ZOOM, MAX_ZOOM);
        const scale = k / this.transform.k;
        this.transform = {
          k,
          x: px - (px - this.transform.x) * scale,
          y: py - (py - this.transform.y) * scale,
        };
        this.draw();
      },
      { passive: false },
    );

    canvas.addEventListener('dblclick', (event) => {
      if (!this.nodeAt(event)) this.fit();
    });
  }

  private toWorld(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - this.transform.x) / this.transform.k,
      y: (event.clientY - rect.top - this.transform.y) / this.transform.k,
    };
  }

  private nodeAt(event: PointerEvent | MouseEvent): SimNode | null {
    const rect = this.canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    let best: SimNode | null = null;
    let bestDist = Infinity;
    for (const node of this.visible) {
      const x = (node.x ?? 0) * this.transform.k + this.transform.x;
      const y = (node.y ?? 0) * this.transform.k + this.transform.y;
      const reach = Math.max(radiusOf(node.ref) * this.transform.k + 4, 9);
      const dist = Math.hypot(px - x, py - y);
      if (dist <= reach && dist < bestDist) {
        best = node;
        bestDist = dist;
      }
    }
    return best;
  }
}

/* ------------------------------------------------------------------ helpers */

function buildAdjacency(data: GraphData): Map<number, Set<number>> {
  const map = new Map<number, Set<number>>();
  const add = (a: number, b: number) => {
    let set = map.get(a);
    if (!set) map.set(a, (set = new Set()));
    set.add(b);
  };
  for (const edge of data.edges) {
    add(edge.s, edge.t);
    add(edge.t, edge.s);
  }
  return map;
}

function uniqueFolders(data: GraphData): { path: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const node of data.nodes) {
    if (node.kind !== 'note') continue;
    counts.set(node.folder ?? '', (counts.get(node.folder ?? '') ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function matchesFolder(folder: string, selected: Set<string>): boolean {
  if (selected.has(folder)) return true;
  for (const candidate of selected) {
    if (candidate && folder.startsWith(`${candidate}/`)) return true;
  }
  return false;
}

function radiusOf(node: GraphNode): number {
  const base = node.kind === 'unresolved' ? 3.4 : 4.2;
  return Math.min(15, base + Math.sqrt(node.deg) * 1.7);
}

/** Give brand-new nodes a starting position so the simulation does not explode. */
function spread(nodes: SimNode[], width: number, height: number): void {
  const radius = Math.min(width, height) * 0.35 || 200;
  nodes.forEach((node, index) => {
    if (node.x !== undefined && node.y !== undefined) return;
    const angle = index * 2.399963; // golden angle: an even, non-clumping sunflower fill
    const r = radius * Math.sqrt((index + 1) / nodes.length);
    node.x = width / 2 + Math.cos(angle) * r;
    node.y = height / 2 + Math.sin(angle) * r;
  });
}

function filterMenu(
  label: string,
  items: { value: string; label: string; count: number }[],
  selected: Set<string>,
  onChange: () => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'graph-menu';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'graph-button';
  button.setAttribute('aria-expanded', 'false');
  const sync = () => {
    button.textContent = selected.size ? `${label} · ${selected.size}` : label;
    button.classList.toggle('is-on', selected.size > 0);
  };
  sync();

  const panel = document.createElement('div');
  panel.className = 'graph-menu-panel';
  panel.hidden = true;

  if (!items.length) {
    panel.innerHTML = '<p class="menu-empty">Nothing to filter</p>';
  }
  for (const item of items) {
    const row = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = selected.has(item.value);
    box.addEventListener('change', () => {
      if (box.checked) selected.add(item.value);
      else selected.delete(item.value);
      sync();
      onChange();
    });
    const name = document.createElement('span');
    name.className = 'menu-label';
    name.textContent = item.label;
    const count = document.createElement('span');
    count.className = 'menu-count';
    count.textContent = String(item.count);
    row.append(box, name, count);
    panel.append(row);
  }

  if (items.length) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'menu-clear';
    clear.textContent = 'Clear';
    clear.addEventListener('click', () => {
      selected.clear();
      panel.querySelectorAll('input').forEach((box) => ((box as HTMLInputElement).checked = false));
      sync();
      onChange();
    });
    panel.append(clear);
  }

  button.addEventListener('click', () => {
    const open = panel.hidden;
    document.querySelectorAll('.graph-menu-panel').forEach((el) => ((el as HTMLElement).hidden = true));
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('pointerdown', (event) => {
    if (!wrap.contains(event.target as Node)) {
      panel.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    }
  });

  wrap.append(button, panel);
  return wrap;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
