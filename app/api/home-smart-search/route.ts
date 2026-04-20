import { NextResponse } from "next/server";
import { normalizeSearchText, stripPunctuationForSearch } from "@/lib/foodSearchRank";
import { loadFoodDb, searchFoodDb, type FoodDbRow } from "@/lib/foodDb";

export const dynamic = "force-dynamic";

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1).fill(0).map((_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(
        dp[j]! + 1,
        dp[j - 1]! + 1,
        prev + cost
      );
      prev = tmp;
    }
  }
  return dp[n]!;
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na <= 0 || nb <= 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const embedCache = new Map<string, number[]>();

async function embedOpenAI(texts: string[]): Promise<number[][] | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: texts,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const out: number[][] = [];
    for (const row of data.data ?? []) {
      const e = row.embedding;
      if (!Array.isArray(e)) return null;
      out.push(e as number[]);
    }
    return out.length === texts.length ? out : null;
  } catch {
    return null;
  }
}

function mapRow(r: FoodDbRow) {
  return {
    id: r.id,
    name: r.name,
    category: r.category,
    calories: r.calories,
    protein: r.protein,
    fat: r.fat,
    carbs: r.carbs,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const qRaw = searchParams.get("q") ?? "";
  const q = qRaw.trim();
  const qNorm = normalizeSearchText(q);
  if (qNorm.length < 2) {
    return NextResponse.json({ items: [] as ReturnType<typeof mapRow>[] });
  }

  const limitRaw = parseInt(searchParams.get("limit") ?? "20", 10);
  const limit = Math.min(50, Math.max(8, Number.isFinite(limitRaw) ? limitRaw : 20));

  // 1) Strict ranked search (prefix/contains tiers)
  const strict = searchFoodDb(q, { limit: Math.max(limit, 25) });
  const seen = new Set(strict.map((r) => r.id));
  let items = [...strict];

  // 2) Fuzzy fill for typos (only if needed)
  if (items.length < limit) {
    const db = loadFoodDb();
    const qStrip = stripPunctuationForSearch(q);
    const scored: Array<{ r: FoodDbRow; score: number }> = [];
    for (const r of db) {
      if (seen.has(r.id)) continue;
      const nStrip = stripPunctuationForSearch(r.name);
      if (qStrip.length < 2 || nStrip.length < 2) continue;
      // Prefer candidates that share any char window with query (cheap guard)
      if (!nStrip.includes(qStrip.slice(0, Math.min(3, qStrip.length)))) continue;
      const d = levenshtein(qStrip, nStrip.slice(0, Math.min(nStrip.length, qStrip.length + 6)));
      const score = d / Math.max(2, qStrip.length);
      if (score <= 0.6) scored.push({ r, score });
    }
    scored.sort((a, b) => a.score - b.score);
    for (const s of scored.slice(0, limit - items.length)) {
      seen.add(s.r.id);
      items.push(s.r);
    }
  }

  // 3) Optional semantic fill via embeddings (only when results are scarce)
  if (items.length < Math.min(8, limit) && (process.env.OPENAI_API_KEY?.trim() ?? "") !== "") {
    const db = loadFoodDb();
    const candidates = db
      .filter((r) => !seen.has(r.id))
      .slice(0, 80);

    const texts: string[] = [q, ...candidates.map((c) => c.name)];
    const cached: number[][] = [];
    const missingIdx: number[] = [];
    const missingTexts: string[] = [];

    for (let i = 0; i < texts.length; i++) {
      const t = texts[i]!;
      const key = i === 0 ? "__query__" : t;
      const hit = embedCache.get(key);
      if (hit) {
        cached[i] = hit;
      } else {
        missingIdx.push(i);
        missingTexts.push(t);
      }
    }

    if (missingTexts.length > 0) {
      const embeds = await embedOpenAI(missingTexts);
      if (embeds) {
        for (let j = 0; j < embeds.length; j++) {
          const i = missingIdx[j]!;
          const t = missingTexts[j]!;
          const key = i === 0 ? "__query__" : t;
          embedCache.set(key, embeds[j]!);
          cached[i] = embeds[j]!;
        }
      }
    }

    const qEmb = cached[0];
    if (qEmb) {
      const scored = candidates
        .map((r, idx) => {
          const e = cached[idx + 1];
          return e ? ({ r, sim: cosineSim(qEmb, e) } as const) : null;
        })
        .filter(Boolean) as Array<{ r: FoodDbRow; sim: number }>;
      scored.sort((a, b) => b.sim - a.sim);
      for (const s of scored.slice(0, limit - items.length)) {
        if (s.sim < 0.35) break;
        seen.add(s.r.id);
        items.push(s.r);
      }
    }
  }

  items = items.slice(0, limit);
  return NextResponse.json({ items: items.map(mapRow) });
}

