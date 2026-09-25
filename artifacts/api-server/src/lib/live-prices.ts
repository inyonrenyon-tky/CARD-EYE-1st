import {
  aggregateConfirmedSales, median, sourceConfigs, summarizeMarketPrice,
  type ConfirmedSale, type PeriodDays, type PriceListing, type PriceObservation, type PriceTransactionSummary,
} from "./price-domain";
import { calculateRepresentativePrice, type RepresentativeObservation } from "./representative-price";

type DatedSale = ConfirmedSale & { date: string; title: string };
type Observations = {
  listing: PriceListing | null; representativeShopListings: RepresentativeObservation[]; yahooSales: DatedSale[];
  shopReachable: boolean; auctionReachable: boolean;
};
type SourceAvailability = {
  source: string; priceType: "LISTING" | "SALE" | "BUYBACK";
  status: "available" | "no_data" | "unavailable"; reason: string | null;
};
const cache = new Map<string, {
  expiresAt: number;
  promise: Promise<Observations>;
  shopPromise: Promise<{ listing: PriceListing | null; representativeShopListings: RepresentativeObservation[] }>;
}>();
const ttl = 5 * 60_000;
const MAX_PAGE_BYTES = 4_000_000;
const MAX_CONCURRENT_PROVIDER_FETCHES = 5;
const PRODUCT_PAGE_CACHE_TTL = 30_000;
const PRODUCT_PAGE_CACHE_LIMIT = 200;
let activeProviderFetches = 0;
const providerFetchQueue: Array<() => void> = [];
const productPageCache = new Map<string, { expiresAt: number; promise: Promise<string> }>();

async function acquireProviderFetchSlot() {
  if (activeProviderFetches < MAX_CONCURRENT_PROVIDER_FETCHES) {
    activeProviderFetches += 1;
    return;
  }
  await new Promise<void>((resolve) => providerFetchQueue.push(resolve));
}

function releaseProviderFetchSlot() {
  const next = providerFetchQueue.shift();
  if (next) next();
  else activeProviderFetches -= 1;
}

const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
const rawCard = (title: string) => !/(psa|ars\d|cgc|bgs|鑑定|未開封|まとめ|セット|大量|複数|オリパ|レプリカ|コピー|枚組|傷あり)/i.test(title.normalize("NFKC"));

