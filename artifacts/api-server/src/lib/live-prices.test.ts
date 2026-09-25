import { test } from "node:test";
import assert from "node:assert/strict";
import { GetCardPricesQueryParams, GetCardPricesResponse } from "@workspace/api-zod";
import {
  aggregateConfirmedSales, getCardPrices, summarizeMarketPrice,
  type ConfirmedSale, type PriceObservation,
} from "./price-domain";
import {
  buildHareruyaObservations, dedupeDatedSales, representativeIdentityMatches,
  serializeLiveListingObservation, serializeLiveSaleObservation,
} from "./live-prices";

const observation = (
  source: string,
  price: number,
  saleStatus: "sold" | "auction_closed" | "listing",
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
    price: 1234, condition: null, graded: false, grade: null, saleStatus: "auction_closed",
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

test("Yahoo ended bid-positive observation is not a confirmed sale or confirmed-sale market basis", () => {
  const sale = serializeLiveSaleObservation({
    source: "yahoo_auction", price: 1234, daysAgo: 1, priceType: "SALE",
    title: "Card 123/190", date: "2026-09-23T12:00:00.000Z",
  });
  assert.equal(sale.saleStatus, "auction_closed");
  const summary = summarizeMarketPrice([sale], []);
  assert.notEqual(summary.marketPriceBasis, "confirmed_ungraded_sales");
});

test("duplicate Yahoo result rows collapse by title, amount, and end time", () => {
  const sale = {
    source: "yahoo_auction", price: 1234, daysAgo: 1, priceType: "SALE" as const,
    title: "Card 123/190", date: "2026-09-23T12:00:00.000Z",
  };
  assert.deepEqual(dedupeDatedSales([sale, { ...sale }, { ...sale, price: 1235 }]), [sale, { ...sale, price: 1235 }]);
});

test("representative evidence requires exact provider-visible set code for shared number and name", () => {
  const products = [
    { title: "Card Name SV3 #123/190", variants: [{ available: true, price: 90000, title: "美品" }] },
    { title: "Card Name SV2a #123/190", variants: [{ available: true, price: 120000, title: "美品" }] },
  ];
  const result = buildHareruyaObservations(products, "123/190", "Card Name", "2026-09-24T12:00:00.000Z", "SV2a");
  assert.equal(result.listing?.price, 1050); // legacy detail still contains both same-name/card-number matches
  assert.deepEqual(result.representativeShopListings.map((item) => item.price), [1200]);
  assert.equal(representativeIdentityMatches("Card Name SV2ab #123/190", "SV2a"), false);
  assert.equal(representativeIdentityMatches("Card Name SV3 #123/190", "SV2a"), false);
  assert.equal(representativeIdentityMatches("Card Name SV2a #123/190", undefined), false);
  assert.equal(representativeIdentityMatches("Card Name SV2a SAR #123/190", "SV2a", "SAR"), true);
  assert.equal(representativeIdentityMatches("Card Name SV2a SR #123/190", "SV2a", "SAR"), false);
});

test("an explicit product 美品 cannot override contradictory variant ランクB", () => {
  const result = buildHareruyaObservations([{
    title: "Card Name SV2a #123/190 美品",
    variants: [{ available: true, price: 120000, title: "ランクB" }],
  }], "123/190", "Card Name", "2026-09-24T12:00:00.000Z", "SV2a");
  assert.equal(result.listing?.price, 1200);
  assert.deepEqual(result.representativeShopListings, []);
});

test("manual series query is optional but restricted to a validated set-code token", () => {
  assert.equal(GetCardPricesQueryParams.parse({}).series, undefined);
  assert.equal(GetCardPricesQueryParams.parse({ series: "SV2a" }).series, "SV2a");
  assert.throws(() => GetCardPricesQueryParams.parse({ series: "SV2a/../other" }));
});

test("manual identity without explicit series retains legacy listing but withholds representative", async () => {
  const originalFetch = globalThis.fetch;
  const past = new Date(Date.now() - 86_400_000).toISOString();
  let productFetches = 0;
  const auctionState = {
    props: {
      pageProps: {
        initialState: {
          search: {
            items: {
              listing: {
                items: [{
                  title: "Manual Test Card SV2a #123/190 美品", price: 5000, bidCount: 1,
                  isFleamarketItem: false, endTime: past,
                }],
              },
            },
          },
        },
      },
    },
  };
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("hareruya2.com/search")) {
      return new Response('<a href="/products/920001">card</a>', { status: 200 });
    }
    if (url.includes("/products/920001.js")) {
      productFetches += 1;
      return new Response(JSON.stringify({
        title: "Manual Test Card SV2a #123/190",
        variants: [{ available: true, price: 800000, title: "通常" }],
      }), { status: 200 });
    }
    if (url.includes("auctions.yahoo.co.jp")) {
      return new Response(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(auctionState)}</script>`, { status: 200 });
    }
    throw new Error(`Unexpected mocked provider URL: ${url}`);
  }) as typeof fetch;
  try {
    const { getLiveCardPrices } = await import("./live-prices");
    const live = await getLiveCardPrices("123/190", "Manual Test Card", 30);
    assert.equal(live.sources.sales.length, 1);
    assert.equal(live.representative.price, null);
    assert.equal(live.representative.confidenceLabel, "insufficient");
    const qualified = await getLiveCardPrices("123/190", "Manual Test Card", 30, false, "SV2a");
    assert.equal(qualified.representative.price, 5000);
    assert.equal(qualified.representative.evidenceType, "auction_closed");
    assert.notEqual(qualified.marketPriceBasis, "confirmed_ungraded_sales");
    assert.equal(qualified.observations.find((item) => item.source === "yahoo_auction")?.saleStatus, "auction_closed");
    assert.equal(qualified.sources.transactions[0]?.history.length, 1);
    assert.equal(productFetches, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider fanout stays within the global fetch concurrency limit", async () => {
  const originalFetch = globalThis.fetch;
  let active = 0;
  let maximumActive = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    const url = String(input);
    if (url.includes("hareruya2.com/search")) {
      const number = new URL(url).searchParams.get("q")?.split("/")[0] ?? "100";
      const links = Array.from({ length: 20 }, (_, index) =>
        `<a href="/products/${number}${String(index).padStart(2, "0")}">card</a>`).join("");
      return new Response(links, { status: 200 });
    }
    if (url.includes("/products/")) {
      return new Response(JSON.stringify({ title: "unmatched", variants: [] }), { status: 200 });
    }
    if (url.includes("auctions.yahoo.co.jp")) {
      const emptyYahooState = {
        props: {
          pageProps: {
            initialState: {
              search: {
                items: {
                  listing: { items: [] },
                },
              },
            },
          },
        },
      };
      return new Response(`<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(emptyYahooState)}</script>`, { status: 200 });
    }
    throw new Error(`Unexpected mocked provider URL: ${url}`);
  }) as typeof fetch;
  try {
    const { getLiveCardPrices } = await import("./live-prices");
    await Promise.all(Array.from({ length: 6 }, (_, index) =>
      getLiveCardPrices(`${100 + index}/190`, `Fanout Card ${index}`, 30, false, "SV2a")));
    assert.ok(maximumActive <= 5, `observed ${maximumActive} active provider requests`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("thin shop evidence starts research before a slow auction request finishes", async () => {
  const originalFetch = globalThis.fetch;
  let releaseAuction!: () => void;
  const auctionGate = new Promise<void>((resolve) => { releaseAuction = resolve; });
  let notifyResearch!: () => void;
  const researchStarted = new Promise<void>((resolve) => { notifyResearch = resolve; });
  let notifications = 0;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("hareruya2.com/search")) return new Response("", { status: 200 });
    if (url.includes("auctions.yahoo.co.jp")) {
      await auctionGate;
      return new Response('<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"initialState":{"search":{"items":{"listing":{"items":[]}}}}}}}}</script>', { status: 200 });
    }
    throw new Error(`Unexpected mocked provider URL: ${url}`);
  }) as typeof fetch;
  try {
    const { getLiveCardPrices } = await import("./live-prices");
    const first = getLiveCardPrices("376/190", "Thin Shop Card", 30, false, "SV2a", "SAR", () => {
      notifications += 1;
      notifyResearch();
    });
    await Promise.race([
      researchStarted,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("research was not started early")), 2000)),
    ]);
    assert.equal(notifications, 1);
    releaseAuction();
    await first;
    await getLiveCardPrices("376/190", "Thin Shop Card", 30, false, "SV2a", "SAR", () => { notifications += 1; });
    assert.equal(notifications, 2);
  } finally {
    releaseAuction();
    globalThis.fetch = originalFetch;
  }
});

test("demo price response satisfies the expanded schema and is prominently labeled synthetic", () => {
  const demo = GetCardPricesResponse.parse(getCardPrices("123/190", 30, "demo"));
  assert.ok(["high", "medium", "low"].includes(demo.marketPriceConfidence));
  assert.equal(demo.marketPriceBasis, "confirmed_ungraded_sales");
  assert.equal(demo.summary.psa10Median, null);
  assert.ok(demo.observations.length > 0);
  assert.match(demo.methodology, /^DEMO ONLY/);
});