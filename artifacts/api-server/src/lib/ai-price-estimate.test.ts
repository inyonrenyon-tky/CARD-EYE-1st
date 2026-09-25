import assert from "node:assert/strict";
import test from "node:test";
import { candidateFromAiResult, parseNoResultEstimateOutput } from "./ai-price-estimate";
import type { AiMarketSearchResult } from "./ai-market-search";

function research(prices: number[]): AiMarketSearchResult {
  return {
    searchedAt: "2026-09-25T12:00:00.000Z",
    detectedGrade: "ungraded",
    explanation: "同一カードの出典を比較",
    marketPrice: 18000,
    estimates: { ungradedExcellent: { min: 12000, max: 16000, note: "美品の推定" } },
    sources: prices.map((price, index) => ({
      title: `ミュウex M6a 135/103 個別価格 ${index + 1}`,
      url: `https://example.jp/card/${index + 1}`,
      category: "sale",
      price,
    })),
  } as AiMarketSearchResult;
}

test("five cited same-card prices yield their median, not the shop or AI range center", () => {
  const result = candidateFromAiResult(research([13000, 12500, 13000, 13000, 12700]));
  assert.equal(result?.price, 13000);
  assert.equal(result?.calculationMethod, "ai_estimate");
  assert.equal(result?.sampleCount, 0);
  assert.match(result!.note, /独立に検証していない/);
  assert.deepEqual([result?.rangeMin, result?.rangeMax], [12500, 13000]);
});

test("AI market research falls back to an explicitly estimated range center", () => {
  const result = candidateFromAiResult(research([]));
  assert.equal(result?.price, 14000);
  assert.deepEqual([result?.rangeMin, result?.rangeMax], [12000, 16000]);
});

test("cross-source researched point price beats a broad range on a thin shop quote", () => {
  const result = research([]);
  result.marketPrice = 13000;
  result.sources = [
    { category: "shop", price: 14000, title: "ミュウex M6a 135/103 晴れる屋2", url: "https://hareruya.example/card" },
    { category: "ungraded_listing", price: 13000, title: "ミュウex M6a 135/103 参考相場", url: "https://market.example/card" },
  ];
  const selected = candidateFromAiResult(result);
  assert.equal(selected?.price, 13000);
  assert.deepEqual(selected?.sourceNames, ["hareruya.example", "market.example"]);
  assert.equal(selected?.sampleCount, 0);
});

test("quoted ungraded price in a page also mentioning PSA is not thrown away", () => {
  const result = research([]);
  result.marketPrice = 18000; // Above every cited quote: reject the unsupported AI point.
  result.sources = [
    { category: "ungraded_listing", price: 13000, title: "ミュウex FUR 135/103 相場13,000円｜PSA10価格", url: "https://pokecanow.example/card" },
    { category: "shop", price: 17800, title: "ミュウex FUR 135/103 販売", url: "https://shop-a.example/card" },
    { category: "shop", price: 11800, title: "ミュウex FUR 135/103 状態B", url: "https://shop-b.example/card" },
  ];
  const selected = candidateFromAiResult(result);
  assert.equal(selected?.price, 13000);
  assert.equal(selected?.comparisonCount, 1);
  assert.equal(selected?.evidenceType, "ai_research");
});

test("one specifically identified market page remains usable against a single shop quote", () => {
  const result = research([]);
  result.cardNumber = "135/103";
  result.marketPrice = 18000;
  result.sources = [{
    category: "ungraded_listing", price: 13000,
    title: "ミュウex FUR 135/103 相場13,000円｜PSA10価格",
    url: "https://pokecanow.example/card",
  }];
  const selected = candidateFromAiResult(result);
  assert.equal(selected?.price, 13000);
  assert.equal(selected?.comparisonCount, 1);
  assert.equal(selected?.sourceNames[0], "pokecanow.example");
});

test("an aggregate market page labeled sale is not counted as five verified sales", () => {
  const result = research([]);
  result.cardNumber = "135/103";
  result.marketPrice = 15000;
  result.sources = [
    { category: "shop", price: 14800, title: "ミュウex FUR 135/103 販売", url: "https://shop-a.example/card" },
    { category: "sale", price: 13000, title: "ミュウex FUR 135/103 相場13,000円｜PSA10価格（直近5件中央値）", url: "https://pokecanow.example/card" },
  ];
  const selected = candidateFromAiResult(result);
  assert.equal(selected?.price, 13000);
  assert.equal(selected?.comparisonCount, 1);
  assert.equal(selected?.sampleCount, 0);
  assert.match(selected!.note, /個別の成約5件.*独立に検証した数字ではありません/);
});

test("PSA-only evidence cannot price an ungraded card", () => {
  const result = research([]);
  result.estimates.ungradedExcellent = { min: null, max: null, note: "" };
  result.sources = [{ category: "psa10", price: 60000, title: "PSA10 ミュウex", url: "https://example.jp/grade" }];
  assert.equal(candidateFromAiResult(result), null);
});

test("reasoning-only estimate needs a safe integer price and stated reason", () => {
  assert.equal(parseNoResultEstimateOutput('{"price":13000,"rationale":"M6aのFURと同一カードの売価を慎重に比較"}')?.price, 13000);
  assert.equal(parseNoResultEstimateOutput('{"price":null,"rationale":"不明"}'), null);
  assert.equal(parseNoResultEstimateOutput('{"price":12000,"rationale":""}'), null);
});