import { test } from "node:test";
import assert from "node:assert/strict";
import { GetCardPricesResponse } from "@workspace/api-zod";
import { calculateRepresentativePrice, type RepresentativeObservation } from "./representative-price";
import { buildHareruyaObservations, explicitlyBeautifulACondition, observedConditionClass, representativeIdentityMatches } from "./live-prices";
import { getCardPrices } from "./price-domain";

const calculatedAt = "2026-10-01T12:00:00.000Z";
const ago = (days: number) => new Date(Date.parse(calculatedAt) - days * 86_400_000).toISOString();
const observation = (
  source: string,
  price: number,
  days: number,
  evidenceType: RepresentativeObservation["evidenceType"] = "verified_sale",
  additions: Partial<RepresentativeObservation> = {},
): RepresentativeObservation => ({
  source, price, observedAt: ago(days), evidenceType,
  graded: false, conditionClass: "beautiful", identityCertain: true, ...additions,
});

test("level 1 uses the 14-day verified-sale median and high-confidence evidence", () => {
  const sales = Array.from({ length: 10 }, (_, index) =>
    observation(index % 2 ? "market_b" : "market_a", 10000 + index * 20, index % 14));
  const price = calculateRepresentativePrice(sales, calculatedAt);
  assert.equal(price.calculationMethod, "recent_sales_median");
  assert.equal(price.windowDays, 14);
  assert.equal(price.price, 10090);
  assert.equal(price.confidenceLabel, "high");
  assert.equal(price.evidenceType, "verified_sale");
});

test("level 2 widens to 60 days for enough verified sales", () => {
  const sales = Array.from({ length: 5 }, (_, index) =>
    observation("verified_market", 12000 + index * 100, 35 + index));
  const price = calculateRepresentativePrice(sales, calculatedAt);
  assert.equal(price.calculationMethod, "extended_sales_median");
  assert.equal(price.windowDays, 60);
  assert.equal(price.sampleCount, 5);
  assert.equal(price.confidenceLabel, "medium");
});

test("level 3 combines one verified sale with a coherent shop, weighting sales twice", () => {
  const samples = [
    observation("verified_market", 10000, 2),
    observation("shop_a", 10500, 1, "shop_listing"),
  ];
  const price = calculateRepresentativePrice(samples, calculatedAt);
  assert.equal(price.calculationMethod, "sales_plus_shop");
  assert.equal(price.price, 10000);
  assert.equal(price.evidenceType, "verified_sale");
  assert.ok(price.note.includes("verified_market"));
  assert.ok(price.note.includes("shop_a"));
});

test("level 4 uses a median across independent explicitly-qualified shop sources", () => {
  const samples = [
    observation("shop_a", 10000, 2, "shop_listing"),
    observation("shop_b", 12000, 3, "shop_listing"),
  ];
  const price = calculateRepresentativePrice(samples, calculatedAt);
  assert.equal(price.calculationMethod, "shop_median");
  assert.equal(price.price, 11000);
  assert.equal(price.confidenceLabel, "low");
  assert.deepEqual(price.sourceNames, ["shop_a", "shop_b"]);
});

test("level 5 caps a single shop or ended auction at low confidence", () => {
  const shop = calculateRepresentativePrice([
    observation("shop_only", 8000, 1, "shop_listing"),
  ], calculatedAt);
  assert.equal(shop.calculationMethod, "observed_market_median");
  assert.equal(shop.confidenceLabel, "low");

  const auction = calculateRepresentativePrice([
    observation("yahoo_auction", 7500, 2, "auction_closed"),
  ], calculatedAt);
  assert.equal(auction.calculationMethod, "observed_market_median");
  assert.equal(auction.evidenceType, "auction_closed");
  assert.equal(auction.confidenceLabel, "low");
  assert.match(auction.note, /落札完了・取引成立は確認されていません/);
});

test("level 6 is explicit and unavailable when evidence is absent or unqualified", () => {
  const price = calculateRepresentativePrice([
    observation("shop_a", 10000, 1, "shop_listing", { conditionClass: "unverified", identityCertain: false }),
    observation("sale_a", 9000, 1, "verified_sale", { identityCertain: false }),
    observation("graded_sale", 12000, 1, "verified_sale", { graded: true }),
  ], calculatedAt);
  assert.equal(price.price, null);
  assert.equal(price.calculationMethod, null);
  assert.equal(price.confidenceLabel, "insufficient");
  assert.equal(price.sampleCount, 0);
  assert.equal(price.windowDays, null);
});

test("outliers are excluded and stale data widens only within configured windows", () => {
  const sales = [
    ...[9900, 10000, 10100, 100000].map((price) => observation("market_a", price, 3)),
    observation("shop_a", 10000, 2, "shop_listing"),
  ];
  const result = calculateRepresentativePrice(sales, calculatedAt);
  assert.equal(result.price, 10000);
  assert.equal(result.sampleCount, 4);

  const stale = Array.from({ length: 5 }, (_, index) =>
    observation("market_a", 10000 + index * 10, 91 + index));
  assert.equal(calculateRepresentativePrice(stale, calculatedAt).price, null);
});

