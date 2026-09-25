import {
  aggregateConfirmedSales, median, sourceConfigs, summarizeMarketPrice,
  type ConfirmedSale, type PeriodDays, type PriceListing, type PriceObservation, type PriceTransactionSummary,
} from "./price-domain";

type DatedSale = ConfirmedSale & { date: string; title: string };
type Observations = {
  listing: PriceListing | null; yahooSales: DatedSale[];
  shopReachable: boolean; auctionReachable: boolean;
};
type SourceAvailability = {
  source: string; priceType: "LISTING" | "SALE" | "BUYBACK";
  status: "available" | "no_data" | "unavailable"; reason: string | null;
};
const cache = new Map<string, { expiresAt: number; promise: Promise<Observations> }>();
const ttl = 5 * 60_000;
const MAX_PAGE_BYTES = 4_000_000;

const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
const rawCard = (title: string) => !/(psa|ars\d|cgc|bgs|鑑定|未開封|まとめ|セット|大量|複数|オリパ|レプリカ|コピー|枚組|傷あり)/i.test(title.normalize("NFKC"));
function matchesCard(title: string, number: string, name: string) {
  const text = normalize(title);
  const code = normalize(number);
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(text)
    && text.includes(normalize(name)) && rawCard(title);
}

export function dedupeDatedSales(items: DatedSale[]): DatedSale[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${normalize(item.title)}|${item.price}|${item.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function serializeLiveSaleObservation(sale: DatedSale): PriceObservation {
  return {
    source: sale.source, sourceType: "MARKETPLACE", observedAt: sale.date, price: sale.price,
    condition: null, graded: false, grade: null, saleStatus: "sold",
  };
}

export function serializeLiveListingObservation(listing: PriceListing): PriceObservation {
  return {
    source: listing.source, sourceType: "SHOP", observedAt: listing.lastUpdated, price: listing.price,
    condition: listing.condition, graded: false, grade: null, saleStatus: "listing",
  };
}

async function fetchPage(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { Accept: "text/html,application/json" } });
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_PAGE_BYTES) throw new Error("Provider page too large");
  const text = await response.text();
  if (text.length > MAX_PAGE_BYTES) throw new Error("Provider page too large");
  return text;
}

