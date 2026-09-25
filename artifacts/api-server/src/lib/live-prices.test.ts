import { test } from "node:test";
import assert from "node:assert/strict";
import { GetCardPricesResponse } from "@workspace/api-zod";
import {
  aggregateConfirmedSales, getCardPrices, summarizeMarketPrice,
  type ConfirmedSale, type PriceObservation,
} from "./price-domain";
import {
  dedupeDatedSales, serializeLiveListingObservation, serializeLiveSaleObservation,
} from "./live-prices";

const observation = (
  source: string,
  price: number,
  saleStatus: "sold" | "listing",
  sourceType: "SHOP" | "MARKETPLACE",
  observedAt = "2026-09-24T12:00:00.000Z",
): PriceObservation => ({
  source, sourceType, observedAt, price, condition: null, graded: false, grade: null, saleStatus,
});

test("market sale median and shop listing median remain separate", () => {
  const sales = [
    observation("yahoo_auction", 100, "sold", "MARKETPLACE"),
    observation("yahoo_auction", 200, "sold", "MARKETPLACE"),
    observation("yahoo_auction", 300, "sold", "MARKETPLACE"),
  ];
  const listing = observation("hareruya2", 900, "listing", "SHOP");
  const summary = summarizeMarketPrice(sales, [listing]);
  assert.equal(summary.transactionMedian, 200);
  assert.equal(summary.shopMedian, 900);
  assert.equal(summary.marketPrice, 200);
  assert.equal(summary.marketPriceBasis, "confirmed_ungraded_sales");
  assert.equal(summary.marketPriceConfidence, "low");
});

test("three ordinary sale quotes and one extreme outlier filter robustly", () => {
  const values: ConfirmedSale[] = [10000, 10100, 9900, 100000].map((price) => ({
    source: "yahoo_auction", price, daysAgo: 1, priceType: "SALE",
  }));
  const accepted = aggregateConfirmedSales(values, 30);
  assert.deepEqual(accepted.map((item) => item.price).sort((a, b) => a - b), [9900, 10000, 10100]);
  const summary = summarizeMarketPrice(
    accepted.map((item) => observation(item.source, item.price, "sold", "MARKETPLACE")),
    [],
  );
  assert.equal(summary.marketPrice, 10000);
});

test("no observations produce a null price and insufficient confidence", () => {
  assert.deepEqual(summarizeMarketPrice([], []), {
    marketPrice: null, marketPriceBasis: null, marketPriceConfidence: "insufficient",
    transactionMedian: null, shopMedian: null,
  });
});

test("fewer than three sales use an actual shop listing reference when available", () => {
  const fewSales = [
    observation("yahoo_auction", 500, "sold", "MARKETPLACE"),
    observation("yahoo_auction", 600, "sold", "MARKETPLACE"),
  ];
  const fallback = summarizeMarketPrice(fewSales, [observation("hareruya2", 800, "listing", "SHOP")]);
  assert.equal(fallback.marketPrice, 800);
  assert.equal(fallback.marketPriceBasis, "shop_listing_reference");
  assert.equal(fallback.marketPriceConfidence, "low");
  assert.equal(fallback.transactionMedian, 550);
  assert.deepEqual(
    (({ marketPrice, marketPriceBasis, marketPriceConfidence }) => ({ marketPrice, marketPriceBasis, marketPriceConfidence }))
      (summarizeMarketPrice(fewSales, [])),
    { marketPrice: null, marketPriceBasis: null, marketPriceConfidence: "insufficient" },
  );
});

test("confidence requires evidence volume and never rates a single sale source high", () => {
  const oneSourceTenSales = Array.from({ length: 10 }, (_, index) =>
    observation("yahoo_auction", 1000 + index, "sold", "MARKETPLACE"));
  assert.equal(summarizeMarketPrice(oneSourceTenSales, []).marketPriceConfidence, "medium");
  assert.equal(summarizeMarketPrice(oneSourceTenSales.slice(0, 3), []).marketPriceConfidence, "low");
});

test("live observation serializers identify sale and listing categories without grading", () => {
  const sale = serializeLiveSaleObservation({
    source: "yahoo_auction", price: 1234, daysAgo: 1, priceType: "SALE",
    title: "Card 123/190", date: "2026-09-23T12:00:00.000Z",
  });
  assert.deepEqual(sale, {
    source: "yahoo_auction", sourceType: "MARKETPLACE", observedAt: "2026-09-23T12:00:00.000Z",
    price: 1234, condition: null, graded: false, grade: null, saleStatus: "sold",
  });
  const listing = serializeLiveListingObservation({
    source: "hareruya2", displayName: "晴れる屋2", priceType: "LISTING", price: 1400,
    isReference: true, lastUpdated: "2026-09-24T12:00:00.000Z", condition: null,
    stockStatus: "在庫あり", history: [],
  });
  assert.equal(listing.sourceType, "SHOP");
  assert.equal(listing.saleStatus, "listing");
  assert.equal(listing.graded, false);
  assert.equal(listing.grade, null);
});

test("duplicate Yahoo result rows collapse by title, amount, and end time", () => {
  const sale = {
    source: "yahoo_auction", price: 1234, daysAgo: 1, priceType: "SALE" as const,
    title: "Card 123/190", date: "2026-09-23T12:00:00.000Z",
  };
  assert.deepEqual(dedupeDatedSales([sale, { ...sale }, { ...sale, price: 1235 }]), [sale, { ...sale, price: 1235 }]);
});

test("demo price response satisfies the expanded schema and is prominently labeled synthetic", () => {
  const demo = GetCardPricesResponse.parse(getCardPrices("123/190", 30, "demo"));
  assert.ok(["high", "medium", "low"].includes(demo.marketPriceConfidence));
  assert.equal(demo.marketPriceBasis, "confirmed_ungraded_sales");
  assert.equal(demo.summary.psa10Median, null);
  assert.ok(demo.observations.length > 0);
  assert.match(demo.methodology, /^DEMO ONLY/);
});