import { test } from "node:test";
import assert from "node:assert/strict";
import { SearchCardMarketWithAiResponse } from "@workspace/api-zod";
import {
  createAiMarketSearchService,
  normalizeAiMarketIdentity,
  type AiMarketSearchIdentity,
  type WebSearchEvidence,
} from "./ai-market-search";

test("collector number removes a rarity suffix returned by image recognition", () => {
  assert.equal(normalizeAiMarketIdentity({
    cardName: "ハガネール",
    cardNumber: "073/063 AR",
    series: "m11",
    rarity: "AR",
  }).cardNumber, "073/063");
});

const identity: AiMarketSearchIdentity = {
  cardName: "ハガネール",
  cardNumber: "073/063",
  series: "メガ  ブレイブ",
  rarity: "AR",
};
const citation = "https://example.jp/card-price";
const modelJson = JSON.stringify({
  marketPrice: 1200,
  saleMedian: 1100,
  saleCount: 4,
  shopMin: 1300,
  shopMax: 1600,
  buybackMin: null,
  buybackMax: null,
  psa10Median: null,
  explanation: "複数の国内価格情報を確認した参考推定です。",
  sources: [
    { title: "カードの成約情報", url: citation, category: "sale", price: 1100 },
    { title: "カードショップ販売ページ", url: citation, category: "shop", price: 1300 },
    { title: "未検証の別サイト", url: "https://invented.example/card", category: "buyback", price: 900 },
  ],
});
const evidence: WebSearchEvidence = {
  performedWebSearch: true,
  sourceUrls: [citation],
  modelJson,
};

test("only cited tool URLs survive and unsupported price dimensions remain null", async () => {
  const service = createAiMarketSearchService(async () => evidence, () => new Date("2026-09-24T12:00:00.000Z"));
  const result = await service.search(identity);
  assert.equal(result.marketPrice, 1200);
  assert.equal(result.saleMedian, 1100);
  assert.equal(result.saleCount, 4);
  assert.equal(result.shopMin, 1300);
  assert.equal(result.shopMax, 1300);
  assert.equal(result.buybackMin, null);
  assert.equal(result.buybackMax, null);
  assert.equal(result.psa10Median, null);
  assert.deepEqual(result.sources.map((source) => source.url), [citation, citation]);
  assert.equal(result.cardNumber, "073/063");
  assert.equal(result.searchedAt, "2026-09-24T12:00:00.000Z");
});

test("absence of web search citations returns null dimensions and no fabricated sources", async () => {
  const service = createAiMarketSearchService(async () => ({
    performedWebSearch: true,
    sourceUrls: [],
    modelJson,
  }));
  const result = await service.search(identity);
  assert.equal(result.marketPrice, null);
  assert.equal(result.saleMedian, null);
  assert.equal(result.saleCount, null);
  assert.equal(result.psa10Median, null);
  assert.deepEqual(result.sources, []);
  assert.match(result.explanation, /引用可能な/);
});

test("a response with no real web_search_call cannot provide market values", async () => {
  const service = createAiMarketSearchService(async () => ({
    performedWebSearch: false,
    sourceUrls: [citation],
    modelJson,
  }));
  const result = await service.search(identity);
  assert.equal(result.marketPrice, null);
  assert.deepEqual(result.sources, []);
});

test("sale count, out-of-range prices, and unsupported exact values are rejected", async () => {
  const service = createAiMarketSearchService(async () => ({
    ...evidence,
    modelJson: JSON.stringify({
      marketPrice: 1_000_000_000,
      saleMedian: 1100,
      saleCount: 1.5,
      shopMin: null,
      shopMax: null,
      buybackMin: 999,
      buybackMax: 1100,
      psa10Median: 1000,
      explanation: "情報を確認しました。",
      sources: [{ title: "販売ページ", url: citation, category: "sale", price: 1100 }],
    }),
  }));
  const result = await service.search(identity);
  assert.equal(result.marketPrice, null);
  assert.equal(result.saleCount, null);
  assert.equal(result.buybackMin, null);
  assert.equal(result.buybackMax, null);
  assert.equal(result.psa10Median, null);
});

test("separate shop, buyback, and PSA10 dimensions survive response validation", async () => {
  const service = createAiMarketSearchService(async () => ({
    performedWebSearch: true,
    sourceUrls: [citation],
    modelJson: JSON.stringify({
      marketPrice: 800,
      saleMedian: 700,
      saleCount: 3,
      shopMin: 600,
      shopMax: 900,
      buybackMin: 400,
      buybackMax: 450,
      psa10Median: 2000,
      explanation: "検索結果を価格区分ごとに分けました。",
      sources: [
        { title: "未鑑定成約", url: citation, category: "sale", price: 700 },
        { title: "ショップ販売1", url: citation, category: "shop", price: 600 },
        { title: "ショップ販売2", url: citation, category: "shop", price: 900 },
        { title: "ショップ買取1", url: citation, category: "buyback", price: 400 },
        { title: "ショップ買取2", url: citation, category: "buyback", price: 450 },
        { title: "同一カードPSA10成約", url: citation, category: "psa10", price: 2000 },
      ],
    }),
  }), () => new Date("2026-09-24T12:00:00.000Z"));
  const result = await service.search(identity);
  const validated = SearchCardMarketWithAiResponse.parse(result);
  assert.equal(validated.shopMin, 600);
  assert.equal(validated.shopMax, 900);
  assert.equal(validated.buybackMin, 400);
  assert.equal(validated.buybackMax, 450);
  assert.equal(validated.psa10Median, 2000);
});

test("dated archived buyback references do not become current buyback estimates", async () => {
  const archivedBuybackUrl = "https://example.jp/archive/2025/08/buyback-list.pdf";
  const service = createAiMarketSearchService(async () => ({
    performedWebSearch: true,
    sourceUrls: [citation, archivedBuybackUrl],
    modelJson: JSON.stringify({
      marketPrice: 1000,
      saleMedian: 1000,
      saleCount: 3,
      shopMin: null,
      shopMax: null,
      buybackMin: 300,
      buybackMax: 300,
      psa10Median: null,
      explanation: "古い買取資料では300円と記載されています。",
      sources: [
        { title: "最近の成約相場", url: citation, category: "sale", price: 1000 },
        { title: "2025年8月買取表", url: archivedBuybackUrl, category: "buyback", price: 300 },
      ],
    }),
  }), () => new Date("2026-09-24T12:00:00.000Z"));
  const result = await service.search(identity);
  assert.equal(result.buybackMin, null);
  assert.equal(result.buybackMax, null);
  assert.equal(result.sources.find((source) => source.category === "buyback")?.price, null);
  assert.match(result.explanation, /日付の古い買取資料は現行価格として採用していません/);
  assert.doesNotMatch(result.explanation, /300/);
});

test("normalized repeated identity uses five-minute cache, then refreshes", async () => {
  let now = new Date("2026-09-24T12:00:00.000Z");
  let calls = 0;
  const service = createAiMarketSearchService(async () => {
    calls++;
    return evidence;
  }, () => now);
  await service.search(identity);
  await service.search({
    cardName: " ハガネール ",
    cardNumber: "073/063",
    series: "メガ  ブレイブ",
    rarity: "AR",
  });
  assert.equal(calls, 1);
  now = new Date("2026-09-24T12:06:00.000Z");
  await service.search(identity);
  assert.equal(calls, 2);
});