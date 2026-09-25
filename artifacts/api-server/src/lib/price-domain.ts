export const PERIODS = [7, 30, 90, 365] as const;
export type PeriodDays = (typeof PERIODS)[number];
export type PriceMode = "demo" | "live";

export type PriceSourceConfig = {
  source: string;
  displayName: string;
  type: "SHOP" | "MARKETPLACE";
  capabilities: Array<"LISTING" | "TRANSACTION" | "BUYBACK">;
};

export type PriceListing = {
  source: string; displayName: string; priceType: "LISTING"; price: number; isReference: boolean;
  lastUpdated: string; condition: string | null; stockStatus: string | null;
  history: Array<{ date: string; price: number }>;
};
export type PriceBuyback = { source: string; displayName: string; priceType: "BUYBACK"; price: number; lastUpdated: string };
export type PriceTransactionSummary = {
  source: string; displayName: string; priceType: "SALE"; medianPrice: number | null;
  transactionCount: number; highestPrice: number | null; lowestPrice: number | null;
  lastUpdated: string | null; history: Array<{ date: string; price: number }>;
};
export type PriceObservation = {
  source: string;
  sourceType: "SHOP" | "MARKETPLACE";
  observedAt: string;
  price: number;
  condition: string | null;
  graded: false;
  grade: null;
  saleStatus: "sold" | "listing" | "buyback";
};
export type MarketPriceBasis = "confirmed_ungraded_sales" | "shop_listing_reference" | null;
export type MarketPriceConfidence = "high" | "medium" | "low" | "insufficient";

export function summarizeMarketPrice(sales: PriceObservation[], listings: PriceObservation[]) {
  const transactionMedian = median(sales.map((item) => item.price));
  const shopMedian = median(listings.map((item) => item.price));
  let marketPrice: number | null = null;
  let marketPriceBasis: MarketPriceBasis = null;
  let marketPriceConfidence: MarketPriceConfidence = "insufficient";

  if (sales.length >= 3) {
    marketPrice = transactionMedian;
    marketPriceBasis = "confirmed_ungraded_sales";
    const saleSources = new Set(sales.map((item) => item.source));
    marketPriceConfidence = sales.length >= 20 && saleSources.size >= 2
      ? "high"
      : sales.length >= 10 ? "medium" : "low";
  } else if (shopMedian !== null) {
    marketPrice = shopMedian;
    marketPriceBasis = "shop_listing_reference";
    marketPriceConfidence = "low";
  }

  return { marketPrice, marketPriceBasis, marketPriceConfidence, transactionMedian, shopMedian };
}

export const sourceConfigs: PriceSourceConfig[] = [
  { source: "cardrush", displayName: "カードラッシュ", type: "SHOP", capabilities: ["LISTING", "BUYBACK"] },
  { source: "hareruya2", displayName: "晴れる屋2", type: "SHOP", capabilities: ["LISTING", "BUYBACK"] },
  { source: "mercari", displayName: "メルカリ", type: "MARKETPLACE", capabilities: ["LISTING", "TRANSACTION"] },
  { source: "yahoo_auction", displayName: "Yahoo!オークション", type: "MARKETPLACE", capabilities: ["TRANSACTION"] },
  { source: "snkrdunk", displayName: "SNKRDUNK", type: "MARKETPLACE", capabilities: ["TRANSACTION"] },
];

const round = (value: number) => Math.round(value);
export const median = (values: number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : round((sorted[middle - 1] + sorted[middle]) / 2);
};
const isoDaysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

type Sale = { source: string; price: number; daysAgo: number; priceType: "SALE" };
export type ConfirmedSale = Sale;
const demoSales: Sale[] = [];
for (let day = 0; day < 365; day += 3) {
  demoSales.push({ source: "mercari", price: 14200 + ((day * 37) % 1800), daysAgo: day, priceType: "SALE" });
  if (day % 2 === 0) demoSales.push({ source: "yahoo_auction", price: 14900 + ((day * 29) % 1700), daysAgo: day, priceType: "SALE" });
  if (day % 3 === 0) demoSales.push({ source: "snkrdunk", price: 15400 + ((day * 23) % 1400), daysAgo: day, priceType: "SALE" });
}

const source = (id: string) => sourceConfigs.find((item) => item.source === id)!;

/** Remove extreme confirmed-sale observations without allowing small samples to vanish. */
export function removeRobustOutliers(values: ConfirmedSale[]): ConfirmedSale[] {
  if (values.length < 4) return [...values];
  const sorted = values.map((item) => item.price).sort((a, b) => a - b);
  const center = median(sorted)!;
  const deviations = sorted.map((value) => Math.abs(value - center));
  const mad = median(deviations) ?? 0;
  if (mad > 0) {
    const threshold = 3.5 * mad;
    return values.filter((item) => Math.abs(item.price - center) <= threshold);
  }
  // When most quotes match, MAD is zero; IQR can still be inflated by one
  // extreme quote in a small sample, so bound distance from the mode instead.
  const tolerance = Math.max(1000, center * 0.25);
  return values.filter((item) => Math.abs(item.price - center) <= tolerance);
}

export function aggregateConfirmedSales(values: ConfirmedSale[], periodDays: PeriodDays) {
  const inPeriod = values.filter((sale) => sale.priceType === "SALE" && sale.daysAgo < periodDays);
  const filtered = removeRobustOutliers(inPeriod);
  return filtered;
}

