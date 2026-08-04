import type { GraphData, NoteDoc } from './types';

// Every request is resolved against the document, so the app works from any
// subdirectory (github.io/<repo>/) without a hard-coded prefix.
const DATA_ROOT = new URL('wiki-data/', document.baseURI);

let graphPromise: Promise<GraphData> | null = null;
const noteCache = new Map<string, Promise<NoteDoc>>();

export function loadGraph(): Promise<GraphData> {
  graphPromise ??= fetchJson<GraphData>('graph.json');
  return graphPromise;
}

/** Note bodies are fetched only when a note is actually opened. */
export function loadNote(key: string): Promise<NoteDoc> {
  let pending = noteCache.get(key);
  if (!pending) {
    pending = fetchJson<NoteDoc>(`notes/${encodeURIComponent(key)}.json`);
    pending.catch(() => noteCache.delete(key));
    noteCache.set(key, pending);
  }
  return pending;
}

async function fetchJson<T>(relative: string): Promise<T> {
  const url = new URL(relative, DATA_ROOT);
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${relative}`);
  return (await response.json()) as T;
}
