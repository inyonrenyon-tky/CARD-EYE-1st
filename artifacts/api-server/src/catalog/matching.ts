import { catalogDbConfigured, catalogDb } from "./db";

export type MatchInput = {
  cardName: string | null; series: string | null;
  cardNumber: string | null; rarity: string | null;
};
export type MatchCandidate = {
  id: string; name: string; collectorNumber: string; setCode: string;
  setName: string; rarity: string | null; variantCode: string;
};
export type MatchResult = {
  status: "exact" | "high" | "ambiguous" | "unmatched" | "unavailable";
  matchedCardId: string | null;
  method: string | null;
  candidates: MatchCandidate[];
};

// Keep matching thresholds in one place; never turn number-only matches into IDs.
export const MATCH_CONFIG = { maxNameEditDistance: 2, maxCandidates: 20 } as const;
export const normalizeText = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\s・\-＿_]/g, "");
export const normalizeNumber = (s: string) => s.normalize("NFKC").split("/")[0].replace(/\s/g, "").toUpperCase();
function normalizeRarity(s: string) {
  const value = normalizeText(s);
  return ({ sar: "specialillustrationrare", ar: "illustrationrare" } as Record<string, string>)[value] ?? value;
}

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(next[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous.splice(0, previous.length, ...next);
  }
  return previous[b.length];
}

export function matchCandidates(input: MatchInput, candidates: MatchCandidate[]): MatchResult {
  const unmatched: MatchResult = { status: "unmatched", matchedCardId: null, method: null, candidates: [] };
  if (!input.cardName || !input.cardNumber || !input.series) return { ...unmatched, status: candidates.length ? "ambiguous" : "unmatched", candidates: candidates.slice(0, 3) };
  const number = normalizeNumber(input.cardNumber);
  const name = normalizeText(input.cardName);
  const series = normalizeText(input.series);
  const plausible = candidates.filter((card) =>
    normalizeNumber(card.collectorNumber) === number &&
    [card.setCode, card.setName].some((value) => normalizeText(value) === series) &&
    editDistance(normalizeText(card.name), name) <= MATCH_CONFIG.maxNameEditDistance,
  );
  if (plausible.length === 0) return unmatched;
  const matching = plausible.filter((card) => !input.rarity ||
    (card.rarity !== null && normalizeRarity(input.rarity) === normalizeRarity(card.rarity)));
  if (matching.length === 0) return { status: "ambiguous", matchedCardId: null, method: null, candidates: plausible.slice(0, 3) };
  if (matching.length !== 1) return { status: "ambiguous", matchedCardId: null, method: null, candidates: matching.slice(0, 3) };
  const card = matching[0];
  const exactName = normalizeText(card.name) === name;
  if (!exactName && !input.rarity) return { status: "ambiguous", matchedCardId: null, method: null, candidates: [card] };
  return {
    status: exactName ? "exact" : "high", matchedCardId: card.id,
    method: exactName ? "set+number+name" : "set+number+near-name+rarity",
    candidates: [card],
  };
}

export async function matchAnalysis(input: MatchInput): Promise<MatchResult> {
  if (!catalogDbConfigured()) return { status: "unavailable", matchedCardId: null, method: null, candidates: [] };
  const number = input.cardNumber ? normalizeNumber(input.cardNumber) : "";
  if (!number || number.length > 30 || !input.series || !input.cardName) {
    return { status: "unmatched", matchedCardId: null, method: null, candidates: [] };
  }
  const result = await catalogDb().query<{
    id: string; name: string; collector_number: string; code: string; set_name: string;
    rarity_code: string | null; variant_code: string;
  }>(
    `select c.id,c.name,c.collector_number,s.code,s.name as set_name,c.rarity_code,c.variant_code
     from public.cards c join public.card_sets s on s.id=c.set_id
     where c.collector_number_normalized=$1 and c.language='ja' and c.catalog_status='active'
     limit $2`,
    [number, MATCH_CONFIG.maxCandidates + 1],
  );
  const candidates = result.rows.map((row): MatchCandidate => ({
    id: row.id, name: row.name, collectorNumber: row.collector_number,
    setCode: row.code, setName: row.set_name, rarity: row.rarity_code, variantCode: row.variant_code,
  }));
  // A truncated result set must never be used to pick a "unique" match.
  if (candidates.length > MATCH_CONFIG.maxCandidates) {
    return { status: "ambiguous", matchedCardId: null, method: null, candidates: candidates.slice(0, 3) };
  }
  const match = matchCandidates(input, candidates);
  await catalogDb().query(
    `insert into public.scan_analyses(matched_card_id,match_status,match_method,candidate_snapshot)
     values($1,$2,$3,$4::jsonb)`,
    [match.matchedCardId, match.status, match.method, JSON.stringify({ input, candidates: match.candidates })],
  );
  return match;
}