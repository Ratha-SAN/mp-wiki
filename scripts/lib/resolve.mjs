// Link parsing + Obsidian-compatible resolution.
//
// Resolution order (matches how Obsidian picks a target):
//   1. exact path from the vault root
//   2. path relative to the linking note
//   3. filename match anywhere in the vault (shortest path wins, same folder first)
// All comparisons are case-insensitive, and a missing extension implies ".md".

import {
  baseOf,
  dirOf,
  extOf,
  isExternalTarget,
  joinVaultPath,
  normalizeVaultPath,
  stripExt,
} from './paths.mjs';

const NOTE_EXTENSIONS = new Set(['md', 'markdown']);

/**
 * Split the inside of a `[[...]]` into its parts.
 * `[[folder/Note#Heading|Display]]` -> { target, anchor, blockRef, alias }
 * `[[Note#^abc123]]`                -> blockRef: 'abc123'
 */
export function parseWikiTarget(raw) {
  let rest = String(raw);
  let alias = null;

  const pipe = rest.indexOf('|');
  if (pipe !== -1) {
    alias = rest.slice(pipe + 1).trim();
    rest = rest.slice(0, pipe);
  }

  let anchor = null;
  let blockRef = null;
  const hash = rest.indexOf('#');
  if (hash !== -1) {
    const frag = rest.slice(hash + 1).trim();
    rest = rest.slice(0, hash);
    if (frag.startsWith('^')) blockRef = frag.slice(1);
    // Obsidian allows `#Heading#Subheading`; the last segment is what you land on.
    else if (frag) anchor = frag.split('#').pop().trim();
  }

  return { target: rest.trim(), anchor, blockRef, alias: alias || null };
}

/**
 * Split a Markdown link destination into path + fragment, URL-decoding the path.
 * `../Imaging/CT%20Physics.md#detectors` -> { target, anchor }
 */
export function parseMarkdownTarget(raw) {
  let dest = String(raw).trim();
  if (dest.startsWith('<') && dest.endsWith('>')) dest = dest.slice(1, -1);

  let anchor = null;
  let blockRef = null;
  const hash = dest.indexOf('#');
  if (hash !== -1) {
    const frag = dest.slice(hash + 1);
    dest = dest.slice(0, hash);
    if (frag.startsWith('^')) blockRef = frag.slice(1);
    else if (frag) anchor = frag;
  }

  let target = dest;
  try {
    target = decodeURIComponent(dest);
  } catch {
    /* malformed percent-escapes: fall back to the raw text */
  }
  return { target: target.trim(), anchor, blockRef, alias: null };
}

export class VaultIndex {
  /**
   * @param {string[]} files every vault-relative file path (notes *and* assets)
   * @param {{imageExtensions?: string[], fileExtensions?: string[]}} [opts]
   */
  constructor(files, opts = {}) {
    this.files = files.map(normalizeVaultPath);
    this.images = new Set(opts.imageExtensions ?? []);
    this.attachments = new Set(opts.fileExtensions ?? []);

    /** lowercase full path -> real path */
    this.byPath = new Map();
    /** lowercase "path/without/extension" -> real paths */
    this.byPathNoExt = new Map();
    /** lowercase basename without extension -> real paths */
    this.byBasename = new Map();

    for (const file of this.files) {
      const lower = file.toLowerCase();
      if (!this.byPath.has(lower)) this.byPath.set(lower, file);
      push(this.byPathNoExt, stripExt(lower), file);
      push(this.byBasename, stripExt(baseOf(lower)), file);
    }
  }

  kindOf(path) {
    const ext = extOf(path);
    if (NOTE_EXTENSIONS.has(ext)) return 'note';
    if (this.images.has(ext)) return 'image';
    if (this.attachments.has(ext)) return 'file';
    return 'file';
  }

  /**
   * @param {string} target link text with alias/anchor already stripped
   * @param {string} fromPath vault-relative path of the linking note
   * @returns {{path: string, kind: 'note'|'image'|'file'}|null}
   */
  resolve(target, fromPath) {
    if (!target || isExternalTarget(target)) return null;

    const clean = normalizeVaultPath(target);
    if (!clean) return null;

    const fromDir = dirOf(normalizeVaultPath(fromPath));
    const hasExt = extOf(clean) !== '';

    // 1 + 2: exact path from root, then relative to the linking note.
    const bases = [clean, joinVaultPath(fromDir, clean)];
    for (const base of bases) {
      const hit = hasExt
        ? this.byPath.get(base.toLowerCase())
        : this.byPath.get(`${base}.md`.toLowerCase()) ??
          this.byPath.get(`${base}.markdown`.toLowerCase());
      if (hit) return { path: hit, kind: this.kindOf(hit) };
    }
    // A path without an extension may still name a real file ("Attachments/scan").
    if (!hasExt) {
      for (const base of bases) {
        const hit = this.byPath.get(base.toLowerCase());
        if (hit) return { path: hit, kind: this.kindOf(hit) };
      }
    }

    // 3: filename (or trailing path fragment) match anywhere in the vault.
    const key = hasExt ? clean.toLowerCase() : stripExt(clean.toLowerCase());
    const bucket = hasExt ? this.byPath : this.byPathNoExt;
    let candidates = collect(bucket, key);
    if (!candidates.length && clean.includes('/')) {
      candidates = this.files.filter((f) => {
        const cmp = (hasExt ? f : stripExt(f)).toLowerCase();
        return cmp.endsWith(`/${key}`);
      });
    }
    if (!candidates.length && !clean.includes('/')) {
      candidates = collect(this.byBasename, stripExt(baseOf(clean.toLowerCase())));
    }
    if (!candidates.length) return null;

    const best = pickBest(candidates, fromDir);
    return { path: best, kind: this.kindOf(best) };
  }
}

function push(map, key, value) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function collect(map, key) {
  const list = map.get(key);
  return list ? [...list] : [];
}

/** Same folder first, then shortest path, then alphabetical so builds are stable. */
function pickBest(candidates, fromDir) {
  const score = (p) => {
    const sameFolder = dirOf(p).toLowerCase() === fromDir.toLowerCase() ? 0 : 1;
    const isNote = NOTE_EXTENSIONS.has(extOf(p)) ? 0 : 1;
    return [sameFolder, isNote, p.split('/').length, p.toLowerCase()];
  };
  return [...candidates].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i += 1) {
      if (sa[i] < sb[i]) return -1;
      if (sa[i] > sb[i]) return 1;
    }
    return 0;
  })[0];
}