test("duplicate input observations do not inflate the sample threshold", () => {
  const fourSales = Array.from({ length: 4 }, (_, index) =>
    observation("market_a", 10000 + index * 20, index));
  const repeated = [...fourSales, { ...fourSales[0] }];
  assert.equal(calculateRepresentativePrice(repeated, calculatedAt).price, null);
});

test("explicit condition qualification rejects inferred, mint, graded, damaged, set and duplicate titles", () => {
  assert.equal(explicitlyBeautifulACondition("Card title 美品"), true);
  assert.equal(explicitlyBeautifulACondition("Card title 状態A"), true);
  assert.equal(explicitlyBeautifulACondition("Card title ランクA"), true);
  assert.equal(explicitlyBeautifulACondition("Card title A−〜A"), true);
  assert.equal(explicitlyBeautifulACondition("Card title 美品 A-"), true);
  assert.equal(explicitlyBeautifulACondition("Card title SV2a 123/190"), false);
  assert.equal(explicitlyBeautifulACondition("Card title 美品以上"), false);
  assert.equal(explicitlyBeautifulACondition("Card title 極美品"), false);
  assert.equal(explicitlyBeautifulACondition("Card title A to B"), false);
  assert.equal(explicitlyBeautifulACondition("Card title 状態A−〜B"), false);
  assert.equal(explicitlyBeautifulACondition("Card title 美品 状態B"), false);
  assert.equal(explicitlyBeautifulACondition("Card title 美品 ランクB"), false);
  assert.equal(explicitlyBeautifulACondition("Card title 美品 Grade 10"), false);
  assert.equal(explicitlyBeautifulACondition("Card title 美品 良品"), false);
  assert.equal(explicitlyBeautifulACondition("Card title 美品 並品"), false);
  for (const text of [
    "Card title PSA10", "Card title 状態A PSA10",
    "Card title 美品 傷あり", "Card title 美品 セット", "Card title 美品 2枚組",
    "Card title 美品 2枚",
  ]) assert.equal(explicitlyBeautifulACondition(text), false, text);
});

test("condition-unverified Hareruya stock retains legacy detail and remains observed representative evidence", () => {
  const result = buildHareruyaObservations([{
    title: "SV2a Card Name #123/190",
    variants: [{ available: true, price: 125000, title: "通常" }],
  }], "123/190", "Card Name", calculatedAt, "SV2a");
  assert.equal(result.listing?.price, 1250);
  assert.equal(result.listing?.condition, null);
  assert.equal(result.representativeShopListings.length, 1);
  assert.equal(result.representativeShopListings[0].conditionClass, "unverified");
});

test("qualified Hareruya stock preserves original price and separately reports only explicit condition price", () => {
  const result = buildHareruyaObservations([{
    title: "SV2a Card Name #123/190",
    variants: [
      { available: true, price: 90000, title: "通常" },
      { available: true, price: 120000, title: "美品" },
    ],
  }], "123/190", "Card Name", calculatedAt, "SV2a");
  assert.equal(result.listing?.price, 900);
  assert.equal(result.listing?.condition, null);
  assert.equal(result.representativeShopListings.length, 2);
  assert.deepEqual(result.representativeShopListings.map((item) => item.price).sort((a, b) => a - b), [900, 1200]);
  assert.equal(result.representativeShopListings.find((item) => item.price === 900)?.conditionClass, "unverified");
  assert.equal(result.representativeShopListings.find((item) => item.price === 1200)?.conditionClass, "beautiful");
});

test("observed medians prefer beautiful evidence, then disclose unknown-condition and unverified auction prices", () => {
  const unknown = [
    observation("shop_a", 10000, 1, "shop_listing", { conditionClass: "unverified" }),
    observation("yahoo_auction", 12000, 2, "auction_closed", { conditionClass: "unverified" }),
  ];
  const unknownMedian = calculateRepresentativePrice(unknown, calculatedAt);
  assert.equal(unknownMedian.calculationMethod, "observed_market_median");
  assert.equal(unknownMedian.price, 11000);
  assert.equal(unknownMedian.condition, "condition_unverified");
  assert.equal(unknownMedian.confidenceLabel, "low");
  assert.equal(unknownMedian.sampleCount, 2);
  assert.match(unknownMedian.note, /状態未確認/);
  assert.match(unknownMedian.note, /落札完了・取引成立は確認されていません/);

  const preferBeautiful = calculateRepresentativePrice([
    ...unknown,
    observation("shop_beautiful", 9000, 3, "shop_listing"),
  ], calculatedAt);
  assert.equal(preferBeautiful.condition, "beautiful_ungraded");
  assert.equal(preferBeautiful.price, 9000);
  assert.equal(preferBeautiful.sampleCount, 1);
});

