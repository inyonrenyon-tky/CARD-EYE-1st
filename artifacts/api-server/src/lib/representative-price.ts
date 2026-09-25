export type RepresentativeEvidenceType = "verified_sale" | "auction_closed" | "shop_listing" | "ai_research";
export type RepresentativeMethod =
  | "recent_sales_median" | "extended_sales_median" | "sales_plus_shop"
  | "shop_median" | "limited_market_estimate" | "observed_market_median" | "ai_estimate";
export type RepresentativeConfidence = "high" | "medium" | "low" | "insufficient";

export type RepresentativeObservation = {
  source: string;
  price: number;
  observedAt: string;
  evidenceType: RepresentativeEvidenceType;
  graded: boolean;
  conditionClass: "beautiful" | "unverified";
  identityCertain: boolean;
};

export type RepresentativePrice = {
  price: number | null;
  condition: "beautiful_ungraded" | "condition_unverified" | "ai_estimated";
  calculationMethod: RepresentativeMethod | null;
  confidenceScore: number | null;
  confidenceLabel: RepresentativeConfidence;
  sampleCount: number;
  windowDays: 14 | 30 | 60 | 90 | null;
  calculatedAt: string;
  lastObservedAt: string | null;
  sourceNames: string[];
  evidenceType: RepresentativeEvidenceType | null;
  rangeMin: number | null;
  rangeMax: number | null;
  note: string;
};

export const representativePricingConfig = {
  windows: [14, 30, 60, 90] as const,
  level1: { windowDays: 14, minimumSales: 10, minimumSources: 2 },
  level2: { minimumSales: 5, minimumSources: 1, firstWindowDays: 30 },
  level3: { minimumSales: 1, minimumShopSources: 1, maximumRelativeDisagreement: 0.35 },
  level4: { minimumShopSources: 2 },
  maximumSampleAgeDays: 90,
  sourceReliability: {
    verified_sale: 0.9,
    shop_listing: 0.62,
    auction_closed: 0.35,
    ai_research: 0.2,
  } as Record<RepresentativeEvidenceType, number>,
  highConfidenceMinimum: 0.8,
  mediumConfidenceMinimum: 0.6,
} as const;

const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};

const roundScore = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;

function removeOutliers(items: RepresentativeObservation[]) {
  if (items.length < 4) return items;
  const center = median(items.map((item) => item.price))!;
  const deviations = items.map((item) => Math.abs(item.price - center));
  const mad = median(deviations) ?? 0;
  const threshold = mad > 0 ? 3.5 * mad : Math.max(1, center * 0.25);
  return items.filter((item) => Math.abs(item.price - center) <= threshold);
}

