#!/usr/bin/env node
// Walks the vault once and emits a static index the browser can load directly:
//
//   <outDir>/graph.json          notes + edges + folder tree + tags  (loaded first)
//   <outDir>/notes/<key>.json    rendered HTML per note              (loaded on click)
//   <outDir>/assets/<key>.<ext>  images referenced by notes
//
// The vault is only ever read from.

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import fg from 'fast-glob';
import matter from 'gray-matter';

import { createMarkdown, scanTokens } from './lib/markdown.mjs';
import { loadCreationDates } from './lib/git-history.mjs';
import { VaultIndex } from './lib/resolve.mjs';
import { baseOf, dirOf, extOf, prettifyTitle, slugifyHeading, stripExt } from './lib/paths.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const NOTE_GLOB = '**/*.{md,markdown}';

async function main() {
  const config = await loadConfig();
  const vaultDir = path.resolve(ROOT, config.vaultPath);
  const outDir = path.resolve(ROOT, config.outDir);

  await assertVault(vaultDir, config.vaultPath);

  const allFiles = await fg('**/*', {
    cwd: vaultDir,
    dot: false,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: config.exclude,
  });
  const notePaths = (
    await fg(NOTE_GLOB, {
      cwd: vaultDir,
      dot: false,
      onlyFiles: true,
      followSymbolicLinks: false,
      ignore: config.exclude,
    })
  ).sort();

  // --- pass 1: frontmatter, so unpublished notes disappear before link resolution
  const createdDates = loadCreationDates(ROOT, config.vaultPath);
  const notes = [];
  for (const relPath of notePaths) {
    const raw = await fs.readFile(path.join(vaultDir, relPath), 'utf8');
    let parsed;
    try {
      parsed = matter(raw);
    } catch (err) {
      console.warn(`  ! frontmatter error in ${relPath}: ${err.message}`);
      parsed = { data: {}, content: raw };
    }
    const data = parsed.data ?? {};
    if (data.publish === false || data.private === true || data.draft === true) continue;

    const id = stripExt(relPath);
    notes.push({
      id,
      key: keyFor(id),
      path: relPath,
      folder: dirOf(relPath),
      title: String(data.title ?? prettifyTitle(id)),
      frontmatter: data,
      body: parsed.content,
      tags: frontmatterTags(data),
      noteType: typeof data.type === 'string' && data.type.trim() ? data.type.trim() : null,
      createdAt: createdDates.get(relPath) ?? null,
    });
  }

  const published = new Set(notes.map((n) => n.path));
  const indexedFiles = allFiles.filter((f) => !isNote(f) || published.has(f));
  const vault = new VaultIndex(indexedFiles, config);
  const byPath = new Map(notes.map((n) => [n.path, n]));

  // --- pass 2: render, and collect edges from the token stream
  const md = createMarkdown();
  const nodes = new Map(); // id -> node record
  const edges = new Map(); // "s t type" -> edge record
  const assets = new Map(); // vault path -> output filename
  const unresolvedByNote = new Map();

  for (const note of notes) {
    nodes.set(note.id, {
      id: note.id,
      key: note.key,
      title: note.title,
      path: note.path,
      folder: note.folder,
      kind: 'note',
      tags: [...note.tags],
      noteType: note.noteType,
      createdAt: note.createdAt,
    });
  }

  for (const note of notes) {
    const env = {};
    const memo = new Map();
    const missing = new Set();

    const resolveDescriptor = (descriptor) => {
      const cacheKey = `${descriptor.target} ${descriptor.embed ? 1 : 0}`;
      if (memo.has(cacheKey)) return memo.get(cacheKey);

      const hit = vault.resolve(descriptor.target, note.path);
      let result;
      if (!hit) {
        result = { kind: 'unresolved', id: unresolvedId(descriptor.target), label: descriptor.target };
        missing.add(descriptor.target);
      } else if (hit.kind === 'note') {
        const target = byPath.get(hit.path);
        result = target
          ? { kind: 'note', id: target.id, path: target.path, label: target.title, href: `#/n/${encodeURIComponent(target.id)}` }
          : { kind: 'unresolved', id: unresolvedId(descriptor.target), label: descriptor.target };
      } else {
        const file = assetFileName(hit.path);
        if (config.copyAssets) assets.set(hit.path, file);
        result = {
          kind: hit.kind,
          id: hit.path,
          path: hit.path,
          label: baseOf(hit.path),
          href: `${config.assetsUrlPrefix}${file}`,
        };
      }
      memo.set(cacheKey, result);
      return result;
    };

    env.link = resolveDescriptor;
    env.notePath = note.path;

    const tokens = md.parse(note.body, env);
    const scan = scanTokens(tokens);
    assignHeadingIds(tokens, scan.headings);
    note.html = md.renderer.render(tokens, md.options, env);
    note.headings = scan.headings;

    for (const tag of scan.tags) if (!note.tags.includes(tag)) note.tags.push(tag);
    nodes.get(note.id).tags = [...note.tags];

    for (const descriptor of scan.links) {
      if (!descriptor.target) continue; // in-page anchor
      const resolved = resolveDescriptor(descriptor);
      if (resolved.kind === 'image' || resolved.kind === 'file') continue;

      const type = descriptor.embed ? 'embed' : descriptor.syntax === 'wiki' ? 'wikilink' : 'markdown';
      if (resolved.kind === 'unresolved') {
        if (!nodes.has(resolved.id)) {
          nodes.set(resolved.id, {
            id: resolved.id,
            key: null,
            title: descriptor.target,
            path: null,
            folder: null,
            kind: 'unresolved',
            tags: [],
            noteType: null,
            createdAt: null,
          });
        }
      }
      if (resolved.id === note.id) continue; // self-link
      addEdge(edges, note.id, resolved.id, type);
    }
    unresolvedByNote.set(note.id, [...missing]);
  }

  // --- emit
  const nodeList = [...nodes.values()].sort(orderNodes);
  const nodeIndex = new Map(nodeList.map((n, i) => [n.id, i]));
  const adjacency = new Map(nodeList.map((n) => [n.id, { out: [], in: [] }]));
  const edgeList = [];
  for (const edge of edges.values()) {
    if (!nodeIndex.has(edge.s) || !nodeIndex.has(edge.t)) continue;
    edgeList.push({ s: nodeIndex.get(edge.s), t: nodeIndex.get(edge.t), type: edge.type });
    adjacency.get(edge.s).out.push(edge.t);
    adjacency.get(edge.t).in.push(edge.s);
  }

  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(path.join(outDir, 'notes'), { recursive: true });

  for (const note of notes) {
    const adj = adjacency.get(note.id);
    const payload = {
      id: note.id,
      title: note.title,
      path: note.path,
      folder: note.folder,
      tags: note.tags,
      frontmatter: sanitizeFrontmatter(note.frontmatter),
      headings: note.headings,
      html: note.html,
      links: uniq(adj.out).map((id) => describe(nodes.get(id))),
      backlinks: uniq(adj.in).map((id) => describe(nodes.get(id))),
      unresolved: unresolvedByNote.get(note.id) ?? [],
    };
    await fs.writeFile(path.join(outDir, 'notes', `${note.key}.json`), JSON.stringify(payload));
  }

  const graph = {
    generatedAt: new Date().toISOString(),
    siteTitle: config.siteTitle,
    vaultPath: config.vaultPath,
    home: resolveHome(config.homeNote, vault, notes),
    nodes: nodeList.map((n) => ({
      i: nodeIndex.get(n.id),
      id: n.id,
      key: n.key,
      title: n.title,
      path: n.path,
      folder: n.folder,
      kind: n.kind,
      tags: n.tags,
      noteType: n.noteType,
      createdAt: n.createdAt,
      deg: (adjacency.get(n.id).out.length + adjacency.get(n.id).in.length) || 0,
    })),
    edges: edgeList,
    folders: buildTree(nodeList.filter((n) => n.kind === 'note')),
    tags: tagCounts(nodeList),
    stats: {
      notes: notes.length,
      unresolved: nodeList.filter((n) => n.kind === 'unresolved').length,
      edges: edgeList.length,
      assets: assets.size,
    },
  };
  await fs.writeFile(path.join(outDir, 'graph.json'), JSON.stringify(graph));

  if (config.copyAssets && assets.size) {
    await fs.mkdir(path.join(outDir, 'assets'), { recursive: true });
    for (const [src, name] of assets) {
      await fs.copyFile(path.join(vaultDir, src), path.join(outDir, 'assets', name));
    }
  }

  const bytes = await dirSize(outDir);
  console.log(
    `Indexed ${graph.stats.notes} notes, ${graph.stats.edges} edges, ` +
      `${graph.stats.unresolved} unresolved links, ${graph.stats.assets} assets ` +
      `-> ${path.relative(ROOT, outDir)} (${(bytes / 1024).toFixed(0)} KB)`,
  );
}

