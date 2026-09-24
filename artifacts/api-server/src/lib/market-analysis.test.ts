import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateMarketAnalysis } from "./market-analysis";
import { optionalMarketExplanation } from "./market-explanation";
import type { MarketPriceSnapshot, PriceObservation } from "./market-price-provider";

const now = new Date("2026-09-24T12:00:00.000Z");
const cardId = "123/190";
const day = 86_400_000;
const sale = (daysAgo: number, price: number, source = "verified_sale"): PriceObservation => ({
  cardId, source, price, observedAt: new Date(now.getTime() - (daysAgo + 0.5) * day).toISOString(),
  currency: "JPY", priceType: "SALE",
});
const snapshot = (observations: PriceObservation[]): MarketPriceSnapshot => ({
  observations, sourceAvailability: [], methodology: "Test-only synthetic observations.",
});
const daily = (count: number, price: (age: number) => number) =>
  Array.from({ length: count }, (_, age) => sale(age, price(age)));

test("recent price above 90-day average is calculated without AI", () => {
  const report = calculateMarketAnalysis(cardId, snapshot(daily(90, (age) => age < 7 ? 12000 : 10000)), null, now);
  assert.equal(report.currentPrice, 12000);
  assert.equal(report.currentPriceBasis, "SALE");
  assert.ok(report.average90d! < report.currentPrice!);
  assert.ok(report.deviationFrom90d! > 0);
  assert.ok(report.change7d! > 0);
  assert.equal(report.aiExplanation, null);
});

test("recent price below 90-day average reports negative deviation", () => {
  const report = calculateMarketAnalysis(cardId, snapshot(daily(90, (age) => age < 7 ? 8000 : 10000)), null, now);
  assert.ok(report.average90d! > report.currentPrice!);
  assert.ok(report.deviationFrom90d! < 0);
  assert.ok(report.change7d! < 0);
});

test("large short-term price variation is measured from transactions only", () => {
  const report = calculateMarketAnalysis(cardId, snapshot([
    ...daily(60, (age) => age < 30 ? age % 2 ? 6000 : 14000 : 10000),
    {
      cardId, source: "shop", price: 99000, priceType: "LISTING", currency: "JPY",
      observedAt: now.toISOString(),
    },
  ]), null, now);
  assert.ok(report.volatilityPercent! > 15);
  assert.equal(report.indicators.volatility, "直近30日の価格変動が大きい");
  assert.ok(report.average30d! < 20000);
  assert.equal(report.volume30d, 30);
});

test("three observations have low confidence and missing period metrics", () => {
  const report = calculateMarketAnalysis(cardId, snapshot([sale(1, 9000), sale(40, 10000), sale(80, 11000)]), null, now);
  assert.equal(report.dataConfidence, "low");
  assert.equal(report.average7d, null);
  assert.equal(report.change7d, null);
  assert.ok(report.confidenceReasons.length > 0);
});

test("no history and listing-only history never invent sale averages", () => {
  const empty = calculateMarketAnalysis(cardId, snapshot([]), null, now);
  assert.equal(empty.currentPrice, null);
  assert.equal(empty.average90d, null);
  assert.equal(empty.dataConfidence, "insufficient");
  assert.deepEqual(empty.marketEvents, []);
  assert.doesNotMatch(empty.analysisSummary, /¥\d/);
  const listing = calculateMarketAnalysis(cardId, snapshot([{
    cardId, source: "shop", price: 15000, observedAt: now.toISOString(),
    currency: "JPY", priceType: "LISTING",
  }]), null, now);
  assert.equal(listing.currentPrice, 15000);
  assert.equal(listing.currentPriceBasis, "LISTING");
  assert.equal(listing.average90d, null);
  assert.equal(listing.deviationFrom90d, null);
});

test("visible card condition is a separate observation and never adjusts price", () => {
  const observations = daily(30, () => 10000);
  const finding = { status: "uncertain" as const, confidence: 0.5, note: "写真では判断困難" };
  const report = calculateMarketAnalysis(cardId, snapshot(observations), {
    imageQuality: "acceptable", retakeRecommended: false, overallConfidence: 0.5,
    qualityChecks: {
      wholeCardVisible: true, focusSufficient: true, strongGlare: false,
      cropped: false, conditionAssessable: true,
    },
    surface: finding, corners: finding, edges: finding,
    whitening: { status: "minor", confidence: 0.6, note: "白かけの可能性" },
    centering: finding, scratches: finding, limitations: [],
  }, now);
  assert.match(report.conditionSummary!, /白かけ/);
  assert.equal(report.currentPrice, 10000);
  assert.equal(report.average30d, 10000);
});

test("OpenAI timeout or 429 leaves deterministic indicators intact", async () => {
  const report = calculateMarketAnalysis(cardId, snapshot(daily(60, () => 10000)), null, now);
  const explanation = await optionalMarketExplanation(
    { confidence: "low", trend: report.trend, volatility: "limited", conditionAvailable: false },
    async () => { throw new Error("429 / timeout"); },
  );
  assert.equal(explanation, null);
  assert.equal(report.average30d, 10000);
  assert.equal(report.currentPrice, 10000);
});