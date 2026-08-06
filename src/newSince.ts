import type { GraphData } from './types';

const KEY = 'mp-wiki:seen-until';

/**
 * Notes whose first commit is newer than the last time this browser loaded the
 * wiki. A first-ever visit has nothing to compare against, so it flags nothing
 * and just records the current watermark — a fresh browser never sees the whole
 * vault marked "new". Calling this updates the watermark, so it's meant to be
 * called once per page load.
 */
export function computeNewNoteIds(data: GraphData): Set<string> {
  const dated = data.nodes.filter((n) => n.kind === 'note' && n.createdAt);
  if (!dated.length) return new Set();

  const latest = dated.reduce((max, n) => (n.createdAt! > max ? n.createdAt! : max), dated[0].createdAt!);

  let stored: string | null = null;
  try {
    stored = localStorage.getItem(KEY);
  } catch {
    /* private mode: nothing to read, nothing to persist */
  }

  const newIds = stored
    ? new Set(dated.filter((n) => n.createdAt! > stored).map((n) => n.id))
    : new Set<string>();

  try {
    localStorage.setItem(KEY, latest);
  } catch {
    /* private mode: "new" just won't persist to the next visit */
  }

  return newIds;
}
