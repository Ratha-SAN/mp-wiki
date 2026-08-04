// Path helpers shared by the vault indexer. Everything here works on POSIX-style
// vault-relative paths ("Dosimetry/TG-51.md"), never on absolute OS paths.

/** Normalise separators and collapse "." / ".." segments. */
export function normalizeVaultPath(p) {
  const parts = String(p).replace(/\\/g, '/').split('/');
  const out = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (out.length) out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join('/');
}

/** Join a directory with a (possibly relative) target. */
export function joinVaultPath(dir, target) {
  return normalizeVaultPath(dir ? `${dir}/${target}` : target);
}

export function dirOf(p) {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
}

export function baseOf(p) {
  const i = p.lastIndexOf('/');
  return i === -1 ? p : p.slice(i + 1);
}

export function extOf(p) {
  const base = baseOf(p);
  const i = base.lastIndexOf('.');
  return i <= 0 ? '' : base.slice(i + 1).toLowerCase();
}

export function stripExt(p) {
  const ext = extOf(p);
  return ext ? p.slice(0, -(ext.length + 1)) : p;
}

/** GitHub-style heading slug, used for in-note anchors. */
export function slugifyHeading(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/[‘’“”]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** True for links that point outside the vault and must never become graph edges. */
export function isExternalTarget(target) {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//');
}

/**
 * Fallback display title for a note with no frontmatter `title`: strip a
 * lowercase "type_" prefix (e.g. "protocol_ICRU-50-photon-beam-therapy") and
 * turn the rest into words. A word that already carries a capital (an
 * acronym like "ICRU" or "HyTEC") or has no letters at all (a number) is
 * left untouched; only plain lowercase words get title-cased.
 */
export function prettifyTitle(id) {
  const base = baseOf(id);
  const stripped = base.replace(/^[a-z]+_/, '') || base;
  const words = stripped.split(/[-_\s]+/).filter(Boolean);
  if (!words.length) return base;
  return words
    .map((w) => (/[A-Z]/.test(w) || !/[a-z]/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}