/** Requires explicit title/variant wording for beautiful A- through A; never infers from null or a bare grade. */
export function explicitlyBeautifulACondition(text: string): boolean {
  const normalized = text.normalize("NFKC");
  if (/(mint|極美品|超美品|完美品|美品以上|良品|並品|PSA|BGS|CGC|ARS|鑑定|傷|キズ|折れ|汚れ|欠け|白かけ|白欠け|凹み|ダメージ|damage|damaged|played|ジャンク|難あり|セット|まとめ|複数|枚組|\d+\s*枚|二枚|duplicate|lot)/i.test(normalized)) return false;
  if (/(?:状態|ランク)\s*[B-F](?:-|$|[^A-Z])|(?:状態|ランク|grade(?:d)?)\s*[:#]?\s*\d+|(?:状態|ランク)?\s*A\s*(?:-|−)?\s*(?:～|〜|to)\s*[B-F](?:$|[^A-Z])/i.test(normalized)) return false;
  const explicitlyBeautiful = /美品|beautiful/i.test(normalized);
  const explicitlyRatedA = /(?:^|[^A-Z0-9])(?:状態|ランク)\s*A-?(?:$|[^A-Z0-9])|(?:^|[^A-Z0-9])A\s*(?:-|−)\s*(?:～|〜|to)\s*A(?:$|[^A-Z0-9])/i.test(normalized);
  return explicitlyBeautiful || explicitlyRatedA;
}

/**
 * Unknown condition is acceptable only when the listing gives no contradictory
 * condition or grading information. Explicit non-beautiful/damaged conditions
 * are not silently reclassified as unknown.
 */
export function observedConditionClass(text: string): "beautiful" | "unverified" | null {
  const normalized = text.normalize("NFKC");
  if (explicitlyBeautifulACondition(normalized)) return "beautiful";
  if (/(psa|ars\d|cgc|bgs|鑑定|未開封|まとめ|セット|大量|複数|オリパ|レプリカ|コピー|枚組|傷|キズ|折れ|汚れ|欠け|白かけ|白欠け|凹み|ダメージ|damage|damaged|played|ジャンク|難あり|極美品|超美品|完美品|美品以上|良品|並品|(?:状態|ランク)\s*[B-F](?:-|$|[^A-Z])|(?:状態|ランク|grade(?:d)?)\s*[:#]?\s*[B-F0-9]|(?:状態|ランク|grade(?:d)?)\s*A\s*(?:-|−)\s*(?:～|〜|to)\s*[B-F])/i.test(normalized)) {
    return null;
  }
  return "unverified";
}
function matchesCard(title: string, number: string, name: string) {
  const text = normalize(title);
  const code = normalize(number);
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(text)
    && text.includes(normalize(name)) && rawCard(title);
}

export function isSetCode(value: string | undefined): value is string {
  return !!value && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value.trim());
}

function containsExactToken(text: string, token: string): boolean {
  const escaped = token.normalize("NFKC").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i").test(text.normalize("NFKC"));
}

export function representativeIdentityMatches(title: string, series: string | undefined, rarity?: string): boolean {
  if (!isSetCode(series) || !containsExactToken(title, series)) return false;
  const reliableRarity = rarity && /^[a-z0-9-]{2,24}$/i.test(rarity) ? rarity : undefined;
  const normalizedTitle = title.normalize("NFKC");
  const normalizedSeries = series.normalize("NFKC").toLowerCase();
  const otherSetCodes = normalizedTitle.match(/\b[a-z]{1,5}\d+[a-z]?\b/gi) ?? [];
  if (otherSetCodes.some((code) => code.toLowerCase() !== normalizedSeries)) return false;
  if (!reliableRarity) return true;
  if (!containsExactToken(title, reliableRarity)) return false;
  const rarityTokens = ["C", "U", "R", "RR", "RRR", "AR", "SAR", "SR", "SSR", "UR", "HR", "CHR", "CSR", "ACE", "PR"];
  const requestedRarity = reliableRarity.toUpperCase();
  return !rarityTokens.some((token) => token !== requestedRarity && containsExactToken(title, token));
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
    condition: null, graded: false, grade: null, saleStatus: "auction_closed",
  };
}

export function serializeLiveListingObservation(listing: PriceListing): PriceObservation {
  return {
    source: listing.source, sourceType: "SHOP", observedAt: listing.lastUpdated, price: listing.price,
    condition: listing.condition, graded: false, grade: null, saleStatus: "listing",
  };
}

async function fetchPage(url: string) {
  await acquireProviderFetchSlot();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8_000), headers: { Accept: "text/html,application/json" } });
    if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_PAGE_BYTES) throw new Error("Provider page too large");
    const text = await response.text();
    if (text.length > MAX_PAGE_BYTES) throw new Error("Provider page too large");
    return text;
  } finally {
    releaseProviderFetchSlot();
  }
}

function fetchProductPage(url: string): Promise<string> {
  const existing = productPageCache.get(url);
  if (existing && existing.expiresAt > Date.now()) return existing.promise;
  const promise = fetchPage(url);
  productPageCache.set(url, { expiresAt: Date.now() + PRODUCT_PAGE_CACHE_TTL, promise });
  promise.catch(() => {
    if (productPageCache.get(url)?.promise === promise) productPageCache.delete(url);
  });
  while (productPageCache.size > PRODUCT_PAGE_CACHE_LIMIT) {
    productPageCache.delete(productPageCache.keys().next().value!);
  }
  return promise;
}

type HareruyaProduct = {
  title?: string;
  variants?: Array<{ price?: number; available?: boolean; title?: string; option1?: string; option2?: string; option3?: string }>;
};

