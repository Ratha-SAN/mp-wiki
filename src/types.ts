export type NodeKind = 'note' | 'unresolved';
export type EdgeType = 'wikilink' | 'markdown' | 'embed';

export interface GraphNode {
  i: number;
  id: string;
  key: string | null;
  title: string;
  path: string | null;
  folder: string | null;
  kind: NodeKind;
  tags: string[];
  /** Frontmatter `type:` (e.g. "concept", "protocol") — null when absent. */
  noteType: string | null;
  deg: number;
}

export interface GraphEdge {
  s: number;
  t: number;
  type: EdgeType;
}

export interface TreeEntry {
  name: string;
  path: string;
  type: 'folder' | 'note';
  id?: string;
  children?: TreeEntry[];
}

export interface GraphData {
  generatedAt: string;
  siteTitle: string;
  vaultPath: string;
  home: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  folders: TreeEntry[];
  tags: { tag: string; count: number }[];
  stats: { notes: number; unresolved: number; edges: number; assets: number };
}

export interface NoteRef {
  id: string;
  title: string;
  path: string | null;
  kind: NodeKind;
  key: string | null;
}

export interface NoteDoc {
  id: string;
  title: string;
  path: string;
  folder: string;
  tags: string[];
  frontmatter: Record<string, unknown>;
  headings: { level: number; text: string; slug?: string }[];
  html: string;
  links: NoteRef[];
  backlinks: NoteRef[];
  unresolved: string[];
}
