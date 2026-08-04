// markdown-it configuration: wikilinks, embeds, KaTeX math, heading anchors.
//
// Links are extracted from the *token stream*, not by regex over the source, so
// anything inside fenced code, inline code or math is never mistaken for a link.

import MarkdownIt from 'markdown-it';
import katex from 'katex';

import { slugifyHeading } from './paths.mjs';
import { parseMarkdownTarget, parseWikiTarget } from './resolve.mjs';

/**
 * The renderer asks `env.link(descriptor)` for every internal reference and gets
 * back `{ kind, id, href, path, label }`. The build script owns that function so
 * this module never needs to know about the vault layout.
 */
export function createMarkdown() {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: false,
    typographer: false,
  });

  md.inline.ruler.before('link', 'wikilink', wikilinkRule);
  md.inline.ruler.before('escape', 'math_inline', mathInlineRule);
  md.block.ruler.before('fence', 'math_block', mathBlockRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });

  md.renderer.rules.wikilink = (tokens, idx, _opts, env) =>
    renderReference(md, tokens[idx].meta, env);
  md.renderer.rules.math_inline = (tokens, idx) => renderMath(tokens[idx].content, false);
  md.renderer.rules.math_block = (tokens, idx) => renderMath(tokens[idx].content, true);

  md.core.ruler.push('block_ids', stripBlockIds);

  patchMarkdownLinks(md);
  patchImages(md);
  return md;
}

/**
 * Obsidian block references (`... some sentence. ^my-block`) are anchors, not text.
 * Move them onto the enclosing block as an id and drop them from the output.
 */
function stripBlockIds(state) {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.type !== 'inline') continue;
    const match = /(?:^|\s)\^([\w-]+)\s*$/.exec(token.content);
    if (!match) continue;

    token.content = token.content.slice(0, match.index).trimEnd();
    for (let j = token.children.length - 1; j >= 0; j -= 1) {
      const child = token.children[j];
      if (child.type !== 'text') continue;
      child.content = child.content.replace(/(?:^|\s)\^[\w-]+\s*$/, '');
      break;
    }
    const owner = tokens[i - 1];
    if (owner && owner.nesting === 1) owner.attrSet('id', `block-${match[1]}`);
  }
}

/* ------------------------------------------------------------------ links -- */

function patchMarkdownLinks(md) {
  const fallback = (tokens, idx, opts, _env, self) => self.renderToken(tokens, idx, opts);
  const defaultOpen = md.renderer.rules.link_open ?? fallback;

  md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    const token = tokens[idx];
    const href = token.attrGet('href') ?? '';
    const descriptor = { ...parseMarkdownTarget(href), embed: false, syntax: 'markdown' };

    if (isExternalHref(href)) {
      token.attrSet('rel', 'noopener noreferrer');
      token.attrSet('target', '_blank');
      token.attrJoin('class', 'ext-link');
      return defaultOpen(tokens, idx, opts, env, self);
    }
    if (!descriptor.target) {
      // Pure in-page anchor: keep it, but route it through the hash-free anchor id.
      token.attrSet('href', `#${slugifyHeading(descriptor.anchor ?? '')}`);
      token.attrJoin('class', 'anchor-link');
      return defaultOpen(tokens, idx, opts, env, self);
    }

    const resolved = env?.link?.(descriptor) ?? null;
    applyResolution(token, resolved, descriptor);
    return defaultOpen(tokens, idx, opts, env, self);
  };
}

function patchImages(md) {
  md.renderer.rules.image = (tokens, idx, opts, env, self) => {
    const token = tokens[idx];
    const src = token.attrGet('src') ?? '';
    if (isExternalHref(src)) return self.renderToken(tokens, idx, opts);

    const descriptor = { ...parseMarkdownTarget(src), embed: true, syntax: 'markdown' };
    const resolved = env?.link?.(descriptor) ?? null;
    const alt = token.content || descriptor.target;
    return renderEmbed(md, resolved, descriptor, alt);
  };
}

function applyResolution(token, resolved, descriptor) {
  if (!resolved || resolved.kind === 'unresolved') {
    token.attrSet('href', '#');
    token.attrSet('data-unresolved', descriptor.target);
    token.attrJoin('class', 'wl wl-missing');
    token.attrSet('title', `Unresolved link: ${descriptor.target}`);
    return;
  }
  if (resolved.kind === 'note') {
    token.attrSet('href', resolved.href);
    token.attrSet('data-note', resolved.id);
    if (descriptor.anchor) token.attrSet('data-anchor', slugifyHeading(descriptor.anchor));
    if (descriptor.blockRef) token.attrSet('data-block', descriptor.blockRef);
    token.attrJoin('class', 'wl');
    return;
  }
  token.attrSet('href', resolved.href);
  token.attrJoin('class', 'asset-link');
  if (resolved.kind === 'file') token.attrSet('target', '_blank');
}

