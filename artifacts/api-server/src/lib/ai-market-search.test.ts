import { test } from "node:test";
import assert from "node:assert/strict";
import { SearchCardMarketWithAiResponse } from "@workspace/api-zod";
import {
  createAiMarketSearchService,
  broadenedReferenceRange,
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
  estimates: {
    ungradedPlayed: { min: 300, max: 700, note: "傷あり/プレイ用" },
    ungradedExcellent: { min: 900, max: 1500, note: "美品の概算" },
    ungradedMint: { min: 1500, max: 2200, note: "極美品の概算" },
    psa9: { min: 5000, max: 8000, note: "PSA9" },
    psa10: { min: 9000, max: 12000, note: "PSA10" },
    psa10Listing: { min: 11000, max: 15000, note: "PSA10出品" },
  },
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
  assert.deepEqual([result.referenceMin, result.referenceMax], [900, 2200]);
  assert.equal(result.buybackMin, null);
  assert.equal(result.buybackMax, null);
  assert.equal(result.psa10Median, null);
  assert.deepEqual(result.sources.map((source) => source.url), [citation, citation]);
  assert.equal(result.cardNumber, "073/063");
  assert.equal(result.searchedAt, "2026-09-24T12:00:00.000Z");
  assert.match(result.estimates.ungradedPlayed.note, /^AI推定・未確認/);
  assert.match(result.estimates.ungradedMint.note, /^AI推定・未確認/);
});

test("AI reference estimates remain explicitly unverified without citations", async () => {
  const service = createAiMarketSearchService(async () => ({
    performedWebSearch: true,
    sourceUrls: [],
    modelJson,
  }));
  const result = await service.search(identity);
  assert.equal(result.marketPrice, 1200);
  assert.deepEqual([result.referenceMin, result.referenceMax], [900, 2200]);
  assert.equal(result.saleMedian, null);
  assert.equal(result.saleCount, null);
  assert.equal(result.psa10Median, null);
  assert.deepEqual(result.sources, []);
  assert.equal(result.detectedGrade, "unknown");
});

test("a photographed PSA10 vintage card keeps condition, mint, and grade estimates separate", async () => {
  const service = createAiMarketSearchService(async () => ({
    performedWebSearch: true,
    sourceUrls: [citation],
    modelJson: JSON.stringify({
      identityNote: "画像ラベルのLV.15とPSA10を確認。旧裏のマチスのピカチュウを対象に推定。",
      detectedGrade: "PSA10",
      marketPrice: 13000,
      estimates: {
        ungradedPlayed: { min: 3000, max: 8000, note: "並品の概算" },
        ungradedExcellent: { min: 10000, max: 30000, note: "美品の概算" },
        ungradedMint: { min: 30000, max: 40000, note: "極美品の概算" },
        psa9: { min: 30000, max: 60000, note: "PSA9の概算" },
        psa10: { min: 430000, max: 500000, note: "PSA10の概算" },
        psa10Listing: { min: 600000, max: null, note: "出品価格の概算・成約ではない" },
      },
      saleMedian: null, saleCount: null, shopMin: null, shopMax: null,
      buybackMin: null, buybackMax: null, psa10Median: null,
      explanation: "状態差と鑑定グレードを分けたAI概算。",
      sources: [{ title: "PSA10出品中", url: citation, category: "psa10_listing", price: 600000 }],
    }),
  }), () => new Date("2026-09-25T12:00:00.000Z"));
  const result = SearchCardMarketWithAiResponse.parse(await service.search({
    cardName: "マチスのピカチュウ", cardNumber: "No.025", series: "旧裏",
    imageBase64: "photo-with-psa-label", mimeType: "image/jpeg",
  }));
  assert.equal(result.detectedGrade, "PSA10");
  assert.deepEqual([result.referenceMin, result.referenceMax], [10000, 40000]);
  assert.deepEqual([result.estimates.psa10.min, result.estimates.psa10.max], [430000, 500000]);
  assert.deepEqual([result.estimates.ungradedMint.min, result.estimates.ungradedMint.max], [30000, 40000]);
  assert.equal(result.psa10Median, null);
  assert.equal(result.sources[0].category, "psa10_listing");
  assert.deepEqual(broadenedReferenceRange(result.estimates), { referenceMin: 10000, referenceMax: 40000 });
});