function makeResult(
  items: RepresentativeObservation[],
  price: number,
  method: RepresentativeMethod,
  windowDays: 14 | 30 | 60 | 90,
  calculatedAt: string,
  labelCeiling: "high" | "medium" | "low",
  agreement = 1,
): RepresentativePrice {
  const ordered = [...items].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const sources = [...new Set(items.map((item) => item.source))].sort();
  const saleCount = items.filter((item) => item.evidenceType === "verified_sale").length;
  const independentFactor = Math.min(1, sources.length / 3);
  const countFactor = Math.min(1, items.length / (method === "recent_sales_median" ? 15 : 8));
  const latestAgeDays = Math.max(0, (Date.parse(calculatedAt) - Date.parse(ordered.at(-1)!.observedAt)) / 86_400_000);
  const recencyFactor = Math.max(0.55, 1 - latestAgeDays / 180);
  const values = items.map((item) => item.price);
  const center = median(values) ?? price;
  const deviations = values.map((value) => Math.abs(value - center));
  const dispersion = center > 0 ? (median(deviations) ?? 0) / center : 1;
  const dispersionFactor = Math.max(0.4, 1 - Math.min(0.6, dispersion * 2));
  const reliability = items.reduce((sum, item) =>
    sum + representativePricingConfig.sourceReliability[item.evidenceType], 0) / items.length;
  const conditionFactor = items.every((item) => item.conditionClass === "beautiful") ? 1 : 0.55;
  const identityFactor = items.every((item) => item.identityCertain) ? 1 : 0;
  const saleFactor = saleCount ? 1 : 0.65;
  const score = roundScore(
    (0.18 + countFactor * 0.2 + independentFactor * 0.15 + recencyFactor * 0.12
      + dispersionFactor * 0.12 + reliability * 0.13 + agreement * 0.1)
      * conditionFactor * identityFactor * saleFactor,
  );
  const ceilingRank = { low: 0, medium: 1, high: 2 }[labelCeiling];
  const byScore: RepresentativeConfidence = score >= representativePricingConfig.highConfidenceMinimum
    ? "high"
    : score >= representativePricingConfig.mediumConfidenceMinimum ? "medium" : "low";
  const scoreRank = { low: 0, medium: 1, high: 2 }[byScore];
  const label: RepresentativeConfidence = (scoreRank > ceilingRank ? labelCeiling : byScore);
  const evidenceTypes = new Set(items.map((item) => item.evidenceType));
  const evidenceType: RepresentativeEvidenceType = evidenceTypes.has("verified_sale")
    ? "verified_sale"
    : evidenceTypes.has("shop_listing") ? "shop_listing" : "auction_closed";
  return {
    price, condition: items.every((item) => item.conditionClass === "beautiful")
      ? "beautiful_ungraded" : "condition_unverified", calculationMethod: method, confidenceScore: score,
    confidenceLabel: label, sampleCount: items.length, windowDays, calculatedAt,
    lastObservedAt: ordered.at(-1)!.observedAt, sourceNames: sources, evidenceType,
    rangeMin: Math.min(...values), rangeMax: Math.max(...values),
    note: `${windowDays}日間の${items.every((item) => item.conditionClass === "beautiful") ? "明示的な美品" : "状態未確認"}の実観測データ${items.length}件を${method}で集計（出典: ${sources.join("、")}）。観測価格範囲は${Math.min(...values)}～${Math.max(...values)}円です。${items.length === 1 ? "観測は1件のみです。" : ""}カードの同一性を確認できる情報を使用しています。${items.some((item) => item.conditionClass === "unverified") ? "状態未確認の価格を含みます。" : ""}${items.some((item) => item.evidenceType === "auction_closed") ? "終了済み・入札ありのオークションですが、落札完了・取引成立は確認されていません。" : ""}`,
  };
}

/**
 * Deterministic, identity-qualified observed pricing. Unknown condition is
 * admitted only as a low-confidence fallback after beautiful-condition evidence.
 * The caller must not pass AI estimates or demo fixtures here.
 */