/* ---------------------------------------------------------------- helpers -- */

async function loadConfig() {
  const file = path.join(ROOT, 'wiki.config.json');
  const config = JSON.parse(await fs.readFile(file, 'utf8'));
  return {
    vaultPath: process.env.VAULT_PATH || config.vaultPath,
    outDir: process.env.OUT_DIR || config.outDir || 'public/wiki-data',
    siteTitle: config.siteTitle ?? 'Wiki',
    homeNote: config.homeNote ?? null,
    exclude: config.exclude ?? [],
    copyAssets: config.copyAssets !== false,
    imageExtensions: config.imageExtensions ?? [],
    fileExtensions: config.fileExtensions ?? [],
    assetsUrlPrefix: 'wiki-data/assets/',
  };
}

async function assertVault(dir, configured) {
  let stat;
  try {
    stat = await fs.stat(dir);
  } catch {
    throw new Error(
      `Vault not found at "${configured}" (resolved to ${dir}).\n` +
        `Set "vaultPath" in wiki.config.json or pass VAULT_PATH=... to point at your notes.`,
    );
  }
  if (!stat.isDirectory()) throw new Error(`Vault path "${configured}" is not a directory.`);
}

function isNote(p) {
  const ext = extOf(p);
  return ext === 'md' || ext === 'markdown';
}