const listingHistory = (sourceId: string, periodDays: PeriodDays) => {
  const base = sourceId === "cardrush" ? 15800 : 16000;
  return Array.from({ length: periodDays }, (_, index) => {
    const daysAgo = periodDays - 1 - index;
    return { date: isoDaysAgo(daysAgo), price: base + ((daysAgo * (sourceId === "cardrush" ? 17 : 13)) % 401) - 200 };
  });
};

export function getCardPrices(cardId: string, periodDays: PeriodDays, mode: PriceMode) {
  if (mode === "live") {
    return {
      cardId, currency: "JPY" as const, mode, periodDays, marketPrice: null, reference: null,
      marketPriceConfidence: "insufficient" as const, marketPriceBasis: null,
      observations: [] as PriceObservation[],
      summary: { transactionMedian: null, shopMedian: null, buybackMedian: null, psa10Median: null, transactionCount: 0, confidenceScore: null, highestPrice: null, lowestPrice: null, changePercent: null },
      sources: { sales: [] as PriceListing[], transactions: [] as PriceTransactionSummary[], buybacks: [] as PriceBuyback[] },
      sourceConfigs, methodology: "Live provider integrations are not configured; no prices are available.",
    };
  }

  const now = new Date().toISOString();
  const sales: PriceListing[] = [
    { source: "cardrush", displayName: "カードラッシュ", priceType: "LISTING", price: 15800, isReference: true, lastUpdated: now, condition: "中古・良品", stockStatus: "在庫あり", history: listingHistory("cardrush", periodDays) },
    { source: "hareruya2", displayName: "晴れる屋2", priceType: "LISTING", price: 16000, isReference: false, lastUpdated: now, condition: "中古・良品", stockStatus: "在庫あり", history: listingHistory("hareruya2", periodDays) },
  ];
  const buybacks: PriceBuyback[] = [
    { source: "cardrush", displayName: "カードラッシュ", priceType: "BUYBACK", price: 12500, lastUpdated: now },
    { source: "hareruya2", displayName: "晴れる屋2", priceType: "BUYBACK", price: 12000, lastUpdated: now },
  ];
  const cutoff = aggregateConfirmedSales(demoSales, periodDays);
  const transactions = sourceConfigs.filter((config) => config.capabilities.includes("TRANSACTION")).map((config) => {
    const items = cutoff.filter((sale) => sale.source === config.source).sort((a, b) => b.daysAgo - a.daysAgo);
    return {
      source: config.source, displayName: config.displayName, priceType: "SALE" as const, medianPrice: median(items.map((item) => item.price)),
      transactionCount: items.length, highestPrice: items.length ? Math.max(...items.map((item) => item.price)) : null,
      lowestPrice: items.length ? Math.min(...items.map((item) => item.price)) : null,
      lastUpdated: items.length ? isoDaysAgo(items[items.length - 1].daysAgo) : null,
      history: items.slice().reverse().map((item) => ({ date: isoDaysAgo(item.daysAgo), price: item.price })),
    } satisfies PriceTransactionSummary;
  });
  const allPrices = cutoff.map((item) => item.price);
  const timeOrdered = [...cutoff].sort((a, b) => b.daysAgo - a.daysAgo);
  const windowSize = Math.max(1, Math.floor(timeOrdered.length / 3));
  const earlierMedian = median(timeOrdered.slice(0, windowSize).map((item) => item.price));
  const latestMedian = median(timeOrdered.slice(-windowSize).map((item) => item.price));
  const changePercent = timeOrdered.length >= 2 && earlierMedian && latestMedian
    ? round(((latestMedian - earlierMedian) / earlierMedian) * 1000) / 10
    : null;
  const transactionMedian = median(allPrices);
  const observations: PriceObservation[] = [
    ...sales.map((item) => ({
      source: item.source, sourceType: "SHOP" as const, observedAt: item.lastUpdated, price: item.price,
      condition: item.condition, graded: false as const, grade: null, saleStatus: "listing" as const,
    })),
    ...cutoff.map((item) => ({
      source: item.source, sourceType: "MARKETPLACE" as const, observedAt: isoDaysAgo(item.daysAgo), price: item.price,
      condition: null, graded: false as const, grade: null, saleStatus: "sold" as const,
    })),
  ];
  const marketSummary = summarizeMarketPrice(
    observations.filter((item) => item.saleStatus === "sold"),
    observations.filter((item) => item.saleStatus === "listing"),
  );
  return {
    cardId, currency: "JPY" as const, mode, periodDays,
    marketPrice: marketSummary.marketPrice,
    marketPriceConfidence: marketSummary.marketPriceConfidence,
    marketPriceBasis: marketSummary.marketPriceBasis,
    observations,
    reference: { source: "cardrush", price: 15800 },
    summary: {
      transactionMedian, shopMedian: median(sales.map((item) => item.price)), psa10Median: null,
      buybackMedian: median(buybacks.map((item) => item.price)), transactionCount: allPrices.length,
      confidenceScore: allPrices.length ? Math.min(95, 60 + Math.min(35, allPrices.length)) : null,
      highestPrice: allPrices.length ? Math.max(...allPrices) : null, lowestPrice: allPrices.length ? Math.min(...allPrices) : null,
      changePercent,
    },
    sources: { sales, transactions, buybacks }, sourceConfigs,
    methodology: "DEMO ONLY — ALL PRICES AND OBSERVATIONS ARE SYNTHETIC FIXTURES, NOT LIVE PROVIDER DATA. Demonstrates separate listing and sale categories; market median pools demo individual sale fixtures. Confidence is illustrative only.",
  };
}