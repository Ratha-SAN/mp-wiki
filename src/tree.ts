import type { GraphData, TreeEntry } from './types';

interface TreeOptions {
  tree: HTMLElement;
  results: HTMLElement;
  search: HTMLInputElement;
  data: GraphData;
  newIds: Set<string>;
  onOpen: (id: string) => void;
}

interface SearchItem {
  id: string;
  title: string;
  path: string;
  haystack: string;
  titleLower: string;
}

const STORAGE_KEY = 'mp-wiki:collapsed';

export class FileTree {
  private readonly opts: TreeOptions;
  private readonly collapsed: Set<string>;
  private readonly rows = new Map<string, HTMLButtonElement>();
  private readonly items: SearchItem[] = [];
  private activeId: string | null = null;

  constructor(opts: TreeOptions) {
    this.opts = opts;
    this.collapsed = new Set(readStored());

    collectNotes(opts.data.folders, this.items);
    this.renderTree();

    opts.search.addEventListener('input', () => this.runSearch());
    opts.search.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        opts.search.value = '';
        this.runSearch();
      }
      if (event.key === 'Enter') {
        const first = opts.results.querySelector<HTMLButtonElement>('button');
        first?.click();
      }
    });
  }

  setActive(id: string | null): void {
    if (this.activeId) this.rows.get(this.activeId)?.classList.remove('is-active');
    this.activeId = id;
    if (!id) return;
    const row = this.rows.get(id);
    if (!row) return;
    row.classList.add('is-active');
    this.expandAncestors(id);
    row.scrollIntoView({ block: 'nearest' });
  }

  focusSearch(): void {
    this.opts.search.focus();
    this.opts.search.select();
  }

  /* ------------------------------------------------------------- rendering */

  private renderTree(): void {
    this.opts.tree.replaceChildren(this.buildList(this.opts.data.folders, 0));
  }

  private buildList(entries: TreeEntry[], depth: number): HTMLUListElement {
    const list = document.createElement('ul');
    list.className = 'tree-list';
    list.setAttribute('role', 'group');

    for (const entry of entries) {
      const item = document.createElement('li');
      item.className = `tree-item tree-${entry.type}`;
      item.setAttribute('role', 'treeitem');

      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'tree-row';
      row.style.setProperty('--depth', String(depth));

      if (entry.type === 'folder') {
        item.dataset.path = entry.path;
        const isCollapsed = this.collapsed.has(entry.path);
        item.setAttribute('aria-expanded', String(!isCollapsed));
        row.innerHTML = `<span class="twisty" aria-hidden="true"></span><span class="tree-label">${escapeHtml(entry.name)}</span><span class="tree-count">${countNotes(entry)}</span>`;
        row.addEventListener('click', () => this.toggleFolder(entry.path, item));

        const children = this.buildList(entry.children ?? [], depth + 1);
        if (isCollapsed) children.hidden = true;
        item.append(row, children);
      } else {
        const isNew = this.opts.newIds.has(entry.id!);
        row.innerHTML = `<span class="dot" aria-hidden="true"></span><span class="tree-text"><span class="tree-label">${escapeHtml(entry.name)}</span><span class="tree-filename">${escapeHtml(basename(entry.path))}</span></span>${isNew ? '<span class="new-dot" title="Added since your last visit"></span>' : ''}`;
        row.title = entry.path;
        row.addEventListener('click', () => this.opts.onOpen(entry.id!));
        this.rows.set(entry.id!, row);
        item.append(row);
      }

      list.append(item);
    }
    return list;
  }

  private toggleFolder(path: string, item: HTMLElement): void {
    const children = item.querySelector<HTMLElement>(':scope > .tree-list');
    const nowCollapsed = !this.collapsed.has(path);
    if (nowCollapsed) this.collapsed.add(path);
    else this.collapsed.delete(path);
    if (children) children.hidden = nowCollapsed;
    item.setAttribute('aria-expanded', String(!nowCollapsed));
    writeStored([...this.collapsed]);
  }

  private expandAncestors(id: string): void {
    const row = this.rows.get(id);
    let node = row?.parentElement?.parentElement?.closest<HTMLElement>('.tree-folder');
    let changed = false;
    while (node) {
      const list = node.querySelector<HTMLElement>(':scope > .tree-list');
      const path = folderPathOf(node);
      if (path && this.collapsed.has(path)) {
        this.collapsed.delete(path);
        changed = true;
      }
      if (list) list.hidden = false;
      node.setAttribute('aria-expanded', 'true');
      node = node.parentElement?.closest<HTMLElement>('.tree-folder') ?? null;
    }
    if (changed) writeStored([...this.collapsed]);
  }

  /* ---------------------------------------------------------------- search */

  private runSearch(): void {
    const query = this.opts.search.value.trim().toLowerCase();
    const { results, tree } = this.opts;

    if (!query) {
      results.hidden = true;
      tree.hidden = false;
      results.replaceChildren();
      return;
    }

    const terms = query.split(/\s+/);
    const scored = this.items
      .map((item) => ({ item, score: scoreItem(item, terms) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.item.path.localeCompare(b.item.path))
      .slice(0, 200);

    tree.hidden = true;
    results.hidden = false;
    results.replaceChildren(
      ...scored.map(({ item }) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'result-row';
        if (item.id === this.activeId) button.classList.add('is-active');
        const isNew = this.opts.newIds.has(item.id);
        button.innerHTML = `<span class="result-title">${highlight(item.title, terms)}${isNew ? '<span class="new-dot" title="Added since your last visit"></span>' : ''}</span><span class="result-path">${highlight(item.path, terms)}</span>`;
        button.addEventListener('click', () => this.opts.onOpen(item.id));
        li.append(button);
        return li;
      }),
    );

    if (!scored.length) {
      const empty = document.createElement('li');
      empty.className = 'result-empty';
      empty.textContent = 'No matching notes';
      results.append(empty);
    }
  }
}

