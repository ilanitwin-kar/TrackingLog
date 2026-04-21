import Fuse from "fuse.js";

export type FuzzyOptions<T> = {
  keys: Array<keyof T>;
  threshold?: number;
  distance?: number;
  minMatchCharLength?: number;
  limit?: number;
};

export function fuzzySearch<T extends Record<string, unknown>>(
  items: T[],
  query: string,
  opts: FuzzyOptions<T>
): T[] {
  const q = query.trim();
  if (!q) return [];
  const fuse = new Fuse(items, {
    keys: opts.keys.map(String),
    threshold: opts.threshold ?? 0.36,
    distance: opts.distance ?? 80,
    ignoreLocation: true,
    minMatchCharLength: opts.minMatchCharLength ?? 2,
    shouldSort: true,
  });
  return fuse
    .search(q)
    .slice(0, opts.limit ?? 20)
    .map((r) => r.item);
}