function frontmatterTags(data) {
  const raw = data.tags ?? data.tag ?? [];
  const list = Array.isArray(raw) ? raw : String(raw).split(/[,\s]+/);
  return uniq(
    list
      .filter((t) => t !== null && t !== undefined && String(t).trim() !== '')
      .map((t) => String(t).trim().replace(/^#/, '')),
  );
}

/** Stable, filesystem- and URL-safe filename for a note or asset id. */
function keyFor(id) {
  const slug = String(id)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  const hash = createHash('sha1').update(id).digest('hex').slice(0, 8);
  return slug ? `${slug}-${hash}` : hash;
}

function assetFileName(vaultPath) {
  const ext = extOf(vaultPath);
  return ext ? `${keyFor(vaultPath)}.${ext}` : keyFor(vaultPath);
}

function unresolvedId(target) {
  return `!unresolved:${String(target).trim().toLowerCase()}`;
}

function addEdge(edges, s, t, type) {
  const key = `${s} ${t} ${type}`;
  if (!edges.has(key)) edges.set(key, { s, t, type });
}

function orderNodes(a, b) {
  if (a.kind !== b.kind) return a.kind === 'note' ? -1 : 1;
  return (a.path ?? a.id).localeCompare(b.path ?? b.id);
}

function describe(node) {
  if (!node) return null;
  return { id: node.id, title: node.title, path: node.path, kind: node.kind, key: node.key };
}

function uniq(list) {
  return [...new Set(list)];
}

/** Give every heading a unique slug and write it onto the token so anchors work. */
function assignHeadingIds(tokens, headings) {
  const seen = new Map();
  let cursor = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].type !== 'heading_open') continue;
    const heading = headings[cursor];
    cursor += 1;
    if (!heading) continue;
    let slug = slugifyHeading(heading.text) || `section-${cursor}`;
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    if (count) slug = `${slug}-${count}`;
    heading.slug = slug;
    tokens[i].attrSet('id', slug);
  }
}

function buildTree(noteNodes) {
  const root = { name: '', path: '', type: 'folder', children: [] };
  const folders = new Map([['', root]]);

  const ensure = (folderPath) => {
    if (folders.has(folderPath)) return folders.get(folderPath);
    const parent = ensure(dirOf(folderPath));
    const node = { name: baseOf(folderPath), path: folderPath, type: 'folder', children: [] };
    folders.set(folderPath, node);
    parent.children.push(node);
    return node;
  };

  for (const note of noteNodes) {
    ensure(note.folder).children.push({
      name: note.title,
      path: note.path,
      id: note.id,
      type: 'note',
    });
  }

  const sort = (node) => {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      const aKey = a.type === 'note' ? a.id : a.name;
      const bKey = b.type === 'note' ? b.id : b.name;
      return aKey.localeCompare(bKey, undefined, { numeric: true });
    });
    for (const child of node.children) if (child.type === 'folder') sort(child);
  };
  sort(root);
  return root.children;
}

function tagCounts(nodeList) {
  const counts = new Map();
  for (const node of nodeList) {
    for (const tag of node.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

function resolveHome(homeNote, vault, notes) {
  if (homeNote) {
    const hit = vault.resolve(homeNote, '');
    if (hit) {
      const note = notes.find((n) => n.path === hit.path);
      if (note) return note.id;
    }
  }
  return notes.length ? notes[0].id : null;
}

/** Frontmatter goes to the browser, so keep it to values JSON can carry. */
function sanitizeFrontmatter(data) {
  const out = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value instanceof Date) out[key] = value.toISOString().slice(0, 10);
    else if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) out[key] = value;
    else if (Array.isArray(value)) out[key] = value.map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)).filter((v) => typeof v !== 'object');
    else if (typeof value === 'object') out[key] = JSON.parse(JSON.stringify(value));
  }
  return out;
}

async function dirSize(dir) {
  let total = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) total += (await fs.stat(path.join(entry.parentPath ?? entry.path, entry.name))).size;
  }
  return total;
}

main().catch((err) => {
  console.error(`\nBuild failed: ${err.message}\n`);
  process.exitCode = 1;
});