export function buildHareruyaObservations(
  products: Array<HareruyaProduct | null>,
  number: string,
  name: string,
  observedAt: string,
  series?: string,
  rarity?: string,
): { listing: PriceListing | null; representativeShopListings: RepresentativeObservation[] } {
  const matchingProducts = products.filter((product): product is HareruyaProduct =>
    !!product?.title && matchesCard(product.title, number, name));
  const legacyPrices = matchingProducts.map((product) => product.variants
    ?.filter((variant) => variant.available && Number.isInteger(variant.price) && (variant.price ?? 0) > 0)
    .map((variant) => (variant.price ?? 0) / 100).sort((a, b) => a - b)[0])
    .filter((price): price is number => price !== undefined && Number.isInteger(price));
  const rawPrice = median(legacyPrices);
  const representativeShopListings = matchingProducts.flatMap((product): RepresentativeObservation[] => {
    if (!representativeIdentityMatches(product.title!, series, rarity)) return [];
    return product.variants?.filter((variant) => {
      const conditionText = [product.title, variant.title, variant.option1, variant.option2, variant.option3].filter(Boolean).join(" ");
      return variant.available && Number.isInteger(variant.price) && (variant.price ?? 0) > 0
        && !!observedConditionClass(conditionText);
    }).map((variant): RepresentativeObservation => {
      const conditionText = [product.title, variant.title, variant.option1, variant.option2, variant.option3].filter(Boolean).join(" ");
      return {
        source: "hareruya2", price: (variant.price ?? 0) / 100, observedAt, evidenceType: "shop_listing",
        graded: false, conditionClass: observedConditionClass(conditionText)!, identityCertain: true,
      };
    }).filter((item) => Number.isInteger(item.price)) ?? [];
  });
  return {
    listing: rawPrice === null ? null : {
      source: "hareruya2", displayName: "晴れる屋2", priceType: "LISTING",
      price: rawPrice, isReference: true, lastUpdated: observedAt,
      condition: null, stockStatus: "在庫あり", history: [],
    },
    representativeShopListings,
  };
}