test("reference is only the complete ungradedExcellent range and never falls back", async () => {
  const service = createAiMarketSearchService(async () => ({
    performedWebSearch: true,
    sourceUrls: [citation],
    modelJson: JSON.stringify({
      marketPrice: 1200,
      estimates: {
        ungradedPlayed: { min: 100, max: 200, note: "並品" },
        ungradedExcellent: { min: 500, max: null, note: "美品の上限不明" },
        ungradedMint: { min: 3000, max: 5000, note: "極美品" },
        psa9: { min: 10000, max: 20000, note: "PSA9" },
        psa10: { min: 30000, max: 50000, note: "PSA10" },
        psa10Listing: { min: null, max: null, note: "" },
      },
      sources: [{ title: "ショップ販売", url: citation, category: "shop", price: 900 }],
    }),
  }));
  const result = await service.search(identity);
  assert.deepEqual([result.referenceMin, result.referenceMax], [null, null]);
  assert.deepEqual([result.estimates.ungradedMint.min, result.estimates.ungradedMint.max], [3000, 5000]);
});

test("reference is unavailable when either ungraded tier is inverted", async () => {
  const base = JSON.parse(modelJson);
  base.estimates.ungradedExcellent = { min: 1800, max: 900, note: "逆転した美品帯" };
  base.estimates.ungradedMint = { min: 2000, max: 3000, note: "極美品" };
  const result = await createAiMarketSearchService(async () => ({
    performedWebSearch: true, sourceUrls: [citation], modelJson: JSON.stringify(base),
  })).search(identity);
  assert.deepEqual([result.estimates.ungradedExcellent.min, result.estimates.ungradedExcellent.max], [1800, 900]);
  assert.deepEqual([result.referenceMin, result.referenceMax], [null, null]);

  base.estimates.ungradedExcellent = { min: 900, max: 1500, note: "美品" };
  base.estimates.ungradedMint = { min: 2200, max: 2000, note: "逆転した極美品帯" };
  const invertedMint = await createAiMarketSearchService(async () => ({
    performedWebSearch: true, sourceUrls: [citation], modelJson: JSON.stringify(base),
  })).search({ ...identity, cardNumber: "074/063" });
  assert.deepEqual([invertedMint.referenceMin, invertedMint.referenceMax], [null, null]);

  base.estimates.ungradedExcellent = { min: 1900, max: 2000, note: "美品" };
  base.estimates.ungradedMint = { min: 1500, max: 1800, note: "極美品" };
  const crossedBands = await createAiMarketSearchService(async () => ({
    performedWebSearch: true, sourceUrls: [citation], modelJson: JSON.stringify(base),
  })).search({ ...identity, cardNumber: "077/063" });
  assert.deepEqual([crossedBands.referenceMin, crossedBands.referenceMax], [null, null]);

  base.estimates.ungradedExcellent = { min: 900, max: 1500, note: "美品" };
  base.estimates.ungradedMint = { min: 1400, max: 1450, note: "極美品の上限が美品より低い" };
  const crossedUpperBound = await createAiMarketSearchService(async () => ({
    performedWebSearch: true, sourceUrls: [citation], modelJson: JSON.stringify(base),
  })).search({ ...identity, cardNumber: "078/063" });
  assert.deepEqual([crossedUpperBound.referenceMin, crossedUpperBound.referenceMax], [null, null]);

  base.estimates.ungradedMint = { min: 800, max: 2200, note: "極美品の下限が美品より低い" };
  const crossedLowerBound = await createAiMarketSearchService(async () => ({
    performedWebSearch: true, sourceUrls: [citation], modelJson: JSON.stringify(base),
  })).search({ ...identity, cardNumber: "079/063" });
  assert.deepEqual([crossedLowerBound.referenceMin, crossedLowerBound.referenceMax], [null, null]);
});

