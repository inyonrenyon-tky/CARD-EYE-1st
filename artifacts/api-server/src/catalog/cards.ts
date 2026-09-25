import { catalogDb } from "./db";
import { isApprovedPrimaryImage } from "./card-image-provider";
import {
  aiMarketSearchService,
  AiMarketSearchRateLimitError,
  broadenedReferenceRange,
  type AiMarketSearchResult,
} from "../lib/ai-market-search";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FEATURED_CANDIDATES = 24;
const MAX_FEATURED_CARDS = 8;
const FEATURED_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CATALOG_AI_RESULTS = 500;

export type CatalogCard = {
  id: string;
  name: string;
  number: string;
  series: string;
  rarity: string;
  imageUrl: string | null;
};

export type FeaturedCard = CatalogCard & {
  imageUrl: string;
  referenceMin: number | null;
  referenceMax: number | null;
  referenceStatus: "researching" | "available" | "unavailable";
  referenceCheckedAt: string | null;
  selectionReason: "scanned" | "discovery";
};

export type DiscoveryCard = CatalogCard & {
  releaseDate: string | null;
  signal: "recently_scanned" | "new_release" | "catalog";
};

type CardImageRow = {
  id: string;
  name: string;
  collector_number: string;
  set_code: string;
  set_name: string;
  rarity_code: string | null;
  variant_attributes: Record<string, unknown> | null;
  verified: boolean | null;
  usable_in_card_eye: boolean | null;
  license_status: string | null;
  image_url: string | null;
  source_url: string | null;
  metadata: Record<string, unknown> | null;
};

type FeaturedCache = { expiresAt: number; cards: RankedFeaturedCard[]; refreshing: boolean };
let featuredCache: FeaturedCache | undefined;
let featuredInitialization: Promise<FeaturedCard[]> | undefined;
type CatalogAiResultCacheEntry = { expiresAt: number; result: AiMarketSearchResult };
const catalogAiResultCache = new Map<string, CatalogAiResultCacheEntry>();
const catalogAiResultFlights = new Map<string, Promise<AiMarketSearchResult | null>>();

export class CatalogAiMarketResultError extends Error {
  constructor(readonly kind: "database" | "upstream", options?: ErrorOptions) {
    super(`Catalog AI market result ${kind} failure`, options);
  }
}

export function isCanonicalCatalogUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ja-JP").replace(/\s+/g, "");
}

function numberPart(value: string): string {
  const local = normalized(value).split("/")[0];
  return /^\d+$/.test(local) ? String(Number(local)) : local;
}

