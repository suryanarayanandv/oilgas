import keywords from "../../data/keywords.json" with { type: "json" };

const patterns = keywords.patterns.map((p) => ({ re: new RegExp(p.re, "i"), w: p.w, src: p.re }));
const exclude = keywords.exclude.map((e) => e.toLowerCase());

export const searchTerms: string[] = keywords.searchTerms;

export interface Classification {
  score: number;
  tier: "core" | "related" | null;
  matched: string[];
}

export function classify(title: string): Classification {
  const t = title.toLowerCase();
  if (exclude.some((e) => t.includes(e))) return { score: 0, tier: null, matched: [] };
  let score = 0;
  const matched: string[] = [];
  for (const p of patterns) {
    const m = title.match(p.re);
    if (m) {
      score += p.w;
      matched.push(m[0]);
    }
  }
  const tier =
    score >= keywords.coreScore ? "core" : score >= keywords.relatedScore ? "related" : null;
  return { score, tier, matched: [...new Set(matched.map((s) => s.toLowerCase()))] };
}