async function readHareruya(number: string, name: string): Promise<PriceListing | null> {
  const html = await fetchPage(`https://www.hareruya2.com/search?q=${encodeURIComponent(number)}&type=product`);
  const links = [...new Set([...html.matchAll(/href="(\/products\/\d+)(?:\?[^"]*)?"/g)].map((match) => match[1]))].slice(0, 20);
  if (!links.length) return null;
  const products = await Promise.all(links.map(async (link) => {
    try {
      const product = JSON.parse(await fetchPage(`https://www.hareruya2.com${link}.js`)) as {
        title?: string; variants?: Array<{ price?: number; available?: boolean }>;
      };
      if (!product.title || !matchesCard(product.title, number, name)) return null;
      const price = product.variants?.filter((variant) => variant.available && Number.isInteger(variant.price) && (variant.price ?? 0) > 0)
        .map((variant) => (variant.price ?? 0) / 100).sort((a, b) => a - b)[0];
      return price && Number.isInteger(price) ? price : null;
    } catch {
      return null;
    }
  }));
  const price = median(products.filter((value): value is number => value !== null));
  if (price === null) return null;
  return {
    source: "hareruya2", displayName: "晴れる屋2", priceType: "LISTING",
    price, isReference: true, lastUpdated: new Date().toISOString(),
    condition: null, stockStatus: "在庫あり", history: [],
  };
}

async function readYahoo(number: string, name: string): Promise<DatedSale[]> {
  const query = encodeURIComponent(`${name} ${number}`);
  const html = await fetchPage(`https://auctions.yahoo.co.jp/closedsearch/closedsearch/${query}/0/`);
  const state = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
  if (!state) throw new Error("Auction result data missing");
  type AuctionItem = {
    title?: string; price?: number; bidCount?: number; isFleamarketItem?: boolean; endTime?: string;
  };
  type AuctionPage = {
    props?: {
      pageProps?: {
        initialState?: {
          search?: { items?: { listing?: { items?: AuctionItem[] } } };
        };
      };
    };
  };
  const data = JSON.parse(state) as AuctionPage;
  const items = data.props?.pageProps?.initialState?.search?.items?.listing?.items;
  if (!Array.isArray(items)) throw new Error("Auction result data missing");
  const now = Date.now();
  const sales = items.flatMap((item): DatedSale[] => {
    if (item.isFleamarketItem !== false || !item.title || !matchesCard(item.title, number, name)
      || !Number.isInteger(item.bidCount) || (item.bidCount ?? 0) < 1
      || !Number.isSafeInteger(item.price) || (item.price ?? 0) <= 0
      || !item.endTime) return [];
    const end = Date.parse(item.endTime);
    if (!Number.isFinite(end) || end > now) return [];
    return [{
      source: "yahoo_auction", price: item.price!, daysAgo: (now - end) / 86_400_000,
      date: new Date(end).toISOString(), title: item.title, priceType: "SALE",
    }];
  });
  return dedupeDatedSales(sales);
}

async function observations(number: string, name: string): Promise<Observations> {
  const key = JSON.stringify([number, name]);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = (async () => {
    const [shop, auctions] = await Promise.allSettled([readHareruya(number, name), readYahoo(number, name)]);
    return {
      listing: shop.status === "fulfilled" ? shop.value : null,
      yahooSales: auctions.status === "fulfilled" ? auctions.value : [],
      shopReachable: shop.status === "fulfilled",
      auctionReachable: auctions.status === "fulfilled",
    };
  })();
  cache.set(key, { expiresAt: Date.now() + ttl, promise });
  if (cache.size > 100) cache.delete(cache.keys().next().value!);
  return promise;
}

export async function getLiveCardPrices(
  cardId: string,
  name: string | undefined,
  periodDays: PeriodDays,
  trustedCatalogIdentity = false,
) {
  const cardName = name?.trim();
  const validNumber = trustedCatalogIdentity
    ? /^[\w-]{1,24}\/[\w-]{2,25}$/i.test(cardId)
    : /^\d{1,4}\/[\w-]{2,25}$/i.test(cardId);
  const hasIdentity = !!cardName && cardName.length <= 100 && validNumber;
  const found = hasIdentity ? await observations(cardId, cardName!) : null;
  const sales = found?.listing ? [found.listing] : [];
  const withinPeriod = (found?.yahooSales ?? []).filter((sale) => sale.daysAgo >= 0 && sale.daysAgo < periodDays);
  const filtered = aggregateConfirmedSales(withinPeriod, periodDays) as DatedSale[];
  const values = filtered.map((sale) => sale.price);
  const transactionMedian = median(values);
  const priceObservations: PriceObservation[] = [
    ...filtered.map(serializeLiveSaleObservation),
    ...(found?.listing ? [serializeLiveListingObservation(found.listing)] : []),
  ];
  const marketSummary = summarizeMarketPrice(
    priceObservations.filter((item) => item.saleStatus === "sold"),
    priceObservations.filter((item) => item.saleStatus === "listing"),
  );
  const byDate = [...filtered].sort((a, b) => a.date.localeCompare(b.date));
  const transaction: PriceTransactionSummary[] = values.length ? [{
    source: "yahoo_auction", displayName: "Yahoo!オークション", priceType: "SALE",
    medianPrice: transactionMedian, transactionCount: values.length,
    highestPrice: Math.max(...values), lowestPrice: Math.min(...values),
    lastUpdated: byDate.at(-1)!.date,
    history: byDate.map(({ date, price }) => ({ date, price })),
  }] : [];
  const window = Math.max(1, Math.floor(byDate.length / 3));
  const earlier = median(byDate.slice(0, window).map((item) => item.price));
  const latest = median(byDate.slice(-window).map((item) => item.price));
  const changePercent = byDate.length >= 10 && earlier && latest
    ? Math.round((latest - earlier) / earlier * 1000) / 10 : null;
  const notReady = !hasIdentity ? "カード名と番号が必要です" : "提供元との価格データ連携が未設定です";
  const sourceAvailability: SourceAvailability[] = [
    { source: "cardrush", priceType: "LISTING", status: "unavailable", reason: notReady },
    { source: "cardrush", priceType: "BUYBACK", status: "unavailable", reason: notReady },
    { source: "mercari", priceType: "LISTING", status: "unavailable", reason: !hasIdentity ? notReady : "商品別の確認済みデータを取得できません" },
    { source: "mercari", priceType: "SALE", status: "unavailable", reason: !hasIdentity ? notReady : "成約価格と日時を確認できるデータがありません" },
    { source: "snkrdunk", priceType: "SALE", status: "unavailable", reason: notReady },
    { source: "hareruya2", priceType: "LISTING", status: !hasIdentity || !found?.shopReachable ? "unavailable" : sales.length ? "available" : "no_data",
      reason: !hasIdentity ? notReady : !found?.shopReachable ? "価格ページを取得できません" : sales.length ? null : "該当する在庫あり商品がありません" },
    { source: "hareruya2", priceType: "BUYBACK", status: "unavailable", reason: !hasIdentity ? notReady : "買取価格は取得していません" },
    { source: "yahoo_auction", priceType: "SALE", status: !hasIdentity || !found?.auctionReachable ? "unavailable" : filtered.length ? "available" : "no_data",
      reason: !hasIdentity ? notReady : !found?.auctionReachable ? "終了結果を取得できません" : filtered.length ? null : "対象期間に確認済み成約がありません" },
  ];
  return {
    cardId, currency: "JPY" as const, mode: "live" as const, periodDays,
    marketPrice: marketSummary.marketPrice,
    marketPriceConfidence: marketSummary.marketPriceConfidence,
    marketPriceBasis: marketSummary.marketPriceBasis,
    observations: priceObservations,
    reference: sales.length ? { source: "hareruya2", price: sales[0].price } : null,
    summary: {
      transactionMedian, shopMedian: median(sales.map((item) => item.price)), buybackMedian: null,
      psa10Median: null,
      transactionCount: values.length, confidenceScore: null,
      highestPrice: values.length ? Math.max(...values) : null,
      lowestPrice: values.length ? Math.min(...values) : null, changePercent,
    },
    sources: { sales, transactions: transaction, buybacks: [] },
    sourceConfigs,
    sourceAvailability,
    methodology: !hasIdentity
      ? "実価格の照合にはカード名と「番号/セット番号」が必要です。"
      : `対象: ${cardName} ${cardId}。成約中央値はYahoo!オークションの終了済み・入札あり・単品の一致結果（検索結果の先頭最大50件、period=${periodDays}日以内）から重複・極端な外れ値を除いて算出し、晴れる屋2の在庫あり単品販売価格とは別集計です。Yahoo!結果窓の全成約を網羅した価格ではなく、商品状態は確認できないためcondition=null・未鑑定のみをタイトルから除外確認しています。PSA10・買取価格は取得していません。カードラッシュ・メルカリ・SNKRDUNKの価格データ連携はなく集計対象外。`,
  };
}