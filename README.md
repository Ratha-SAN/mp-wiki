# mp-wiki

A static reader for a Markdown vault: a file explorer, a rendered reading pane, and an
interactive link graph. No server, no database, no runtime keys — the vault is parsed at
build time and the browser only loads JSON.

```bash
npm install
npm run dev      # index the vault, then serve at http://localhost:5173
npm run build    # index + bundle into dist/
npm test         # link-resolution and Markdown tests
```

`npm run build` is the single reproducible command; `.github/workflows/pages.yml` runs it
on every push to `main` and publishes `dist/` to GitHub Pages.

## Pointing it at your vault

`wiki.config.json` holds the one path that matters:

```json
{ "vaultPath": "sample-vault", "outDir": "public/wiki-data" }
```

Commit your notes into the repo (say at `wiki/`), set `"vaultPath": "wiki"`, rebuild.
`VAULT_PATH=/somewhere/else npm run build` overrides it without editing the file, and the
Pages workflow already checks out submodules if the vault later becomes one.

The vault is only ever read. Nothing is written back into it.

Other config keys: `siteTitle`, `homeNote` (the note opened on load), `exclude` (globs),
`copyAssets`, `imageExtensions`, `fileExtensions`. Notes whose frontmatter carries
`publish: false`, `private: true` or `draft: true` are dropped from the build entirely —
links to them then show up as unresolved.

## What the build emits

```
public/wiki-data/
  graph.json          nodes, edges, folder tree, tag counts   (loaded once, up front)
  notes/<key>.json    rendered HTML + backlinks per note      (fetched when opened)
  assets/<key>.<ext>  images referenced from notes
```

Note bodies are already split out, so the initial payload stays proportional to the number
of notes rather than their length. On the sample vault `graph.json` is ~10 KB.

## Link handling

Links come out of the markdown-it token stream, not a regex over the source, so anything
inside fenced code, inline code or `$…$` math is never mistaken for a link.

Recognised: `[[Note]]`, `[[Note|alias]]`, `[[Note#Heading]]`, `[[Note#^block-id]]`,
`![[Note]]` and `![[image.png]]` embeds, `[text](../relative/path.md)`, `![alt](img.png)`,
frontmatter `tags:`, and inline `#tags` (including `#nested/tags`).

Resolution follows Obsidian: exact path from the vault root, then relative to the linking
note, then filename match anywhere in the vault — case-insensitively, with `.md` implied.
Ambiguous filenames prefer the same folder, then the shortest path, then alphabetical
order, so builds are deterministic.

Links that resolve to nothing are **not** dropped. They become hollow, dashed nodes in the
graph and dashed underlines in the text; clicking one lists everything that points at it.
Dangling links are how a work-in-progress vault shows you where to write next.

## The graph

Canvas, force-directed. Scroll to zoom, drag the background to pan, drag a node to pin it
while the layout settles, hover to isolate a node and its immediate neighbours, click to
open a note. `Depth` limits the view to N hops from the open note; `Folders` and `Tags`
filter; `Fit` re-frames.

Nodes are coloured by role — note, open note, unresolved — rather than by folder. A
colourblind-safe categorical palette only supports about three hues when every pair can
end up adjacent, which is exactly what a node-link layout does, so folder is a filter and a
tree instead of a hue. Node size follows degree.

## Deploying

Push to `main` with Pages set to "GitHub Actions" as the source. Every URL the app emits is
document-relative, so it works from `user.github.io/mp-wiki/` unchanged. `BASE_PATH=/prefix/`
pins an absolute base if you need one.

## Scope

Read-only, deliberately: no editing, no writing back to the vault, no plugin API, no sync,
no canvas. PDFs and other attachments render as download links rather than inline viewers.

## Stack

Build: Node + `gray-matter`, `markdown-it`, `katex` (math is rendered to HTML at build
time), `fast-glob`. App: Vite + TypeScript, no UI framework; `d3-force` for layout with a
hand-rolled canvas renderer.