function pricedRows(rows: Array<{ title: string; category: "sale" | "shop" | "ungraded_listing" | "psa10_listing"; price: number }>) {
  const sourceUrls = rows.map((_, index) => `https://shop${index}.example.jp/card`);
  return {
    performedWebSearch: true,
    sourceUrls,
    modelJson: JSON.stringify({
      marketPrice: null,
      estimates: {
        ungradedPlayed: { min: null, max: null, note: "" },
        ungradedExcellent: { min: 900, max: 1100, note: "美品" },
        ungradedMint: { min: null, max: null, note: "" },
        psa9: { min: null, max: null, note: "" },
        psa10: { min: null, max: null, note: "" },
        psa10Listing: { min: null, max: null, note: "" },
      },
      saleMedian: 1000,
      saleCount: 3,
      sources: rows.map((row, index) => ({
        ...row,
        title: `${row.title} 073/063`,
        url: sourceUrls[index],
      })),
    }),
  };
}

test("two ordinary ungraded sources and one scam-low shop row exclude and explain only the low outlier", async () => {
  const evidence = pricedRows([
    { title: "ショップ販売", category: "shop", price: 1000 },
    { title: "ショップ販売", category: "shop", price: 1100 },
    { title: "ショップ販売", category: "shop", price: 50 },
  ]);
  const result = await createAiMarketSearchService(async () => evidence).search(identity);
  assert.deepEqual(result.sources.map((source) => source.price), [1000, 1100]);
  assert.deepEqual([result.shopMin, result.shopMax], [1000, 1100]);
  assert.match(result.explanation, /外れ値を1件除外/);
});

test("implausibly high ungraded ask is excluded while ordinary sources remain", async () => {
  const evidence = pricedRows([
    { title: "ショップ販売", category: "shop", price: 1000 },
    { title: "ショップ販売", category: "ungraded_listing", price: 1100 },
    { title: "ショップ販売", category: "shop", price: 5000 },
  ]);
  const result = await createAiMarketSearchService(async () => evidence).search(identity);
  assert.deepEqual(result.sources.map((source) => source.price), [1000, 1100]);
  assert.deepEqual([result.shopMin, result.shopMax], [1000, 1000]);
});

test("repeated malicious quotes from one origin cannot outweigh two normal origins", async () => {
  const rows = [
    ...Array.from({ length: 8 }, (_, index) => ({
      title: `安値販売 ${index}`,
      category: "shop" as const,
      price: 100,
    })),
    { title: "通常価格", category: "shop" as const, price: 10000 },
    { title: "通常価格", category: "shop" as const, price: 11000 },
  ];
  const evidence = pricedRows(rows);
  const parsed = JSON.parse(evidence.modelJson!);
  for (let index = 0; index < 8; index++) {
    parsed.sources[index].url = `https://malicious.example.jp/quote/${index}`;
  }
  parsed.sources[8].url = "https://normal-one.example.jp/card";
  parsed.sources[9].url = "https://normal-two.example.jp/card";
  const result = await createAiMarketSearchService(async () => ({
    ...evidence,
    sourceUrls: parsed.sources.map((source: { url: string }) => source.url) as string[],
    modelJson: JSON.stringify(parsed),
  })).search(identity);
  assert.deepEqual(result.sources.map((source) => source.price), [10000, 11000]);
  assert.deepEqual([result.shopMin, result.shopMax], [10000, 11000]);
  assert.match(result.explanation, /外れ値を8件除外/);
});

test("three clean ungraded origins suppress a badly divergent A−〜A range but preserve PSA estimates", async () => {
  const evidence = pricedRows([
    { title: "ショップ販売", category: "shop", price: 10000 },
    { title: "ショップ販売", category: "shop", price: 9900 },
    { title: "ショップ販売", category: "ungraded_listing", price: 10100 },
  ]);
  const parsed = JSON.parse(evidence.modelJson!);
  parsed.estimates.ungradedExcellent = { min: 100, max: 500, note: "AIの美品概算" };
  parsed.estimates.psa10 = { min: 90000, max: 120000, note: "PSA10相場" };
  const result = await createAiMarketSearchService(async () => ({ ...evidence, modelJson: JSON.stringify(parsed) })).search(identity);
  assert.deepEqual([result.estimates.ungradedExcellent.min, result.estimates.ungradedExcellent.max], [null, null]);
  assert.deepEqual([result.referenceMin, result.referenceMax], [null, null]);
  assert.deepEqual([result.estimates.psa10.min, result.estimates.psa10.max], [90000, 120000]);
  assert.match(result.explanation, /美品\(A−〜A\)推定と参考範囲を抑制/);
});