async function readHareruya(number: string, name: string, series?: string, rarity?: string): Promise<{ listing: PriceListing | null; representativeShopListings: RepresentativeObservation[] }> {
  const html = await fetchPage(`https://www.hareruya2.com/search?q=${encodeURIComponent(number)}&type=product`);
  const links = [...new Set([...html.matchAll(/href="(\/products\/\d+)(?:\?[^"]*)?"/g)].map((match) => match[1]))].slice(0, 20);
  if (!links.length) return { listing: null, representativeShopListings: [] };
  const products = await Promise.all(links.map(async (link) => {
    try {
      return JSON.parse(await fetchProductPage(`https://www.hareruya2.com${link}.js`)) as HareruyaProduct;
    } catch {
      return null;
    }
  }));
  return buildHareruyaObservations(products, number, name, new Date().toISOString(), series, rarity);
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

async function observations(
  number: string, name: string, series?: string, rarity?: string,
  onThinShopEvidence?: () => void,
): Promise<Observations> {
  const key = JSON.stringify([number, name, series, rarity]);
  const cached = cache.get(key);
  const notify = (shopPromise: Promise<{ representativeShopListings: RepresentativeObservation[] }>) => {
    if (onThinShopEvidence) {
      void shopPromise.then((shop) => {
        if (shop.representativeShopListings.length <= 2) onThinShopEvidence();
      }, () => onThinShopEvidence());
    }
  };
  if (cached && cached.expiresAt > Date.now()) {
    notify(cached.shopPromise);
    return cached.promise;
  }
  const shopPromise = readHareruya(number, name, series, rarity);
  notify(shopPromise);
  const auctionPromise = readYahoo(number, name);
  const promise = (async () => {
    const [shop, auctions] = await Promise.allSettled([shopPromise, auctionPromise]);
    const shopObservations = shop.status === "fulfilled" ? shop.value : { listing: null, representativeShopListings: [] };
    return {
      listing: shopObservations.listing,
      representativeShopListings: shopObservations.representativeShopListings,
      yahooSales: auctions.status === "fulfilled" ? auctions.value : [],
      shopReachable: shop.status === "fulfilled",
      auctionReachable: auctions.status === "fulfilled",
    };
  })();
  cache.set(key, { expiresAt: Date.now() + ttl, promise, shopPromise });
  if (cache.size > 100) cache.delete(cache.keys().next().value!);
  return promise;
}

export async function getLiveCardPrices(
  cardId: string,
  name: string | undefined,
  periodDays: PeriodDays,
  trustedCatalogIdentity = false,
  series?: string,
  rarity?: string,
  onThinShopEvidence?: () => void,
) {
  const cardName = name?.trim();
  const validNumber = trustedCatalogIdentity
    ? /^[\w-]{1,24}\/[\w-]{2,25}$/i.test(cardId)
    : /^\d{1,4}\/[\w-]{2,25}$/i.test(cardId);
  const hasIdentity = !!cardName && cardName.length <= 100 && validNumber;
  const hasRepresentativeIdentity = hasIdentity && isSetCode(series);
  const found = hasIdentity ? await observations(cardId, cardName!, series, rarity, onThinShopEvidence) : null;
  const sales = found?.listing ? [found.listing] : [];
  const withinPeriod = (found?.yahooSales ?? []).filter((sale) => sale.daysAgo >= 0 && sale.daysAgo < periodDays);
  const filtered = aggregateConfirmedSales(withinPeriod, periodDays) as DatedSale[];
  const values = filtered.map((sale) => sale.price);
  const transactionMedian = median(values);
  const priceObservations: PriceObservation[] = [
    ...filtered.map(serializeLiveSaleObservation),
    ...(found?.listing ? [serializeLiveListingObservation(found.listing)] : []),
  ];
  const representativeObservations: RepresentativeObservation[] = [
    ...(found?.representativeShopListings ?? []),
    ...(found?.yahooSales ?? []).filter((sale) => hasRepresentativeIdentity
      && representativeIdentityMatches(sale.title, series, rarity)
      && !!observedConditionClass(sale.title)).map((sale) => ({
      source: sale.source, price: sale.price, observedAt: sale.date, evidenceType: "auction_closed" as const,
      graded: false, conditionClass: observedConditionClass(sale.title)!, identityCertain: hasRepresentativeIdentity,
    })),
  ];
  const calculatedRepresentative = calculateRepresentativePrice(representativeObservations);
  const representative = hasRepresentativeIdentity ? calculatedRepresentative : {
    ...calculatedRepresentative,
    note: "代表価格はセットコードの明示照合が必要です。カード名とカード番号だけでは他セットの商品を区別できないため、価格を表示しません。",
  };
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
      reason: !hasIdentity ? notReady : !found?.auctionReachable ? "終了結果を取得できません" : filtered.length ? null : "対象期間に終了済み・入札ありのオークション結果がありません" },
  ];
  return {
    cardId, currency: "JPY" as const, mode: "live" as const, periodDays,
    marketPrice: marketSummary.marketPrice,
    marketPriceConfidence: marketSummary.marketPriceConfidence,
    marketPriceBasis: marketSummary.marketPriceBasis,
    representative,
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
      : `対象: ${cardName} ${cardId}。実観測価格はカード番号・カード名・セットコードの一致を確認して算出します。明示的な美品状態の価格を優先して14・30・60・90日窓で外れ値を除いた中央値を算出します。美品データがない場合は状態未確認の晴れる屋2在庫価格または終了済みYahoo!オークション価格も低信頼の参考価格として含め、「状態未確認」と明記します。1件の場合はその観測価格を表示し、1件のみと開示します。Yahoo!の終了済み・入札あり・単品の一致結果（period=${periodDays}日以内）は履歴・取引チャートには残しますが、落札完了を確認できないため確認済み成約中央値からは除外し、参考価格で使用する場合も取引成立未確認と注記します。晴れる屋2の既存一覧価格は従来どおり保持します。PSA10・買取価格は取得していません。カードラッシュ・メルカリ・SNKRDUNKの価格データ連携はなく集計対象外。実観測がない場合だけAI推定の一点参考価格を別途表示し、取引履歴には含めません。`,
  };
}