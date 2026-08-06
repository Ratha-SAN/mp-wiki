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
  /** This node's assigned point inside the brain silhouette; see `sampleBrainPoints`. */
  bx?: number;
  by?: number;
}
interface SimLink extends SimulationLinkDatum<SimNode> {
  source: SimNode;
  target: SimNode;
  type: GraphEdge['type'];
}

interface GraphOptions {
  container: HTMLElement;
  data: GraphData;
  newIds: Set<string>;
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
  series: string[];
  other: string;
  new: string;
}

type ColorMode = 'role' | 'folder' | 'type';

const MIN_ZOOM = 0.12;
const MAX_ZOOM = 6;
/** Categorical hues are assigned in fixed order and never cycled. */
const SERIES_SLOTS = 8;
const COLOR_KEY = 'mp-wiki:graph-colour';

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
  /** Where the wheel handler wants to be; `transform` eases toward this every frame. */
  private targetTransform = { k: 1, x: 0, y: 0 };
  private chaseFrame = 0;
  private fitToken = 0;
  private theme!: Theme;
  private width = 0;
  private height = 0;
  private frame = 0;
  /** Pixels per normalized brain-shape unit; recomputed whenever the pane resizes. */
  private brainScale = 0;
  /** Set once the container has reported a real (non-collapsed) size — see resize(). */
  private sized = false;

  private activeId: string | null = null;
  private hovered: SimNode | null = null;
  /** Stays set to the last hovered node while `hoverMix` eases back to 0, so the
   *  neighbour highlight fades out instead of vanishing the instant the pointer leaves. */
  private highlightNode: SimNode | null = null;
  private hoverMix = 0;
  private hoverFrame = 0;
  private dragging: SimNode | null = null;
  private panning: { x: number; y: number } | null = null;
  private moved = false;
  /** Once the reader pans or zooms, stop re-framing the view under them. */
  private userFramed = false;

  private folders = new Set<string>();
  private tags = new Set<string>();
  private showUnresolved = true;
  private showNew = true;
  private hops = 0; // 0 = whole vault
  private colorMode: ColorMode = readColorMode();
  /** folder path / note type -> categorical slot, fixed for the whole session (never re-ranked). */
  private readonly folderSlot: Map<string, number>;
  private readonly typeSlot: Map<string, number>;
  private readonly legend = document.createElement('ul');

  constructor(opts: GraphOptions) {
    this.opts = opts;
    this.nodes = opts.data.nodes.map((ref) => ({ ref }));
    this.byId = new Map(this.nodes.map((node) => [node.ref.id, node]));
    this.neighbours = buildAdjacency(opts.data);
    this.folderSlot = assignFolderSlots(opts.data);
    this.typeSlot = assignTypeSlots(opts.data);

    this.canvas.className = 'graph-canvas';
    this.canvas.setAttribute('role', 'application');
    this.canvas.setAttribute('aria-label', 'Note graph. Use the file explorer for keyboard navigation.');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is unavailable');
    this.ctx = ctx;

    this.legend.className = 'graph-legend';
    opts.container.append(this.buildToolbar(), this.canvas, this.legend);

    this.readTheme();
    this.renderLegend();
    this.bindPointer();

    new ResizeObserver(() => this.resize()).observe(opts.container);
    new MutationObserver(() => {
      this.readTheme();
      this.renderLegend();
      this.draw();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // On mobile the graph pane starts hidden (display: none) behind the Files/Note
    // tabs, so the container has no real size yet — resize() itself does the first
    // rebuild once it sees genuine dimensions, whether that's now or on tab switch.
    this.resize();
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
    this.chaseFrame = 0; // a fit overrides any in-flight wheel-zoom chase
    if (!animate) {
      this.transform = target;
      this.targetTransform = target;
      this.draw();
      return;
    }
    const from = { ...this.transform };
    const start = performance.now();
    const token = ++this.fitToken;
    const step = (now: number) => {
      if (token !== this.fitToken) return; // superseded by a newer fit()
      const t = Math.min(1, (now - start) / 320);
      const e = t * (2 - t);
      this.transform = {
        k: from.k + (target.k - from.k) * e,
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
      };
      this.targetTransform = this.transform;
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

    const colourWrap = document.createElement('label');
    colourWrap.className = 'graph-field';
    colourWrap.innerHTML = '<span>Colour</span>';
    const colour = document.createElement('select');
    colour.innerHTML =
      '<option value="role">Role</option><option value="folder">Folder</option><option value="type">Type</option>';
    colour.value = this.colorMode;
    colour.title = 'Colour nodes by role, by the folder they live in, or by their frontmatter type';
    colour.addEventListener('change', () => {
      this.colorMode = colour.value as ColorMode;
      writeColorMode(this.colorMode);
      this.renderLegend();
      this.draw();
    });
    colourWrap.append(colour);

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
    bar.append(hopsWrap, colourWrap, unresolved, fit, this.countEl);

    if (this.opts.newIds.size) {
      const newToggle = document.createElement('label');
      newToggle.className = 'graph-check graph-check-new';
      const newBox = document.createElement('input');
      newBox.type = 'checkbox';
      newBox.checked = this.showNew;
      newBox.title = 'Ring notes added since your last visit';
      newBox.addEventListener('change', () => {
        this.showNew = newBox.checked;
        this.renderLegend();
        this.draw();
      });
      newToggle.append(newBox, document.createTextNode(`New (${this.opts.newIds.size})`));
      bar.append(newToggle);
    }

    return bar;
  }

  /**
   * Identity is never carried by colour alone: the legend is always present, node
   * labels appear on hover and at moderate zoom, and the file tree names every note.
   */
  private renderLegend(): void {
    const entry = (swatch: string, label: string) =>
      `<li><span class="swatch" style="${swatch}"></span>${escapeHtml(label)}</li>`;
    const ring = `background:${this.theme.surface};box-shadow:inset 0 0 0 2.5px ${this.theme.active}`;
    const newEntry =
      this.showNew && this.opts.newIds.size
        ? entry(`background:${this.theme.surface};box-shadow:inset 0 0 0 2px ${this.theme.new}`, 'New since last visit')
        : null;

    if (this.colorMode === 'role') {
      this.legend.innerHTML = [
        entry(`background:${this.theme.node}`, 'Note'),
        entry(`background:${this.theme.active}`, 'Open note'),
        entry(`background:${this.theme.surface};border:1.5px dashed ${this.theme.unresolved}`, 'Unresolved link'),
        newEntry,
      ]
        .filter(Boolean)
        .join('');
      return;
    }

    const isType = this.colorMode === 'type';
    const slotMap = isType ? this.typeSlot : this.folderSlot;
    const slots = [...slotMap.entries()].sort((a, b) => a[1] - b[1]);
    const rows = slots.map(([key, slot]) =>
      entry(`background:${this.theme.series[slot]}`, isType ? key : key || '(root)'),
    );
    if (this.hasOther(slotMap)) {
      rows.push(entry(`background:${this.theme.other}`, isType ? 'No type' : 'Other folders'));
    }
    rows.push(entry(ring, 'Open note'));
    rows.push(
      entry(`background:${this.theme.surface};border:1.5px dashed ${this.theme.unresolved}`, 'Unresolved link'),
    );
    if (newEntry) rows.push(newEntry);
    this.legend.innerHTML = rows.join('');
  }

  private hasOther(slotMap: Map<string, number>): boolean {
    const key = this.colorMode === 'type' ? (n: GraphNode) => n.noteType ?? '' : (n: GraphNode) => n.folder ?? '';
    return this.opts.data.nodes.some((node) => node.kind === 'note' && !slotMap.has(key(node)));
  }

  private fillFor(node: GraphNode): string {
    if (this.colorMode === 'role') {
      return node.id === this.activeId ? this.theme.active : this.theme.node;
    }
    const slotMap = this.colorMode === 'type' ? this.typeSlot : this.folderSlot;
    const key = this.colorMode === 'type' ? node.noteType ?? '' : node.folder ?? '';
    const slot = slotMap.get(key);
    return slot === undefined ? this.theme.other : this.theme.series[slot];
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
    assignBrainTargets(this.visible, this.width, this.height, this.brainScale);

    this.links = this.opts.data.edges
      .filter((edge) => keep.has(edge.s) && keep.has(edge.t))
      .map((edge) => ({
        source: this.nodes[edge.s],
        target: this.nodes[edge.t],
        type: edge.type,
      }));

    this.countEl.textContent = `${this.visible.length} notes · ${this.links.length} links`;

    this.simulation?.stop();
    let settleTicks = 0;
    this.simulation = forceSimulation(this.visible)
      .force(
        'link',
        forceLink<SimNode, SimLink>(this.links)
          .distance((link) => 54 + 7 * Math.min(8, (link.source.ref.deg + link.target.ref.deg) / 2))
          .strength(0.3),
      )
      .force('charge', forceManyBody<SimNode>().strength(-320).distanceMax(800))
      // Padded well past the circle itself so a label hanging below one node
      // has room before it runs into its neighbour.
      .force('collide', forceCollide<SimNode>((node) => radiusOf(node.ref) + 22))
      // Each node eases toward its own point inside a brain-shaped silhouette (two
      // hemispheres + corpus callosum + cerebellum + stem, assigned in `rebuild()`)
      // rather than a single centre — the whole layout's outline reads as a brain
      // while charge/collide/link still give the interior its usual organic feel.
      .force('brainX', forceX<SimNode>((node) => node.bx ?? this.width / 2).strength(0.45))
      .force('brainY', forceY<SimNode>((node) => node.by ?? this.height / 2).strength(0.45))
      .alpha(initial ? 1 : 0.7)
      .alphaDecay(0.05)
      .velocityDecay(0.34)
      .on('tick', () => {
        this.draw();
        // Re-target the camera every few ticks while the layout is still moving, so
        // it visibly tracks the graph unfolding instead of sitting on a stale frame
        // (fit()'s own tween just gets superseded smoothly — see the token guard).
        if (!this.userFramed && ++settleTicks % 8 === 0) this.fit(true);
      })
      .on('end', () => {
        if (!this.userFramed) this.fit(true);
      });

    // The brain-shape targets pull nodes across a wider spread than a single centre
    // point did, so a short warm-up left most of the growth to happen live on screen —
    // several seconds of the camera continuously zooming out to keep chasing a still-
    // expanding bounding box, which read as unsettled rather than fluid. A longer
    // warm-up gets most of that expansion done before the first paint, leaving only a
    // brief, quick tail to settle on screen.
    this.simulation.tick(initial ? 45 : 8);
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
    this.brainScale =
      Math.min(this.width / (BRAIN_HALF_X * 2), this.height / (BRAIN_HALF_Y * 2)) * 0.86;

    // The very first time the container reports a real (non-collapsed) size — whether
    // that's immediately, or only once a hidden mobile tab is switched to — do the
    // actual first build here. Starting the simulation earlier, at a 0×0 placeholder
    // size, would let charge repulsion at near-zero separation fling nodes out
    // chaotically before there's a real shape to settle into.
    const justSized = !this.sized && this.width > 2 && this.height > 2;
    if (justSized) this.sized = true;
    if (justSized) {
      this.rebuild(true);
      return;
    }

    if (changed && this.visible.length) {
      // The brain-shape targets are absolute pixel points sized to the old pane —
      // stale the moment it resizes, so every visible node needs a fresh one before
      // the simulation is nudged back awake to ease toward it.
      assignBrainTargets(this.visible, this.width, this.height, this.brainScale);
      this.simulation?.alpha(0.3).restart();
      if (!this.userFramed) this.fit(false);
    } else {
      this.draw();
    }
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
      other: pick('--graph-other', '#6f6f68'),
      new: pick('--new', '#1baf7a'),
      series: Array.from({ length: SERIES_SLOTS }, (_, i) => pick(`--series-${i + 1}`, '#2a78d6')),
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
    const mix = highlight ? this.hoverMix : 0; // 0 = no dim, 1 = fully dimmed non-neighbours

    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    // Edges
    ctx.lineWidth = 1 / t.k;
    for (const link of this.links) {
      const inSet = !highlight || (highlight.has(link.source.ref.i) && highlight.has(link.target.ref.i));
      ctx.strokeStyle = inSet && mix > 0.5 ? theme.edgeStrong : theme.edge;
      ctx.globalAlpha = inSet ? 0.9 : lerp(0.9, 0.12, mix);
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
      const inSet = !highlight || highlight.has(node.ref.i);
      const isActive = node.ref.id === this.activeId;
      const radius = radiusOf(node.ref);
      ctx.globalAlpha = inSet ? 1 : lerp(1, 0.22, mix);
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
        ctx.fillStyle = inSet ? this.fillFor(node.ref) : theme.nodeMuted;
        ctx.fill();
        if (this.colorMode === 'folder' || this.colorMode === 'type') {
          // Some categorical hues sit under 3:1 against a light surface; a hairline
          // keeps every node's shape readable regardless of its fill.
          ctx.lineWidth = 1 / t.k;
          ctx.strokeStyle = theme.edgeStrong;
          ctx.globalAlpha = inSet ? 0.55 : lerp(0.55, 0.16, mix);
          ctx.stroke();
          ctx.globalAlpha = inSet ? 1 : lerp(1, 0.22, mix);
        }
        if (isActive || node === this.hovered) {
          ctx.lineWidth = 2.5 / t.k;
          ctx.strokeStyle = theme.surface;
          ctx.stroke();
          ctx.lineWidth = (isActive ? 2.5 : 1.5) / t.k;
          ctx.strokeStyle = isActive ? theme.active : this.fillFor(node.ref);
          ctx.stroke();
        }
        if (this.showNew && this.opts.newIds.has(node.ref.id)) {
          ctx.setLineDash([2 / t.k, 2 / t.k]);
          ctx.lineWidth = 2 / t.k;
          ctx.strokeStyle = theme.new;
          ctx.globalAlpha = inSet ? 1 : lerp(1, 0.4, mix);
          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, radius + 4 / t.k, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = inSet ? 1 : lerp(1, 0.22, mix);
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    this.paintLabels(highlight, mix);
  }

  private paintLabels(highlight: Set<number> | null, mix: number): void {
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
      // Wait until the dim is more than half faded in before hiding unrelated labels,
      // so they don't pop off before the neighbour highlight has visually registered.
      if (highlight && mix > 0.5 && !near && !emphasised) continue;

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

  /** Keyed off `highlightNode`, not `hovered` — it must outlive the pointer leaving
   *  the node so the dim effect has something to fade out from. */
  private highlightSet(): Set<number> | null {
    if (!this.highlightNode) return null;
    const set = new Set<number>([this.highlightNode.ref.i]);
    for (const neighbour of this.neighbours.get(this.highlightNode.ref.i) ?? []) {
      if (this.visibleSet.has(neighbour)) set.add(neighbour);
    }
    return set;
  }

  /** Eases `hoverMix` toward 1 (hovering something) or 0 (not), redrawing each step. */
  private startHoverEase(): void {
    if (this.hoverFrame) return;
    const step = () => {
      const target = this.hovered ? 1 : 0;
      this.hoverMix += (target - this.hoverMix) * 0.28;
      if (Math.abs(target - this.hoverMix) < 0.01) {
        this.hoverMix = target;
        this.hoverFrame = 0;
        if (target === 0) this.highlightNode = null;
        this.draw();
        return;
      }
      this.draw();
      this.hoverFrame = requestAnimationFrame(step);
    };
    this.hoverFrame = requestAnimationFrame(step);
  }

  /** Eases `transform` toward `targetTransform` every frame — the wheel handler only
   *  ever moves the target, so a burst of scroll events reads as one continuous glide. */
  private startZoomChase(): void {
    if (this.chaseFrame) return;
    const step = () => {
      const dk = this.targetTransform.k - this.transform.k;
      const dx = this.targetTransform.x - this.transform.x;
      const dy = this.targetTransform.y - this.transform.y;
      if (Math.abs(dk) < 0.0004 && Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) {
        this.transform = { ...this.targetTransform };
        this.chaseFrame = 0;
        this.draw();
        return;
      }
      this.transform = {
        k: this.transform.k + dk * 0.35,
        x: this.transform.x + dx * 0.35,
        y: this.transform.y + dy * 0.35,
      };
      this.draw();
      this.chaseFrame = requestAnimationFrame(step);
    };
    this.chaseFrame = requestAnimationFrame(step);
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
        this.userFramed = true; // a manually placed node should not get re-centred away
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
        this.targetTransform = this.transform;
        this.draw();
        return;
      }
      const hit = this.nodeAt(event);
      if (hit !== this.hovered) {
        this.hovered = hit;
        if (hit) this.highlightNode = hit;
        this.startHoverEase();
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
        this.startHoverEase();
      }
    });

    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.userFramed = true;
        this.fitToken += 1; // a manual zoom cancels any fit() tween in flight
        const rect = canvas.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.02 : 0.0016));
        // Compound off the current target (not the still-catching-up transform) so a
        // fast burst of wheel ticks accumulates smoothly instead of fighting the chase.
        const base = this.targetTransform;
        const k = clamp(base.k * factor, MIN_ZOOM, MAX_ZOOM);
        const scale = k / base.k;
        this.targetTransform = {
          k,
          x: px - (px - base.x) * scale,
          y: py - (py - base.y) * scale,
        };
        this.startZoomChase();
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

/**
 * Folders claim categorical slots by note count once, at load. Ranking never changes
 * afterwards, so filtering the graph cannot repaint the folders that survive.
 */
function assignFolderSlots(data: GraphData): Map<string, number> {
  const counts = new Map<string, number>();
  for (const node of data.nodes) {
    if (node.kind !== 'note') continue;
    const folder = node.folder ?? '';
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  return new Map(
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, SERIES_SLOTS)
      .map(([folder], index) => [folder, index]),
  );
}

/**
 * Same idea as `assignFolderSlots`, keyed by frontmatter `type:` instead. Notes with
 * no type are left out of the map entirely, so they fall to fillFor()'s "Other" —
 * an absent value isn't a category the vault author chose, and shouldn't get one.
 */
function assignTypeSlots(data: GraphData): Map<string, number> {
  const counts = new Map<string, number>();
  for (const node of data.nodes) {
    if (node.kind !== 'note' || !node.noteType) continue;
    counts.set(node.noteType, (counts.get(node.noteType) ?? 0) + 1);
  }
  return new Map(
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, SERIES_SLOTS)
      .map(([type], index) => [type, index]),
  );
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

interface BrainRegion {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/**
 * A brain silhouette as a union of ellipses in a normalized [-1, 1]-ish space: two
 * hemisphere lobes separated by a gap (the longitudinal fissure) up top, a bridging
 * region low in the middle where they anatomically connect (the fissure doesn't run
 * the full height), twin cerebellum lobes underneath, and a brainstem tail.
 */
const BRAIN_REGIONS: BrainRegion[] = [
  { cx: -0.52, cy: -0.08, rx: 0.42, ry: 0.58 }, // left hemisphere
  { cx: 0.52, cy: -0.08, rx: 0.42, ry: 0.58 }, // right hemisphere
  { cx: 0, cy: 0.28, rx: 0.14, ry: 0.22 }, // corpus callosum bridge (closes the fissure low down only)
  { cx: -0.22, cy: 0.72, rx: 0.22, ry: 0.16 }, // left cerebellum lobe
  { cx: 0.22, cy: 0.72, rx: 0.22, ry: 0.16 }, // right cerebellum lobe
  { cx: 0, cy: 1, rx: 0.07, ry: 0.14 }, // brainstem
];
const BRAIN_HALF_X = 1;
const BRAIN_HALF_Y = 1.16;

function insideBrain(x: number, y: number): boolean {
  for (const r of BRAIN_REGIONS) {
    const ex = (x - r.cx) / r.rx;
    const ey = (y - r.cy) / r.ry;
    if (ex * ex + ey * ey <= 1) return true;
  }
  return false;
}

/**
 * Deterministic jittered-grid sample of `count` points spread evenly across the brain
 * silhouette (normalized units). A plain random scatter clumps noticeably at this size;
 * a jittered grid reads as even coverage while still avoiding a rigid, obviously-gridded
 * look. Resolution grows until there are enough in-shape candidates to draw `count` from.
 */
function sampleBrainPoints(count: number): { x: number; y: number }[] {
  if (count <= 0) return [];
  const x0 = -1.02;
  const x1 = 1.02;
  const y0 = -0.75;
  const y1 = 1.1;
  let resolution = Math.max(4, Math.ceil(Math.sqrt((count * 2.4) / ((x1 - x0) * (y1 - y0)))));
  let points: { x: number; y: number }[] = [];
  let seed = 1;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let attempt = 0; attempt < 6 && points.length < count; attempt += 1) {
    points = [];
    seed = 1;
    const cell = Math.min(x1 - x0, y1 - y0) / resolution;
    const cols = Math.ceil((x1 - x0) / cell);
    const rows = Math.ceil((y1 - y0) / cell);
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x = x0 + (c + 0.3 + rand() * 0.4) * cell;
        const y = y0 + (r + 0.3 + rand() * 0.4) * cell;
        if (insideBrain(x, y)) points.push({ x, y });
      }
    }
    resolution = Math.ceil(resolution * 1.4);
  }
  // Fisher-Yates with a small deterministic PRNG so the exact `count` points drawn from
  // the candidate pool are spread through it, not just the first ones scanned.
  for (let i = points.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [points[i], points[j]] = [points[j], points[i]];
  }
  return points.slice(0, count);
}

