import { loadNote } from './data';
import type { GraphData, GraphNode, NoteDoc, NoteRef } from './types';

interface ReaderOptions {
  article: HTMLElement;
  scroller: HTMLElement;
  data: GraphData;
  onOpen: (id: string) => void;
}

export class Reader {
  private readonly opts: ReaderOptions;
  private readonly byId: Map<string, GraphNode>;
  private token = 0;

  constructor(opts: ReaderOptions) {
    this.opts = opts;
    this.byId = new Map(opts.data.nodes.map((node) => [node.id, node]));

    // Internal links are rendered as data-attributes so routing stays in one place.
    opts.article.addEventListener('click', (event) => {
      const anchor = (event.target as HTMLElement).closest('a');
      if (!anchor) return;

      const noteId = anchor.getAttribute('data-note');
      if (noteId) {
        event.preventDefault();
        this.opts.onOpen(noteId);
        const fragment = anchor.getAttribute('data-anchor') ?? blockAnchor(anchor);
        if (fragment) pendingFragment = fragment;
        return;
      }
      const unresolved = anchor.getAttribute('data-unresolved');
      if (unresolved !== null) {
        event.preventDefault();
        this.opts.onOpen(`!unresolved:${unresolved.trim().toLowerCase()}`);
        return;
      }
      if (anchor.classList.contains('anchor-link')) {
        event.preventDefault();
        this.scrollTo(anchor.getAttribute('href')!.slice(1));
      }
    });
  }

  async show(id: string): Promise<void> {
    const ticket = ++this.token;
    const node = this.byId.get(id);

    if (!node) {
      this.renderMessage('Not found', `No note or link named “${id}” is in this vault.`);
      return;
    }
    if (node.kind === 'unresolved') {
      this.renderUnresolved(node);
      return;
    }

    try {
      const doc = await loadNote(node.key!);
      if (ticket !== this.token) return;
      this.renderNote(doc);
    } catch (err) {
      if (ticket !== this.token) return;
      this.renderMessage('Could not load note', String((err as Error).message ?? err));
    }
  }

  private renderNote(doc: NoteDoc): void {
    const meta = document.createElement('header');
    meta.className = 'note-header';
    meta.innerHTML = `
      <p class="note-path">${escapeHtml(doc.path)}</p>
      <h1 class="note-title">${escapeHtml(doc.title)}</h1>
    `;
    if (doc.tags.length) {
      const tags = document.createElement('ul');
      tags.className = 'note-tags';
      tags.append(
        ...doc.tags.map((tag) => {
          const li = document.createElement('li');
          li.textContent = `#${tag}`;
          return li;
        }),
      );
      meta.append(tags);
    }

    const body = document.createElement('div');
    body.className = 'note-body';
    body.innerHTML = doc.html;

    // Vaults commonly repeat the filename as the first H1; the header already shows it.
    const lead = body.firstElementChild;
    if (lead?.tagName === 'H1' && lead.textContent?.trim() === doc.title.trim()) lead.remove();

    const footer = document.createElement('footer');
    footer.className = 'note-footer';
    footer.append(
      this.refList('Links to', doc.links),
      this.refList('Linked from', doc.backlinks),
    );

    this.opts.article.replaceChildren(meta, body, footer);
    this.afterRender();
  }

  private renderUnresolved(node: GraphNode): void {
    const sources = this.opts.data.edges
      .filter((edge) => this.opts.data.nodes[edge.t]?.id === node.id)
      .map((edge) => this.opts.data.nodes[edge.s])
      .filter(Boolean)
      .map<NoteRef>((source) => ({
        id: source.id,
        title: source.title,
        path: source.path,
        kind: source.kind,
        key: source.key,
      }));

    const wrap = document.createElement('div');
    wrap.className = 'note-stub';
    wrap.innerHTML = `
      <p class="note-path">unresolved link</p>
      <h1 class="note-title">${escapeHtml(node.title)}</h1>
      <p class="stub-note">Nothing in the vault resolves this link yet. It is drawn in the
      graph as a hollow node so the gap stays visible.</p>
    `;
    wrap.append(this.refList('Linked from', sources));

    this.opts.article.replaceChildren(wrap);
    this.afterRender();
  }

  private renderMessage(title: string, detail: string): void {
    const wrap = document.createElement('div');
    wrap.className = 'note-stub';
    wrap.innerHTML = `<h1 class="note-title">${escapeHtml(title)}</h1><p class="stub-note">${escapeHtml(detail)}</p>`;
    this.opts.article.replaceChildren(wrap);
    this.afterRender();
  }

  private refList(label: string, refs: NoteRef[]): HTMLElement {
    const section = document.createElement('section');
    section.className = 'refs';
    const heading = document.createElement('h2');
    heading.textContent = `${label} (${refs.length})`;
    section.append(heading);

    if (!refs.length) {
      const empty = document.createElement('p');
      empty.className = 'refs-empty';
      empty.textContent = 'None';
      section.append(empty);
      return section;
    }

    const list = document.createElement('ul');
    for (const ref of refs) {
      const li = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = ref.kind === 'unresolved' ? 'ref-row is-unresolved' : 'ref-row';
      button.innerHTML = `<span class="ref-title">${escapeHtml(ref.title)}</span>${
        ref.path ? `<span class="ref-path">${escapeHtml(ref.path)}</span>` : '<span class="ref-path">not written yet</span>'
      }`;
      button.addEventListener('click', () => this.opts.onOpen(ref.id));
      li.append(button);
      list.append(li);
    }
    section.append(list);
    return section;
  }

  private afterRender(): void {
    if (pendingFragment) {
      const fragment = pendingFragment;
      pendingFragment = null;
      requestAnimationFrame(() => this.scrollTo(fragment));
    } else {
      this.opts.scroller.scrollTop = 0;
    }
  }

  private scrollTo(fragment: string): void {
    const target = this.opts.article.querySelector(`#${CSS.escape(fragment)}`);
    if (!target) return;
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    target.classList.add('flash');
    setTimeout(() => target.classList.remove('flash'), 1200);
  }
}

let pendingFragment: string | null = null;

/** `data-block="x"` maps to the `block-x` id emitted by the build. */
function blockAnchor(anchor: Element): string | null {
  const block = anchor.getAttribute('data-block');
  return block ? `block-${block}` : null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
}