/** `[[target]]`, `[[target|alias]]`, `![[embed]]` */
function wikilinkRule(state, silent) {
  const start = state.pos;
  const src = state.src;
  const embed = src.charCodeAt(start) === 0x21; /* ! */
  const open = embed ? start + 1 : start;

  if (src.charCodeAt(open) !== 0x5b || src.charCodeAt(open + 1) !== 0x5b) return false;

  const close = src.indexOf(']]', open + 2);
  if (close === -1) return false;

  const inner = src.slice(open + 2, close);
  if (!inner || inner.includes('[[') || inner.includes('\n')) return false;

  if (!silent) {
    const token = state.push('wikilink', '', 0);
    token.meta = { ...parseWikiTarget(inner), embed, syntax: 'wiki', raw: inner };
  }
  state.pos = close + 2;
  return true;
}

function renderReference(md, descriptor, env) {
  const resolved = env?.link?.(descriptor) ?? null;
  const label = descriptor.alias || descriptor.target || descriptor.anchor || '';

  if (descriptor.embed) return renderEmbed(md, resolved, descriptor, label);

  const esc = md.utils.escapeHtml;
  if (!descriptor.target && (descriptor.anchor || descriptor.blockRef)) {
    const frag = slugifyHeading(descriptor.anchor ?? descriptor.blockRef ?? '');
    return `<a class="anchor-link" href="#${esc(frag)}">${esc(label)}</a>`;
  }
  if (!resolved || resolved.kind === 'unresolved') {
    return `<a class="wl wl-missing" href="#" data-unresolved="${esc(descriptor.target)}" title="Unresolved link: ${esc(descriptor.target)}">${esc(label)}</a>`;
  }
  if (resolved.kind === 'note') {
    const attrs = [
      `class="wl"`,
      `href="${esc(resolved.href)}"`,
      `data-note="${esc(resolved.id)}"`,
      descriptor.anchor ? `data-anchor="${esc(slugifyHeading(descriptor.anchor))}"` : '',
      descriptor.blockRef ? `data-block="${esc(descriptor.blockRef)}"` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const shown = descriptor.alias || resolved.label;
    return `<a ${attrs}>${esc(shown)}</a>`;
  }
  const cls = resolved.kind === 'image' ? 'asset-link' : 'asset-link file-link';
  return `<a class="${cls}" href="${esc(resolved.href)}" target="_blank" rel="noopener">${esc(label)}</a>`;
}

function renderEmbed(md, resolved, descriptor, label) {
  const esc = md.utils.escapeHtml;
  if (!resolved || resolved.kind === 'unresolved') {
    return `<span class="embed-missing" title="Unresolved embed">${esc(descriptor.target || label)}</span>`;
  }
  if (resolved.kind === 'image') {
    return `<figure class="embed-image"><img src="${esc(resolved.href)}" alt="${esc(label)}" loading="lazy"></figure>`;
  }
  if (resolved.kind === 'note') {
    return `<a class="embed-note wl" href="${esc(resolved.href)}" data-note="${esc(resolved.id)}">${esc(resolved.label)}</a>`;
  }
  return `<a class="embed-file" href="${esc(resolved.href)}" target="_blank" rel="noopener">${esc(label || resolved.label)}</a>`;
}

function isExternalHref(href) {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');
}

/* ------------------------------------------------------------------- math -- */

function mathInlineRule(state, silent) {
  const src = state.src;
  const start = state.pos;
  if (src.charCodeAt(start) !== 0x24 /* $ */) return false;
  if (start > 0 && src.charCodeAt(start - 1) === 0x5c /* \ */) return false;
  // `$$` at this position belongs to the block rule (or an empty span).
  if (src.charCodeAt(start + 1) === 0x24) return false;

  const first = src.charCodeAt(start + 1);
  if (Number.isNaN(first) || first === 0x20 || first === 0x0a) return false;

  let pos = start + 1;
  while (pos < src.length) {
    const code = src.charCodeAt(pos);
    if (code === 0x5c) {
      pos += 2;
      continue;
    }
    if (code === 0x0a) return false;
    if (code === 0x24) {
      const prev = src.charCodeAt(pos - 1);
      const next = src.charCodeAt(pos + 1);
      // A closing `$` must hug its content and not be followed by a digit ("$5 to $9").
      if (prev !== 0x20 && !(next >= 0x30 && next <= 0x39)) break;
    }
    pos += 1;
  }
  if (pos >= src.length || src.charCodeAt(pos) !== 0x24) return false;

  if (!silent) {
    const token = state.push('math_inline', 'math', 0);
    token.markup = '$';
    token.content = src.slice(start + 1, pos);
  }
  state.pos = pos + 1;
  return true;
}

function mathBlockRule(state, startLine, endLine, silent) {
  const begin = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  if (state.sCount[startLine] - state.blkIndent >= 4) return false;
  if (state.src.slice(begin, begin + 2) !== '$$') return false;

  const firstLine = state.src.slice(begin + 2, max);
  let lastLine = startLine;
  let content = null;

  if (firstLine.trim().endsWith('$$') && firstLine.trim().length >= 2) {
    content = firstLine.trim().slice(0, -2);
  } else {
    for (let line = startLine + 1; line < endLine; line += 1) {
      const from = state.bMarks[line] + state.tShift[line];
      const to = state.eMarks[line];
      if (state.src.slice(from, to).trim().endsWith('$$')) {
        lastLine = line;
        const body = [firstLine];
        for (let i = startLine + 1; i < line; i += 1) {
          body.push(state.src.slice(state.bMarks[i] + state.tShift[i], state.eMarks[i]));
        }
        const tail = state.src.slice(from, to).trim();
        body.push(tail.slice(0, -2));
        content = body.join('\n');
        break;
      }
    }
    if (content === null) return false;
  }

  if (silent) return true;
  const token = state.push('math_block', 'math', 0);
  token.block = true;
  token.markup = '$$';
  token.content = content.trim();
  token.map = [startLine, lastLine + 1];
  state.line = lastLine + 1;
  return true;
}

function renderMath(latex, displayMode) {
  try {
    return katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
    });
  } catch (err) {
    const safe = String(latex).replace(/[&<>]/g, (c) => `&#${c.charCodeAt(0)};`);
    return `<code class="math-error" title="${String(err.message ?? err)}">${safe}</code>`;
  }
}

