export function normalizeForQueryMatch(s: string): string {
  return s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function collapseCommonHebrewTypos(s: string): string {
  // Common fast-typing mistakes in Hebrew: double yod/vav.
  return s.replace(/יי+/g, "י").replace(/וו+/g, "ו");
}

export function stripForQueryMatch(s: string): string {
  return collapseCommonHebrewTypos(normalizeForQueryMatch(s))
    .replace(/[,;:!?.\-_'"()[\]]/g, "")
    .replace(/\s+/g, "");
}

function isDigitsOnlyToken(s: string): boolean {
  return /^\d+$/.test(s);
}

function digitBoundaryRegex(digits: string): RegExp {
  const core = digits.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<!\\d)${core}(?!\\d)`, "u");
}

function uniqueNonEmpty(arr: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of arr) {
    const t = x.trim();
    if (!t) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function tokenVariants(tokenNorm: string): string[] {
  const t = collapseCommonHebrewTypos(tokenNorm);
  const variants: string[] = [tokenNorm, t];
  const add = (s: string) => {
    const x = s.trim();
    if (!x) return;
    variants.push(x);
  };

  // Hebrew preposition prefixes: ב/ל/כ/מ/ו/ה (heuristic).
  // Helps queries like "במים" match names like "במי מלח".
  for (const base of [tokenNorm, t]) {
    if (base.length >= 4 && /^[בלכמווה]/.test(base)) {
      add(base.slice(1));
    }
  }

  // Common equivalence: "מים" ↔ "מי" (and via prefix stripping: "במים" -> "מים" -> "מי").
  for (const base of [tokenNorm, t]) {
    if (base === "מים") add("מי");
  }
  const tryStripSuffix = (s: string, suffix: string) => {
    if (s.length <= suffix.length + 2) return;
    if (!s.endsWith(suffix)) return;
    variants.push(s.slice(0, -suffix.length));
  };

  // Plural/singular-ish suffixes (heuristic). Keep stems only if still meaningful.
  for (const base of [tokenNorm, t]) {
    tryStripSuffix(base, "יות");
    tryStripSuffix(base, "ים");
    tryStripSuffix(base, "ות");
    tryStripSuffix(base, "ייה");
    tryStripSuffix(base, "יה");
    tryStripSuffix(base, "ה");
    tryStripSuffix(base, "ת");
  }

  return uniqueNonEmpty(variants).filter((v) => {
    if (v === "מי") return true;
    return v.length >= 3 || v === tokenNorm || v === t;
  });
}

/**
 * Strict-ish matching used across the app:
 * - all query tokens must exist in the name (AND)
 * - digits must match as standalone numbers (9 matches 9% but not 29)
 * - tolerant to punctuation/spaces
 * - tolerant to common Hebrew typos (יי/וו) + simple plural/singular stems
 */
export function matchesAllQueryWords(name: string, query: string): boolean {
  const q = collapseCommonHebrewTypos(normalizeForQueryMatch(query));
  if (q.length < 2) return false;
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;

  const n = collapseCommonHebrewTypos(normalizeForQueryMatch(name));
  const ns = stripForQueryMatch(name);

  for (const w of words) {
    if (!w) continue;

    if (isDigitsOnlyToken(w)) {
      const re = digitBoundaryRegex(w);
      const ok = re.test(n) || re.test(ns);
      if (!ok) return false;
      continue;
    }

    const variants = tokenVariants(w);
    let ok = false;
    for (const v of variants) {
      const vs = stripForQueryMatch(v);
      if (n.includes(v)) {
        ok = true;
        break;
      }
      if (vs && ns.includes(vs)) {
        ok = true;
        break;
      }
    }
    if (!ok) return false;
  }

  return true;
}