export function calculateRepresentativePrice(
  observations: RepresentativeObservation[],
  calculatedAt = new Date().toISOString(),
): RepresentativePrice {
  const now = Date.parse(calculatedAt);
  const seen = new Set<string>();
  const eligible = observations.filter((item) => {
    const age = (now - Date.parse(item.observedAt)) / 86_400_000;
    const key = `${item.source}|${item.evidenceType}|${item.observedAt}|${item.price}`;
    if (seen.has(key)) return false;
    const qualifies = Number.isFinite(now) && Number.isFinite(Date.parse(item.observedAt))
      && Number.isFinite(item.price) && item.price > 0 && age >= 0
      && age <= representativePricingConfig.maximumSampleAgeDays && !item.graded
       && (item.evidenceType === "verified_sale" || item.evidenceType === "shop_listing" || item.evidenceType === "auction_closed")
      && item.identityCertain;
    if (qualifies) seen.add(key);
    return qualifies;
  });
  const inWindow = (items: RepresentativeObservation[], days: number) =>
    items.filter((item) => (now - Date.parse(item.observedAt)) / 86_400_000 <= days);
  const sales = eligible.filter((item) => item.evidenceType === "verified_sale" && item.conditionClass === "beautiful");
  const shops = eligible.filter((item) => item.evidenceType === "shop_listing");
  const auctions = eligible.filter((item) => item.evidenceType === "auction_closed");
  const beautiful = (items: RepresentativeObservation[]) =>
    items.filter((item) => item.conditionClass === "beautiful");
  const unverified = (items: RepresentativeObservation[]) =>
    items.filter((item) => item.conditionClass === "unverified");
  const observedQuotes = [...shops, ...auctions];

  const recentSales = inWindow(sales, representativePricingConfig.level1.windowDays);
  const robustRecent = removeOutliers(recentSales);
  if (robustRecent.length >= representativePricingConfig.level1.minimumSales
    && new Set(robustRecent.map((item) => item.source)).size >= representativePricingConfig.level1.minimumSources) {
    return makeResult(robustRecent, median(robustRecent.map((item) => item.price))!, "recent_sales_median", 14, calculatedAt, "high");
  }

  for (const window of representativePricingConfig.windows.filter((days) => days >= representativePricingConfig.level2.firstWindowDays)) {
    const windowSales = removeOutliers(inWindow(sales, window));
    if (windowSales.length >= representativePricingConfig.level2.minimumSales
      && new Set(windowSales.map((item) => item.source)).size >= representativePricingConfig.level2.minimumSources) {
      return makeResult(windowSales, median(windowSales.map((item) => item.price))!,
        window === 30 ? "recent_sales_median" : "extended_sales_median", window, calculatedAt, "medium");
    }
  }

  for (const window of representativePricingConfig.windows) {
    const windowSales = removeOutliers(inWindow(sales, window));
    const windowShops = beautiful(inWindow(shops, window));
    const salesMedian = median(windowSales.map((item) => item.price));
    const shopMedian = median(windowShops.map((item) => item.price));
    if (windowSales.length >= representativePricingConfig.level3.minimumSales && windowShops.length
      && salesMedian !== null && shopMedian !== null) {
      const disagreement = Math.abs(salesMedian - shopMedian) / salesMedian;
      if (disagreement <= representativePricingConfig.level3.maximumRelativeDisagreement) {
        const weightedMedian = median([...windowSales.map((item) => item.price), ...windowSales.map((item) => item.price), shopMedian])!;
        const combined = [...windowSales, ...windowShops];
        return makeResult(combined, weightedMedian, "sales_plus_shop", window, calculatedAt, "medium", 1 - disagreement);
      }
    }
  }

  for (const window of representativePricingConfig.windows) {
    const windowShops = beautiful(inWindow(shops, window));
    if (new Set(windowShops.map((item) => item.source)).size >= representativePricingConfig.level4.minimumShopSources) {
      return makeResult(windowShops, median(windowShops.map((item) => item.price))!, "shop_median", window, calculatedAt, "low");
    }
  }

  // For low-volume markets use real shop/ended-auction observations only.
  // Explicitly beautiful quotes take precedence; otherwise condition-unknown
  // quotes may support a clearly disclosed low-confidence median.
  for (const selected of [beautiful(observedQuotes), unverified(observedQuotes)]) {
    if (!selected.length) continue;
    for (const window of representativePricingConfig.windows) {
      const samples = removeOutliers(inWindow(selected, window));
      if (!samples.length) continue;
      const price = median(samples.map((item) => item.price))!;
      const method = "observed_market_median";
      return makeResult(samples, price, method, window, calculatedAt, "low");
    }
  }

  return {
    price: null, condition: "beautiful_ungraded", calculationMethod: null, confidenceScore: null,
    confidenceLabel: "insufficient", sampleCount: 0, windowDays: null, calculatedAt,
    lastObservedAt: null, sourceNames: [], evidenceType: null, rangeMin: null, rangeMax: null,
    note: "代表価格を算出できる実観測根拠がありません。AI推定値・デモ価格は使用していません。",
  };
}