/* ------------------------------------------------- token-stream extraction -- */

/**
 * Walk parsed tokens and pull out every internal reference, heading and inline tag.
 * Code fences, inline code and math are skipped by construction.
 */
export function scanTokens(tokens) {
  const links = [];
  const headings = [];
  const tags = new Set();
  const blockIds = new Set();

  const visit = (list, ctx) => {
    for (let i = 0; i < list.length; i += 1) {
      const token = list[i];
      switch (token.type) {
        case 'wikilink':
          links.push({ ...token.meta });
          break;
        case 'link_open': {
          const href = token.attrGet('href') ?? '';
          if (!isExternalHref(href)) {
            links.push({ ...parseMarkdownTarget(href), embed: false, syntax: 'markdown' });
          }
          break;
        }
        case 'image': {
          const src = token.attrGet('src') ?? '';
          if (!isExternalHref(src)) {
            links.push({ ...parseMarkdownTarget(src), embed: true, syntax: 'markdown' });
          }
          if (token.children) visit(token.children, ctx);
          break;
        }
        case 'heading_open': {
          const inline = list[i + 1];
          const text = inline?.content?.trim() ?? '';
          headings.push({ level: Number(token.tag.slice(1)), text });
          break;
        }
        case 'text':
          collectTags(token.content, tags);
          break;
        default:
          break;
      }
      // `stripBlockIds` has already moved `^block-ref` markers onto their block.
      const id = token.attrGet?.('id');
      if (id?.startsWith('block-')) blockIds.add(id.slice('block-'.length));
      if (token.children && token.type !== 'image') visit(token.children, ctx);
    }
  };

  visit(tokens, {});
  return { links, headings, tags: [...tags], blockIds: [...blockIds] };
}

// `#tag`, `#nested/tag` — not `#1`, not a bare `#`, not part of a word or URL.
const TAG_RE = /(^|[\s(\[{,;:'"])#([\p{L}][\p{L}\p{N}_/-]*)/gu;

function collectTags(text, into) {
  for (const match of text.matchAll(TAG_RE)) into.add(match[2]);
}
