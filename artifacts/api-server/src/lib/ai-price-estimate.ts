import { createHash } from "node:crypto";
import {
  normalizeAiMarketIdentity,
  type AiMarketSearchIdentity,
  type AiMarketSearchResult,
  type AiMarketSearchSource,
} from "./ai-market-search";

const MAX_PRICE_YEN = 100_000_000;
const MODEL = "gpt-5-mini";
const CACHE_TTL_MS = 60 * 60_000;

export type AiEstimateCandidate = {
  price: number;
  rangeMin: number | null;
  rangeMax: number | null;
  note: string;
  sourceNames: string[];
  condition: "ai_estimated";
  calculationMethod: "ai_estimate";
  evidenceType: "ai_research";
  sampleCount: 0;
  comparisonCount: number;
  marketEvidence: boolean;
};

function validYen(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_PRICE_YEN;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const center = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[center] : Math.round((sorted[center - 1] + sorted[center]) / 2);
}

function candidate(price: number, rangeMin: number | null, rangeMax: number | null, note: string, sources: string[], comparisonCount = 0, marketEvidence = false): AiEstimateCandidate {
  return {
    price, rangeMin, rangeMax, note, sourceNames: sources.length ? sources : [`OpenAI ${MODEL}（AI推定）`],
    condition: "ai_estimated", calculationMethod: "ai_estimate",
    evidenceType: "ai_research", sampleCount: 0, comparisonCount, marketEvidence,
  };
}

function citations(rows: AiMarketSearchSource[]) {
  return [...new Set(rows.map((row) => {
    try { return new URL(row.url).hostname; } catch { return null; }
  }).filter((host): host is string => !!host))].slice(0, 5);
}

function isUngradedQuote(row: AiMarketSearchSource) {
  if (row.category !== "sale" && row.category !== "shop" && row.category !== "ungraded_listing") return false;
  if (!validYen(row.price)) return false;
  const grade = row.title.search(/PSA|BGS|CGC|鑑定/i);
  if (grade < 0) return true;
  // A page that lists both the raw-card market and PSA prices may mention PSA
  // after a clearly labeled raw-card quote in its title.
  return /(?:未鑑定|相場|フリマ)[^\n]{0,28}[\d,]+円/.test(row.title.slice(0, grade));
}

/** AI-extracted quotes remain unverified even when the model calls them sales. */
export function candidateFromAiResult(result: AiMarketSearchResult): AiEstimateCandidate | null {
  if (!Number.isFinite(Date.parse(result.searchedAt))) return null;
  const ungraded = result.sources.filter(isUngradedQuote);
  const sales = ungraded.filter((row) => row.category === "sale"
    && !/(?:相場|中央値)[^\n]{0,28}[\d,]+円/.test(row.title));
  if (sales.length >= 3) {
    const values = sales.map((row) => row.price!);
    const center = median(values);
    const comparable = values.filter((value) => Math.abs(value - center) <= Math.max(1000, center * 0.35));
    if (comparable.length >= 3) {
      const price = median(comparable);
      return candidate(price, Math.min(...comparable), Math.max(...comparable),
        `AI検索で引用された同一カードの個別価格${comparable.length}件の中央値です。売買完了や出典内容は独立に検証していないため、確認済み成約価格ではありません。${result.explanation.slice(0, 350)}`,
        citations(sales), comparable.length, true);
    }
  }

  const marketPage = ungraded.find((row) =>
    (row.category === "ungraded_listing" || row.category === "sale")
    && /(?:相場|中央値)[^\n]{0,28}[\d,]+円/.test(row.title)
    && (!result.cardNumber || row.title.includes(result.cardNumber)));
  if (marketPage) {
    return candidate(marketPage.price!, null, null,
      `AI検索が同一カードの相場ページで見つけた掲載参考値です（${marketPage.title.slice(0, 150)}）。集計ページに書かれた価格であり、個別の成約5件や売買完了を独立に検証した数字ではありません。`,
      citations([marketPage]), 1, true);
  }

  const quotedValues = ungraded.map((row) => row.price!);
  const citedHosts = citations(ungraded);
  if (validYen(result.marketPrice) && citedHosts.length >= 2 && quotedValues.length >= 2
    && result.marketPrice >= Math.min(...quotedValues)
    && result.marketPrice <= Math.max(...quotedValues)) {
    return candidate(result.marketPrice, Math.min(...quotedValues), Math.max(...quotedValues),
      `AIが同一カードの複数の国内掲載・相場情報を比較した一点参考価格です。引用された個別価格${quotedValues.length}件（¥${Math.min(...quotedValues).toLocaleString("ja-JP")}〜¥${Math.max(...quotedValues).toLocaleString("ja-JP")}）と照合しました。出品・店舗価格は成約価格ではなく、引用先の売買完了も独立に確認していません。${result.explanation.slice(0, 260)}`,
      citedHosts, quotedValues.length, ungraded.some((row) => row.category !== "shop"));
  }
  if (citedHosts.length >= 2 && quotedValues.length >= 3) {
    const center = median(quotedValues);
    const comparable = quotedValues.filter((value) => Math.abs(value - center) <= Math.max(1000, center * 0.45));
    if (comparable.length >= 3) {
      const price = median(comparable);
      return candidate(price, Math.min(...comparable), Math.max(...comparable),
        `AI検索で引用された同一カードの未鑑定向け個別掲載・相場情報${comparable.length}件を比較した中央値です。店舗価格と相場集計を含むため、確認済み成約中央値ではありません。引用先の内容も独立に検証していません。`,
        citedHosts, comparable.length, ungraded.some((row) => row.category !== "shop"));
    }
  }

  const excellent = result.estimates.ungradedExcellent;
  if (validYen(excellent.min) && validYen(excellent.max) && excellent.min <= excellent.max) {
    const price = Math.round((excellent.min + excellent.max) / 2);
    return candidate(price, excellent.min, excellent.max,
      `AIが調べた未鑑定美品の参考幅（¥${excellent.min.toLocaleString("ja-JP")}〜¥${excellent.max.toLocaleString("ja-JP")}）の中心値です。成約中央値ではありません。${excellent.note.slice(0, 300)}`,
      citations(ungraded));
  }

  if (ungraded.length >= 2) {
    const values = ungraded.map((row) => row.price!);
    const price = median(values);
    return candidate(price, Math.min(...values), Math.max(...values),
      `AI検索で引用された同一カードの未鑑定掲載価格${values.length}件の中央値です。出品・店舗価格は成約価格ではなく、出典内容も独立に検証していません。`,
      citations(ungraded), values.length, ungraded.some((row) => row.category !== "shop"));
  }

  const unrelatedOnly = result.sources.length > 0 && result.sources.every((row) =>
    ["psa9", "psa10", "psa10_listing", "buyback"].includes(row.category));
  if (!unrelatedOnly && result.detectedGrade !== "PSA9" && result.detectedGrade !== "PSA10" && validYen(result.marketPrice)) {
    return candidate(result.marketPrice, null, null,
      `AIによる未鑑定の一点参考価格です。成約中央値ではありません。${result.explanation.slice(0, 350)}`,
      citations(ungraded));
  }
  return null;
}