test("one quote is disclosed as n=1 and strict identity/status rules reject conflicts", () => {
  const one = calculateRepresentativePrice([
    observation("shop_a", 7500, 1, "shop_listing", { conditionClass: "unverified" }),
  ], calculatedAt);
  assert.equal(one.price, 7500);
  assert.equal(one.sampleCount, 1);
  assert.match(one.note, /1件のみ/);

  assert.equal(observedConditionClass("Card title 通常"), "unverified");
  assert.equal(observedConditionClass("Card title 状態B"), null);
  assert.equal(observedConditionClass("Card title PSA10"), null);
  assert.equal(observedConditionClass("Card title 美品 傷あり"), null);
  assert.equal(representativeIdentityMatches("SV2a Card Name 123/190", "SV2a"), true);
  assert.equal(representativeIdentityMatches("SV2a Card Name 123/190", "S12a"), false);
  assert.equal(representativeIdentityMatches("SV2a Card Name 123/190", undefined), false);
  assert.equal(representativeIdentityMatches("S12a SV2a Card Name 123/190", "SV2a"), false);
  assert.equal(representativeIdentityMatches("SV2a SR Card Name 123/190", "SV2a", "AR"), false);
});

test("unknown conditions do not produce a representative price without a same-card observation", () => {
  const empty = calculateRepresentativePrice([], calculatedAt);
  assert.equal(empty.price, null);
  assert.equal(empty.condition, "beautiful_ungraded");
  assert.equal(empty.calculationMethod, null);
  assert.equal(empty.confidenceLabel, "insufficient");
  assert.equal(empty.sampleCount, 0);
  const stale = calculateRepresentativePrice([
    observation("shop_a", 10000, 91, "shop_listing", { conditionClass: "unverified" }),
  ], calculatedAt);
  assert.equal(stale.price, null);
});

test("observed quote windows widen to 30, 60, and 90 days and reject price outliers", () => {
  for (const [days, expectedWindow] of [[20, 30], [45, 60], [75, 90]] as const) {
    const result = calculateRepresentativePrice([
      observation("shop_a", 10000, days, "shop_listing", { conditionClass: "unverified" }),
    ], calculatedAt);
    assert.equal(result.windowDays, expectedWindow);
    assert.equal(result.price, 10000);
  }
  const robust = calculateRepresentativePrice([
    ...[10000, 10000, 10000].map((price, index) =>
      observation(`shop_${index}`, price, index, "shop_listing", { conditionClass: "unverified" })),
    observation("shop_outlier", 100000, 3, "shop_listing", { conditionClass: "unverified" }),
  ], calculatedAt);
  assert.equal(robust.price, 10000);
  assert.equal(robust.sampleCount, 3);
});

test("Hareruya representative evidence is limited to available variants with exact card and set identity", () => {
  const result = buildHareruyaObservations([
    {
      title: "SV2a Card Name #123/190",
      variants: [
        { available: true, price: 100000, title: "通常" },
        { available: false, price: 90000, title: "美品" },
        { available: true, price: 120000, title: "PSA10" },
        { available: true, price: 130000, title: "状態B" },
      ],
    },
    { title: "S12a Card Name #123/190", variants: [{ available: true, price: 80000, title: "美品" }] },
    { title: "SV2a Other Name #123/190", variants: [{ available: true, price: 80000, title: "美品" }] },
    { title: "SV2a Card Name #124/190", variants: [{ available: true, price: 80000, title: "美品" }] },
  ], "123/190", "Card Name", calculatedAt, "SV2a");
  assert.equal(result.representativeShopListings.length, 1);
  assert.equal(result.representativeShopListings[0].price, 1000);
  assert.equal(result.representativeShopListings[0].conditionClass, "unverified");
});

test("demo API response satisfies representative schema but cannot supply a representative price", () => {
  const demo = GetCardPricesResponse.parse(getCardPrices("123/190", 30, "demo"));
  assert.equal(demo.representative.price, null);
  assert.equal(demo.representative.calculationMethod, null);
  assert.equal(demo.representative.confidenceLabel, "insufficient");
  assert.equal(demo.representative.sampleCount, 0);

  const observed = calculateRepresentativePrice([
    observation("shop_a", 10000, 1, "shop_listing", { conditionClass: "unverified" }),
  ], calculatedAt);
  assert.equal(GetCardPricesResponse.parse({ ...demo, representative: observed }).representative.condition, "condition_unverified");
  const ai = GetCardPricesResponse.parse({
    ...demo,
    representative: {
      ...demo.representative, price: 10000, condition: "ai_estimated", calculationMethod: "ai_estimate",
      confidenceScore: 0.2, confidenceLabel: "low", sampleCount: 0, windowDays: null,
      lastObservedAt: null, sourceNames: ["ai_research"], evidenceType: "ai_research",
      rangeMin: null, rangeMax: null, note: "AI推定値",
    },
  });
  assert.equal(ai.representative.evidenceType, "ai_research");
  assert.equal(ai.representative.sampleCount, 0);
});