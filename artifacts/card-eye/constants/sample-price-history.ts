/**
 * Illustrative prices only. This module is deliberately independent of the
 * market API so the overview can later receive a real PriceOverview provider.
 */
export type PricePeriod = 7 | 30 | 90 | 180;

export type PricePoint = {
  date: string;
  price: number;
};

export type PriceOverview = {
  period: PricePeriod;
  currentPrice: number;
  highestPrice: number;
  lowestPrice: number;
  averagePrice: number;
  transactionCount: number;
  points: PricePoint[];
};

// A fixed, fictional series keeps the figures stable for every card. Never
// derive these numbers from a scanned card or present them as actual sales.
const SAMPLE_END_DATE = '2026-09-23';
const DAY_MS = 24 * 60 * 60 * 1000;
const endTime = Date.parse(`${SAMPLE_END_DATE}T00:00:00Z`);
const sampleSeries = Array.from({ length: 181 }, (_, index) => {
  const day = index - 180;
  const price = Math.round(
    (12800 + index * 12 + Math.sin(index * 0.18) * 680 + Math.cos(index * 0.57) * 240) / 100,
  ) * 100;
  return {
    date: new Date(endTime + day * DAY_MS).toISOString().slice(0, 10),
    price,
    sampleCount: 1 + (index % 4),
  };
});

export function getSamplePriceOverview(period: PricePeriod): PriceOverview {
  const selected = sampleSeries.slice(-period);
  const prices = selected.map((point) => point.price);
  return {
    period,
    currentPrice: prices[prices.length - 1],
    highestPrice: Math.max(...prices),
    lowestPrice: Math.min(...prices),
    averagePrice: Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length / 100) * 100,
    transactionCount: selected.reduce((sum, point) => sum + point.sampleCount, 0),
    points: selected.map(({ date, price }) => ({ date, price })),
  };
}