test("a high-priced listing for an actual promo target is not classified as a variant or scam by its promo rationale", async () => {
  const evidence = pricedRows([
    { title: "プロモカード", category: "shop", price: 10000 },
    { title: "プロモカード", category: "shop", price: 10500 },
    { title: "プロモカード", category: "shop", price: 50000 },
  ]);
  const result = await createAiMarketSearchService(async () => evidence).search({
    ...identity,
    rarity: "PROMO",
  });
  assert.equal(result.sources.length, 3);
  assert.equal(result.shopMax, 50000);
});

test("sale aggregates exclude an implausibly low ungraded sale with three independent comparables", async () => {
  const evidence = pricedRows([
    { title: "落札済み", category: "sale", price: 1000 },
    { title: "落札済み", category: "sale", price: 1100 },
    { title: "落札済み", category: "sale", price: 50 },
  ]);
  const result = await createAiMarketSearchService(async () => evidence).search(identity);
  assert.deepEqual(result.sources.map((source) => source.price), [1000, 1100]);
  assert.equal(result.saleMedian, 1000);
  assert.equal(result.saleCount, 2);
  assert.match(result.explanation, /外れ値を1件除外/);
});

test("sale count becomes null when excluded sale rows cannot be reconciled to the reported count", async () => {
  const evidence = pricedRows([
    { title: "落札済み", category: "sale", price: 1000 },
    { title: "落札済み", category: "sale", price: 1100 },
    { title: "落札済み", category: "sale", price: 50 },
  ]);
  const parsed = JSON.parse(evidence.modelJson!);
  parsed.saleCount = 12;
  const result = await createAiMarketSearchService(async () => ({ ...evidence, modelJson: JSON.stringify(parsed) })).search(identity);
  assert.equal(result.saleMedian, 1000);
  assert.equal(result.saleCount, null);
});

test("PSA10 high listing is never compared against ungraded shop prices", async () => {
  const evidence = pricedRows([
    { title: "ショップ販売", category: "shop", price: 1000 },
    { title: "ショップ販売", category: "shop", price: 1100 },
    { title: "PSA10 鑑定品出品", category: "psa10_listing", price: 500000 },
  ]);
  const result = await createAiMarketSearchService(async () => evidence).search(identity);
  assert.equal(result.sources.length, 3);
  assert.equal(result.sources.find((source) => source.category === "psa10_listing")?.price, 500000);
  assert.deepEqual([result.shopMin, result.shopMax], [1000, 1100]);
});

test("documented damage price is retained but excluded from clean shop bands", async () => {
  const evidence = pricedRows([
    { title: "ショップ販売", category: "shop", price: 1000 },
    { title: "ショップ販売", category: "shop", price: 1100 },
    { title: "傷あり・折れあり", category: "shop", price: 50 },
  ]);
  const result = await createAiMarketSearchService(async () => evidence).search(identity);
  assert.equal(result.sources.length, 3);
  assert.equal(result.sources.find((source) => source.price === 50)?.price, 50);
  assert.deepEqual([result.shopMin, result.shopMax], [1000, 1100]);
});

test("one or two independent prices are not filtered based on a weak baseline", async () => {
  const evidence = pricedRows([
    { title: "ショップ販売", category: "shop", price: 1000 },
    { title: "ショップ販売", category: "shop", price: 10 },
  ]);
  const result = await createAiMarketSearchService(async () => evidence).search(identity);
  assert.deepEqual(result.sources.map((source) => source.price), [1000, 10]);
  assert.deepEqual([result.shopMin, result.shopMax], [10, 1000]);
  assert.doesNotMatch(result.explanation, /外れ値を/);
});