function safeRemoteReference(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function verifiedIdentityMatches(row: CardImageRow): boolean {
  const metadata = row.metadata ?? {};
  const attributes = row.variant_attributes ?? {};
  const rawIdentity = metadata.verifiedIdentity;
  const identity = rawIdentity && typeof rawIdentity === "object"
    ? rawIdentity as Record<string, unknown>
    : null;
  const verifiedNumber = identity?.collectorNumber;
  const verifiedName = identity?.name;
  const verifiedSetCode = identity?.setCode;
  const verifiedRarity = identity?.rarity;
  return typeof verifiedName === "string"
    && normalized(verifiedName) === normalized(row.name)
    && typeof verifiedNumber === "string"
    && numberPart(verifiedNumber) === numberPart(row.collector_number)
    && typeof attributes.verifiedCollectorNumber === "string"
    && normalized(verifiedNumber) === normalized(attributes.verifiedCollectorNumber)
    && (attributes.officialCollectorNumber === undefined ||
      normalized(verifiedNumber) === normalized(String(attributes.officialCollectorNumber)))
    && typeof verifiedSetCode === "string"
    && normalized(verifiedSetCode) === normalized(row.set_code)
    && typeof attributes.verifiedSetCode === "string"
    && normalized(verifiedSetCode) === normalized(attributes.verifiedSetCode)
    && (attributes.officialSetCode === undefined ||
      normalized(verifiedSetCode) === normalized(String(attributes.officialSetCode)))
    && typeof verifiedRarity === "string"
    && typeof row.rarity_code === "string"
    && normalized(verifiedRarity) === normalized(row.rarity_code)
    && typeof attributes.verifiedRarity === "string"
    && normalized(verifiedRarity) === normalized(attributes.verifiedRarity)
    && (attributes.officialRarity === undefined ||
      normalized(verifiedRarity) === normalized(String(attributes.officialRarity)));
}

function primaryImageUrl(row: CardImageRow): string | null {
  if (!isApprovedPrimaryImage({
    verified: row.verified === true,
    usableInCardEye: row.usable_in_card_eye === true,
    licenseStatus: row.license_status ?? "",
  })) return null;
  if (!verifiedIdentityMatches(row) || !safeRemoteReference(row.image_url)) return null;
  if (row.source_url && !safeRemoteReference(row.source_url)) return null;
  return row.image_url;
}

function toCatalogCard(row: CardImageRow, imageUrl: string | null): CatalogCard {
  const verifiedIdentity = row.metadata?.verifiedIdentity;
  const verifiedNumber = verifiedIdentity && typeof verifiedIdentity === "object"
    ? (verifiedIdentity as Record<string, unknown>).collectorNumber
    : null;
  const printedNumber = imageUrl && typeof verifiedNumber === "string" &&
    /^\d{1,4}\/[\w-]{2,25}$/i.test(verifiedNumber) &&
    numberPart(verifiedNumber) === numberPart(row.collector_number)
    ? verifiedNumber
    : row.collector_number;
  return {
    id: row.id,
    name: row.name,
    number: printedNumber,
    // Set code is accepted by the existing representative-image provider.
    series: row.set_code || row.set_name,
    rarity: row.rarity_code ?? "",
    imageUrl,
  };
}

export async function getCatalogCard(cardId: string): Promise<CatalogCard | null> {
  if (!isCanonicalCatalogUuid(cardId)) return null;
  const result = await catalogDb().query<CardImageRow>(
    `select c.id,c.name,c.collector_number,s.code as set_code,s.name as set_name,
        c.rarity_code,c.variant_attributes,i.verified,i.usable_in_card_eye,i.license_status,i.image_url,
       i.source_url,i.metadata
     from public.cards c
     join public.card_sets s on s.id=c.set_id
     left join public.card_images i
       on i.card_id=c.id and i.image_type='primary' and i.is_primary=true
     where c.id=$1::uuid and c.catalog_status='active' and c.language='ja'
     order by i.updated_at desc nulls last
     limit 2`,
    [cardId],
  );
  if (!result.rows.length) return null;
  // A card must resolve to one unambiguous catalog identity.
  if (result.rows.length > 1) return null;
  const row = result.rows[0];
  return toCatalogCard(row, primaryImageUrl(row));
}

function cacheCatalogAiResult(cardId: string, result: AiMarketSearchResult): void {
  const now = Date.now();
  for (const [id, entry] of catalogAiResultCache) {
    if (entry.expiresAt <= now) catalogAiResultCache.delete(id);
  }
  while (catalogAiResultCache.size >= MAX_CATALOG_AI_RESULTS) {
    const oldestId = catalogAiResultCache.keys().next().value;
    if (oldestId === undefined) break;
    catalogAiResultCache.delete(oldestId);
  }
  catalogAiResultCache.set(cardId, { expiresAt: now + FEATURED_CACHE_TTL_MS, result });
}

export function getCatalogCardAiMarketResult(
  cardId: string,
  onCacheMiss?: () => void,
): Promise<AiMarketSearchResult | null> {
  if (!isCanonicalCatalogUuid(cardId)) return Promise.resolve(null);
  const cacheKey = cardId.toLowerCase();
  const now = Date.now();
  const cached = catalogAiResultCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return Promise.resolve(cached.result);
  if (cached) catalogAiResultCache.delete(cacheKey);
  const inFlight = catalogAiResultFlights.get(cacheKey);
  if (inFlight) return inFlight;

  const pending = (async (): Promise<AiMarketSearchResult | null> => {
    let card: CatalogCard | null;
    try {
      card = await getCatalogCard(cacheKey);
    } catch (error) {
      throw new CatalogAiMarketResultError("database", { cause: error });
    }
    if (!card) return null;
    try {
      const result = await aiMarketSearchService.search({
        cardName: card.name,
        cardNumber: card.number,
        series: card.series,
        rarity: card.rarity,
      }, onCacheMiss);
      cacheCatalogAiResult(cacheKey, result);
      return result;
    } catch (error) {
      if (error instanceof AiMarketSearchRateLimitError) throw error;
      throw new CatalogAiMarketResultError("upstream", { cause: error });
    }
  })();
  catalogAiResultFlights.set(cacheKey, pending);
  void pending.finally(() => {
    if (catalogAiResultFlights.get(cacheKey) === pending) catalogAiResultFlights.delete(cacheKey);
  }).catch(() => undefined);
  return pending;
}

type FeaturedCandidate = { card: CatalogCard & { imageUrl: string }; recentScanCount: number };

async function loadFeaturedCandidates(): Promise<FeaturedCandidate[]> {
  const result = await catalogDb().query<CardImageRow & { recent_scan_count: number }>(
    `select c.id,c.name,c.collector_number,s.code as set_code,s.name as set_name,
        c.rarity_code,c.variant_attributes,i.verified,i.usable_in_card_eye,i.license_status,i.image_url,
        i.source_url,i.metadata,coalesce(recent_scans.scan_count,0) as recent_scan_count
      from public.cards c
     join public.card_sets s on s.id=c.set_id
     join public.card_images i
       on i.card_id=c.id and i.image_type='primary' and i.is_primary=true
      left join (
        select matched_card_id,count(*)::integer as scan_count
        from public.scan_analyses
        where match_status='exact' and created_at >= now()-interval '30 days'
        group by matched_card_id
      ) recent_scans on recent_scans.matched_card_id=c.id
      where c.catalog_status='active' and c.language='ja'
       and i.verified=true and i.usable_in_card_eye=true
        and i.license_status in ('display_only_authorized_by_card_eye_owner','display_only_authorized_by_provider')
      order by coalesce(recent_scans.scan_count,0) desc,md5(c.id::text || current_date::text)
     limit $1`,
    [MAX_FEATURED_CANDIDATES],
  );
  const cards = result.rows.flatMap((row) => {
    const imageUrl = primaryImageUrl(row);
    return imageUrl ? [{ card: { ...toCatalogCard(row, imageUrl), imageUrl }, recentScanCount: row.recent_scan_count }] : [];
  });
  return cards.slice(0, MAX_FEATURED_CARDS);
}

type RankedFeaturedCard = FeaturedCard & { recentScanCount: number };

export function featuredSelectionReason(recentScanCount: number): FeaturedCard["selectionReason"] {
  if (recentScanCount > 0) return "scanned";
  return "discovery";
}

function dailyOrder(id: string, day: string): number {
  let hash = 2166136261;
  for (const char of `${day}:${id}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

export function rankFeaturedCards(cards: RankedFeaturedCard[], day: string): FeaturedCard[] {
  const score = (card: RankedFeaturedCard) =>
    (card.referenceStatus === "available" ? 100 : 0) + Math.min(card.recentScanCount, 10) * 2;
  const ranked = [...cards].sort((a, b) =>
    score(b) - score(a) || dailyOrder(a.id, day) - dailyOrder(b.id, day) || a.id.localeCompare(b.id)
  );
  // Keep the strongest signals visible, but reserve a prominent slot for an
  // eligible card the visitor might not already know.
  if (ranked.length > 3) {
    const remaining = ranked.slice(2);
    const discoveries = remaining.filter((card) => card.selectionReason === "discovery");
    const surprisePool = discoveries.length ? discoveries : remaining;
    const surprise = [...surprisePool].sort((a, b) =>
      Number(b.referenceStatus === "available") - Number(a.referenceStatus === "available")
        || dailyOrder(a.id, day) - dailyOrder(b.id, day) || a.id.localeCompare(b.id)
    )[0];
    ranked.splice(ranked.findIndex((card) => card.id === surprise.id), 1);
    ranked.splice(2, 0, surprise);
  }
  return ranked.map(({ recentScanCount: _count, ...card }) => card);
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      results[index] = await mapper(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function todayInTokyo() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date());
}

async function refreshFeaturedReferences(cache: FeaturedCache) {
  if (cache.refreshing) return;
  cache.refreshing = true;
  try {
    await mapWithConcurrency(cache.cards, 4, async (card) => {
      try {
        const result = await getCatalogCardAiMarketResult(card.id);
        if (result) applyFeaturedAiResult(card, result);
        else if (card.referenceMin === null) card.referenceStatus = "unavailable";
      } catch {
        // Keep a previous dated estimate when a refresh fails, never invent one.
        if (card.referenceMin === null) card.referenceStatus = "unavailable";
      }
    });
  } catch {
    for (const card of cache.cards) {
      if (card.referenceStatus === "researching") card.referenceStatus = "unavailable";
    }
  } finally {
    cache.refreshing = false;
  }
}

function applyFeaturedAiResult(card: RankedFeaturedCard, result: AiMarketSearchResult) {
  const reference = featuredReferenceProjection(result);
  card.referenceMin = reference.referenceMin;
  card.referenceMax = reference.referenceMax;
  card.referenceCheckedAt = result.searchedAt;
  card.referenceStatus = card.referenceMin !== null ? "available" : "unavailable";
}

export function featuredReferenceProjection(result: Pick<AiMarketSearchResult, "estimates">) {
  return broadenedReferenceRange(result.estimates);
}

function syncFeaturedWithCachedAiResult(cache: FeaturedCache) {
  for (const card of cache.cards) {
    const current = catalogAiResultCache.get(card.id.toLowerCase());
    if (current && current.expiresAt > Date.now() && current.result.searchedAt !== card.referenceCheckedAt) {
      applyFeaturedAiResult(card, current.result);
    }
  }
}

export async function getFeaturedCards(): Promise<FeaturedCard[]> {
  if (featuredCache) {
    if (featuredCache.expiresAt <= Date.now()) {
      featuredCache.expiresAt = Date.now() + FEATURED_CACHE_TTL_MS;
      void refreshFeaturedReferences(featuredCache);
    }
    syncFeaturedWithCachedAiResult(featuredCache);
    return rankFeaturedCards(featuredCache.cards, todayInTokyo());
  }
  if (featuredInitialization) return featuredInitialization;
  featuredInitialization = (async () => {
    const candidates = await loadFeaturedCandidates();
    const cards: RankedFeaturedCard[] = candidates.map(({ card, recentScanCount }) => ({
      ...card, recentScanCount, selectionReason: featuredSelectionReason(recentScanCount),
      referenceMin: null, referenceMax: null, referenceCheckedAt: null,
      referenceStatus: "researching",
    }));
    const cache: FeaturedCache = {
      cards, expiresAt: Date.now() + FEATURED_CACHE_TTL_MS, refreshing: false,
    };
    featuredCache = cache;
    void refreshFeaturedReferences(cache);
    return rankFeaturedCards(cards, todayInTokyo());
  })();
  try {
    return await featuredInitialization;
  } finally {
    featuredInitialization = undefined;
  }
}

export function discoverySignal(recentScanCount: number, releaseDate: string | null, now: Date): DiscoveryCard["signal"] {
  if (recentScanCount > 0) return "recently_scanned";
  const releaseTime = releaseDate ? Date.parse(releaseDate) : NaN;
  if (Number.isFinite(releaseTime) && releaseTime <= now.getTime()
    && releaseTime >= now.getTime() - 90 * 86_400_000) return "new_release";
  return "catalog";
}

export async function listDiscoveryCards(limit: number, offset: number, query: string): Promise<{
  cards: DiscoveryCard[];
  total: number;
}> {
  const db = catalogDb();
  const where = `from public.cards c
    join public.card_sets s on s.id=c.set_id
    where c.catalog_status='active' and c.language='ja'
      and ($1::text='' or position(lower($1) in lower(c.name))>0
        or position(lower($1) in lower(c.collector_number))>0
        or position(lower($1) in lower(s.code))>0
        or position(lower($1) in lower(s.name))>0)`;
  type DiscoveryRow = CardImageRow & { release_date: Date | string | null; recent_scan_count: number };
  const [count, result] = await Promise.all([
    db.query<{ total: string }>(`select count(*)::text as total ${where}`, [query]),
    db.query<DiscoveryRow>(
      `select c.id,c.name,c.collector_number,s.code as set_code,s.name as set_name,
        c.rarity_code,c.variant_attributes,s.release_date,
        i.verified,i.usable_in_card_eye,i.license_status,i.image_url,i.source_url,i.metadata,
        coalesce(recent_scans.scan_count,0) as recent_scan_count
       from public.cards c
       join public.card_sets s on s.id=c.set_id
       left join public.card_images i
         on i.card_id=c.id and i.image_type='primary' and i.is_primary=true
       left join (
         select matched_card_id,count(*)::integer as scan_count
         from public.scan_analyses
         where match_status='exact' and created_at >= now()-interval '30 days'
         group by matched_card_id
       ) recent_scans on recent_scans.matched_card_id=c.id
       where c.catalog_status='active' and c.language='ja'
         and ($1::text='' or position(lower($1) in lower(c.name))>0
           or position(lower($1) in lower(c.collector_number))>0
           or position(lower($1) in lower(s.code))>0
           or position(lower($1) in lower(s.name))>0)
       order by coalesce(recent_scans.scan_count,0) desc,s.release_date desc nulls last,
         md5(c.id::text || current_date::text)
       limit $2 offset $3`,
      [query, limit, offset],
    ),
  ]);
  const now = new Date();
  return {
    total: Number(count.rows[0].total),
    cards: result.rows.map((row) => {
      const releaseDate = row.release_date instanceof Date
        ? row.release_date.toISOString().slice(0, 10) : row.release_date;
      return {
        ...toCatalogCard(row, primaryImageUrl(row)),
        releaseDate,
        signal: discoverySignal(row.recent_scan_count, releaseDate, now),
      };
    }),
  };
}