function scoreItem(item: SearchItem, terms: string[]): number {
  let total = 0;
  for (const term of terms) {
    if (!item.haystack.includes(term)) return 0;
    if (item.titleLower.startsWith(term)) total += 6;
    else if (item.titleLower.includes(term)) total += 4;
    else total += 1;
  }
  return total;
}

function collectNotes(entries: TreeEntry[], into: SearchItem[]): void {
  for (const entry of entries) {
    if (entry.type === 'note' && entry.id) {
      into.push({
        id: entry.id,
        title: entry.name,
        path: entry.path,
        titleLower: entry.name.toLowerCase(),
        haystack: `${entry.name} ${entry.path}`.toLowerCase(),
      });
    } else if (entry.children) {
      collectNotes(entry.children, into);
    }
  }
}

function countNotes(entry: TreeEntry): number {
  if (entry.type === 'note') return 1;
  return (entry.children ?? []).reduce((sum, child) => sum + countNotes(child), 0);
}

function folderPathOf(item: HTMLElement): string | null {
  const row = item.querySelector<HTMLElement>(':scope > .tree-row .tree-label');
  return row ? (item.dataset.path ?? row.textContent) : null;
}

function basename(path: string): string {
  const at = path.lastIndexOf('/');
  return at === -1 ? path : path.slice(at + 1);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

function highlight(value: string, terms: string[]): string {
  const ranges: [number, number][] = [];
  const lower = value.toLowerCase();
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(term, from);
      if (at === -1) break;
      ranges.push([at, at + term.length]);
      from = at + term.length;
    }
  }
  if (!ranges.length) return escapeHtml(value);
  ranges.sort((a, b) => a[0] - b[0]);

  let out = '';
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start < cursor) continue;
    out += escapeHtml(value.slice(cursor, start));
    out += `<mark>${escapeHtml(value.slice(start, end))}</mark>`;
    cursor = end;
  }
  return out + escapeHtml(value.slice(cursor));
}

function readStored(): string[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function writeStored(value: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* private mode: collapse state is not persisted */
  }
}