test("source titles with a conflicting collector number are excluded", async () => {
  const evidence = pricedRows([
    { title: "ハガネール", category: "shop", price: 1000 },
    { title: "別バリアント", category: "shop", price: 50000 },
  ]);
  // The shared helper appends the requested number; replace one with a conflicting variant.
  const parsed = JSON.parse(evidence.modelJson!);
  parsed.sources[1].title = "ハガネール 074/063";
  const result = await createAiMarketSearchService(async () => ({ ...evidence, modelJson: JSON.stringify(parsed) })).search(identity);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].price, 1000);
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
        { title: "美品 A−〜A ショップ買取1", url: citation, category: "buyback", price: 400 },
        { title: "極美品 A〜S ショップ買取2", url: citation, category: "buyback", price: 450 },
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

test("buybacks require a cited, fresh, ungraded explicit A−〜A or A〜S condition", async () => {
  const service = createAiMarketSearchService(async () => ({
    performedWebSearch: true,
    sourceUrls: [citation],
    modelJson: JSON.stringify({
      estimates: {
        ungradedPlayed: { min: 100, max: 200, note: "" },
        ungradedExcellent: { min: 700, max: 1000, note: "" },
        ungradedMint: { min: 1000, max: 1400, note: "" },
        psa9: { min: 5000, max: 6000, note: "" },
        psa10: { min: 9000, max: 10000, note: "" },
        psa10Listing: { min: null, max: null, note: "" },
      },
      sources: [
        { title: "美品 A−〜A 買取 073/063", url: citation, category: "buyback", price: 600 },
        { title: "極美品の買取 073/063", url: citation, category: "buyback", price: 550 },
        { title: "A〜S プレイ用 買取 073/063", url: citation, category: "buyback", price: 700 },
        { title: "PSA10 A〜S 買取 073/063", url: citation, category: "buyback", price: 800 },
        { title: "カード買取 073/063", url: citation, category: "buyback", price: 500 },
      ],
    }),
  }), () => new Date("2026-09-24T12:00:00.000Z"));
  const result = await service.search(identity);
  assert.deepEqual([result.buybackMin, result.buybackMax], [550, 600]);
  assert.equal(result.sources.filter((source) => source.category === "buyback").length, 5);
  assert.deepEqual(
    result.sources.filter((source) => source.category === "buyback").map((source) => source.price),
    [600, 550, null, null, null],
  );
});

test("buybacks above shop minimum are suppressed individually instead of violating sale-vs-buyback order", async () => {
  const service = createAiMarketSearchService(async () => ({
    performedWebSearch: true,
    sourceUrls: [citation],
    modelJson: JSON.stringify({
      estimates: {
        ungradedPlayed: { min: 100, max: 200, note: "" },
        ungradedExcellent: { min: 900, max: 1200, note: "" },
        ungradedMint: { min: 1200, max: 4000, note: "" },
        psa9: { min: null, max: null, note: "" },
        psa10: { min: null, max: null, note: "" },
        psa10Listing: { min: null, max: null, note: "" },
      },
      sources: [
        { title: "美品以上 販売 075/063", url: citation, category: "shop", price: 1400 },
        { title: "A−〜A 買取 075/063", url: citation, category: "buyback", price: 1300 },
        { title: "A〜S 買取 075/063", url: citation, category: "buyback", price: 1500 },
        { title: "A〜S 買取 075/063", url: citation, category: "buyback", price: 2100 },
      ],
    }),
  }), () => new Date("2026-09-24T12:00:00.000Z"));
  const result = await service.search({ ...identity, cardNumber: "075/063" });
  assert.deepEqual([result.referenceMin, result.referenceMax], [900, 4000]);
  assert.deepEqual([result.shopMin, result.shopMax], [1400, 1400]);
  assert.deepEqual([result.buybackMin, result.buybackMax], [1300, 1300]);
  assert.ok(result.shopMin! >= result.buybackMax!);
  assert.deepEqual(
    result.sources.filter((source) => source.category === "buyback").map((source) => source.price),
    [1300, null, null],
  );
  assert.match(result.explanation, /矛盾がある買取価格を2件除外/);
});

