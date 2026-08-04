import 'katex/dist/katex.min.css';
import './styles.css';

import { loadGraph } from './data';
import { GraphView } from './graph';
import { Reader } from './reader';
import { FileTree } from './tree';
import type { GraphData } from './types';

const THEME_KEY = 'mp-wiki:theme';
const LAYOUT_KEY = 'mp-wiki:layout';

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
};

async function boot(): Promise<void> {
  setupTheme();

  let data: GraphData;
  try {
    data = await loadGraph();
  } catch (err) {
    el('note').innerHTML = `<div class="note-stub"><h1 class="note-title">No index found</h1>
      <p class="stub-note">Run <code>npm run build:index</code> to generate <code>wiki-data/graph.json</code>.</p>
      <p class="stub-note">${String((err as Error).message ?? err)}</p></div>`;
    return;
  }

  document.title = data.siteTitle;
  el('site-title').textContent = data.siteTitle;
  el('vault-stats').textContent =
    `${data.stats.notes} notes · ${data.stats.edges} links · ${data.stats.unresolved} unresolved`;

  if (!data.stats.notes) {
    el('note').innerHTML = `<div class="note-stub"><h1 class="note-title">Empty vault</h1>
      <p class="stub-note">No Markdown files were found under <code>${data.vaultPath}</code>.
      Point <code>vaultPath</code> in <code>wiki.config.json</code> at your notes and rebuild.</p></div>`;
    return;
  }

  const open = (id: string) => {
    const next = `#/n/${encodeURIComponent(id)}`;
    if (location.hash === next) render(id);
    else location.hash = next;
    if (window.matchMedia('(max-width: 900px)').matches) setView('reader');
  };

  const tree = new FileTree({
    tree: el('tree'),
    results: el('results'),
    search: el<HTMLInputElement>('search-input'),
    data,
    onOpen: open,
  });
  const reader = new Reader({
    article: el('note'),
    scroller: el('reader-scroll'),
    data,
    onOpen: open,
  });
  const graph = new GraphView({ container: el('pane-graph'), data, onOpen: open });

  const known = new Set(data.nodes.map((node) => node.id));
  const render = (id: string) => {
    void reader.show(id);
    tree.setActive(known.has(id) ? id : null);
    graph.setActive(known.has(id) ? id : null);
  };

  const fromHash = () => {
    const match = /^#\/n\/(.*)$/.exec(location.hash);
    const id = match ? safeDecode(match[1]) : data.home;
    if (id) render(id);
  };
  window.addEventListener('hashchange', fromHash);
  fromHash();

  setupLayout();
  setupTabs();

  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !isTyping(event.target)) {
      event.preventDefault();
      setView('files');
      tree.focusSearch();
    }
  });
}

/* -------------------------------------------------------------------- theme */

function setupTheme(): void {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') {
    document.documentElement.dataset.theme = stored;
  }
  const icon = el('theme-icon');
  const sync = () => {
    const dark = effectiveTheme() === 'dark';
    icon.textContent = dark ? '☾' : '☀';
  };
  sync();
  el('theme-toggle').addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
    sync();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sync);
}

function effectiveTheme(): 'light' | 'dark' {
  const attr = document.documentElement.dataset.theme;
  if (attr === 'light' || attr === 'dark') return attr;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/* ------------------------------------------------------------------- layout */

function setupLayout(): void {
  const panes = el('panes');
  const stored = readLayout();
  if (stored.files) panes.style.setProperty('--files-width', `${stored.files}px`);
  if (stored.graph) panes.style.setProperty('--graph-width', `${stored.graph}px`);

  drag(el('splitter-files'), (event) => {
    const width = clamp(event.clientX - panes.getBoundingClientRect().left, 180, 520);
    panes.style.setProperty('--files-width', `${width}px`);
    return { files: width };
  });
  drag(el('splitter-graph'), (event) => {
    const width = clamp(panes.getBoundingClientRect().right - event.clientX, 240, 900);
    panes.style.setProperty('--graph-width', `${width}px`);
    return { graph: width };
  });

  const toggle = el('sidebar-toggle');
  toggle.addEventListener('click', () => {
    const hidden = document.getElementById('app')!.classList.toggle('files-hidden');
    toggle.setAttribute('aria-pressed', String(!hidden));
  });
}

function drag(handle: HTMLElement, onMove: (event: PointerEvent) => Record<string, number>): void {
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('is-dragging');
    let latest: Record<string, number> = {};

    const move = (moveEvent: PointerEvent) => {
      latest = onMove(moveEvent);
    };
    const up = () => {
      handle.classList.remove('is-dragging');
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      writeLayout({ ...readLayout(), ...latest });
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
}

function readLayout(): { files?: number; graph?: number } {
  try {
    return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeLayout(value: { files?: number; graph?: number }): void {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/* --------------------------------------------------------------------- tabs */

function setupTabs(): void {
  document.querySelectorAll<HTMLButtonElement>('.tabbar button').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view!));
  });
}

function setView(view: string): void {
  const app = document.getElementById('app')!;
  app.dataset.view = view;
  document.querySelectorAll<HTMLButtonElement>('.tabbar button').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === view);
  });
}

function isTyping(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null;
  return !!node && /^(input|textarea|select)$/i.test(node.tagName);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

void boot();