/**
 * Gives each node a fixed point inside the brain silhouette to ease toward (`bx`/`by`),
 * greedily matched to whichever node currently sits closest to it — this keeps the
 * reassignment on every rebuild from sending nodes on long unnecessary journeys across
 * the shape when the visible set only changed a little.
 */
function assignBrainTargets(nodes: SimNode[], width: number, height: number, scale: number): void {
  if (!scale) return;
  const cx = width / 2;
  const cy = height / 2;
  const targets = sampleBrainPoints(nodes.length).map((p) => ({
    x: cx + p.x * scale,
    y: cy + p.y * scale,
  }));
  const remaining = targets.slice();
  for (const node of nodes) {
    const nx = node.x ?? cx;
    const ny = node.y ?? cy;
    let bestJ = 0;
    let bestD = Infinity;
    for (let j = 0; j < remaining.length; j += 1) {
      const dx = remaining[j].x - nx;
      const dy = remaining[j].y - ny;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        bestJ = j;
      }
    }
    const target = remaining.splice(bestJ, 1)[0];
    node.bx = target.x;
    node.by = target.y;
  }
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

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

function readColorMode(): ColorMode {
  const stored = localStorage.getItem(COLOR_KEY);
  return stored === 'folder' || stored === 'type' || stored === 'role' ? stored : 'type';
}

function writeColorMode(mode: ColorMode): void {
  try {
    localStorage.setItem(COLOR_KEY, mode);
  } catch {
    /* private mode: the choice just is not remembered */
  }
}