const fallbackOutputSchema = {
  type: "object",
  properties: { price: { type: ["integer", "null"] }, rationale: { type: "string" } },
  required: ["price", "rationale"],
  additionalProperties: false,
} as const;

export function parseNoResultEstimateOutput(output: string): AiEstimateCandidate | null {
  let parsed: unknown;
  try { parsed = JSON.parse(output); } catch { return null; }
  if (!parsed || typeof parsed !== "object") return null;
  const { price, rationale } = parsed as { price?: unknown; rationale?: unknown };
  if (!validYen(price) || typeof rationale !== "string" || !rationale.trim()) return null;
  return candidate(price, null, null,
    `AIがカード固有の情報から推定した一点参考価格です。成約・掲載を確認した価格ではありません。推定理由: ${rationale.trim().slice(0, 500)}`,
    []);
}

async function requestEstimate(identity: AiMarketSearchIdentity): Promise<AiEstimateCandidate | null> {
  const { openai } = await import("@workspace/integrations-openai-ai-server");
  const response = await openai.responses.create({
    model: MODEL,
    input: [
      { role: "system", content: [{ type: "input_text", text: [
        "日本国内のポケモンカードについて未鑑定の一点参考価格を円で推定してください。",
        "対象カードの正確な番号・セット・レアリティを照合し、同名の別カード、PSA鑑定価格、買取価格を混ぜないでください。",
        "国内の類似カードやそのカードに関する確かな既知情報から慎重に推定し、推定理由に比較対象・不確かさを具体的に書いてください。",
        "存在しない個別成約や出典を創作せず、取引を確認したと主張しないでください。根拠があまりに乏しくカード固有の推定すらできない場合のみpriceをnullにしてください。",
        "価格は1〜100000000円の整数。指定されたJSON schemaだけを返してください。",
      ].join("\n") }] },
      { role: "user", content: [{ type: "input_text", text: `対象カード: ${JSON.stringify(identity)}` }] },
    ],
    text: { format: { type: "json_schema", name: "cautious_card_price", strict: true, schema: fallbackOutputSchema } },
    max_output_tokens: 550,
    reasoning: { effort: "low" },
    store: false,
  }, { timeout: 20_000, maxRetries: 0 });
  return response.status === "completed" && response.output_text
    ? parseNoResultEstimateOutput(response.output_text) : null;
}

const cache = new Map<string, { expiresAt: number; result: Promise<AiEstimateCandidate | null> }>();

export async function estimateWhenNoAiResult(identity: AiMarketSearchIdentity, onCacheMiss?: () => void): Promise<AiEstimateCandidate | null> {
  const normalized = normalizeAiMarketIdentity(identity);
  if (!normalized.cardName.trim() || !(normalized.cardNumber || normalized.series)) return null;
  const key = createHash("sha256").update(JSON.stringify([
    normalized.cardName, normalized.cardNumber, normalized.series, normalized.rarity,
  ])).digest("hex");
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.result;
  onCacheMiss?.();
  const result = requestEstimate(normalized);
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, result });
  if (cache.size > 500) {
    for (const [entry, value] of cache) if (value.expiresAt <= now) cache.delete(entry);
    while (cache.size > 500) cache.delete(cache.keys().next().value!);
  }
  try { return await result; } catch (error) {
    if (cache.get(key)?.result === result) cache.delete(key);
    throw error;
  }
}