test("buyback quotes above the beautiful-plus-mint reference ceiling are suppressed", async () => {
  const service = createAiMarketSearchService(async () => ({
    performedWebSearch: true,
    sourceUrls: [citation],
    modelJson: JSON.stringify({
      estimates: {
        ungradedPlayed: { min: 100, max: 200, note: "" },
        ungradedExcellent: { min: 900, max: 1200, note: "" },
        ungradedMint: { min: 1200, max: 2000, note: "" },
        psa9: { min: null, max: null, note: "" },
        psa10: { min: null, max: null, note: "" },
        psa10Listing: { min: null, max: null, note: "" },
      },
      sources: [
        { title: "A−〜A 買取 076/063", url: citation, category: "buyback", price: 1300 },
        { title: "A〜S 買取 076/063", url: citation, category: "buyback", price: 2100 },
      ],
    }),
  }));
  const result = await service.search({ ...identity, cardNumber: "076/063" });
  assert.deepEqual([result.buybackMin, result.buybackMax], [1300, 1300]);
  assert.deepEqual(
    result.sources.filter((source) => source.category === "buyback").map((source) => source.price),
    [1300, null],
  );
  assert.match(result.explanation, /美品以上参考上限/);
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
  assert.match(result.explanation, /300/);
  assert.match(result.explanation, /古い買取資料は現行価格として採用していません/);
});

test("normalized repeated text identity uses hourly cache, then refreshes", async () => {
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
  now = new Date("2026-09-24T13:01:00.000Z");
  await service.search(identity);
  assert.equal(calls, 2);
});

test("text-only AI research survives a service restart until its one-hour expiry", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createFileAiMarketCache } = await import("./ai-market-cache");
  const directory = await mkdtemp(join(tmpdir(), "card-eye-price-test-"));
  try {
    let now = new Date("2026-09-24T12:00:00.000Z");
    let calls = 0;
    let reservations = 0;
    const provider = async () => { calls++; return evidence; };
    const store = createFileAiMarketCache(directory);
    await createAiMarketSearchService(provider, () => now, store).search(identity, () => { reservations++; });
    const afterRestart = createAiMarketSearchService(provider, () => now, store);
    const cached = await afterRestart.search(identity, () => { reservations++; });
    assert.equal(cached.cardNumber, identity.cardNumber);
    assert.equal(calls, 1);
    assert.equal(reservations, 1);
    now = new Date("2026-09-24T13:01:00.000Z");
    await createAiMarketSearchService(provider, () => now, store).search(identity, () => { reservations++; });
    assert.equal(calls, 2);
    assert.equal(reservations, 2);
    await createAiMarketSearchService(provider, () => now, store).search(
      { ...identity, imageBase64: "photo", mimeType: "image/jpeg" }, () => { reservations++; },
    );
    assert.equal(calls, 3, "photo-aware research must not reuse text-only results");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("cache hits do not reserve quota, including concurrent requests", async () => {
  let calls = 0;
  let reservations = 0;
  const service = createAiMarketSearchService(async () => { calls++; return evidence; });
  await Promise.all(Array.from({ length: 3 }, () =>
    service.search(identity, () => { reservations++; }),
  ));
  assert.equal(reservations, 1);
  assert.equal(calls, 1);
  await service.search({ ...identity, cardNumber: "074/063" }, () => { reservations++; });
  assert.equal(reservations, 2);
});

test("photo-based market research refreshes after five minutes", async () => {
  let now = new Date("2026-09-24T12:00:00.000Z");
  let calls = 0;
  const service = createAiMarketSearchService(async () => { calls++; return evidence; }, () => now);
  const photoIdentity = { ...identity, imageBase64: "one-photo", mimeType: "image/jpeg" as const };
  await service.search(photoIdentity);
  now = new Date("2026-09-24T12:06:00.000Z");
  await service.search(photoIdentity);
  assert.equal(calls, 2);
});

test("separate scan photos of the same card never share an image-aware research result", async () => {
  let calls = 0;
  const service = createAiMarketSearchService(async () => { calls++; return evidence; });
  await service.search({ ...identity, imageBase64: "image-one", mimeType: "image/jpeg" });
  await service.search({ ...identity, imageBase64: "image-two", mimeType: "image/jpeg" });
  assert.equal(calls, 2);
});