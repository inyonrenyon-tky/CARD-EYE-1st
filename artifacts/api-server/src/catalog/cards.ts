import { catalogDb } from "./db";
import { isApprovedPrimaryImage } from "./card-image-provider";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FEATURED_CANDIDATES = 30;
const MAX_FEATURED_CARDS = 12;
const FEATURED_CACHE_TTL_MS = 15 * 60 * 1000;

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
  marketPrice: number | null;
  marketPriceBasis: "confirmed_ungraded_sales" | null;
  transactionCount: number;
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

type FeaturedCache = { expiresAt: number; promise: Promise<FeaturedCard[]> };
let featuredCache: FeaturedCache | undefined;

export function isCanonicalCatalogUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function confirmedFeaturedPrice(input: {
  marketPrice: number | null;
  marketPriceBasis: string | null;
  transactionCount: number;
}): Pick<FeaturedCard, "marketPrice" | "marketPriceBasis" | "transactionCount"> {
  const confirmed = input.transactionCount >= 3
    && input.marketPriceBasis === "confirmed_ungraded_sales"
    && typeof input.marketPrice === "number";
  return {
    marketPrice: confirmed ? input.marketPrice : null,
    marketPriceBasis: confirmed ? "confirmed_ungraded_sales" : null,
    transactionCount: input.transactionCount,
  };
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

async function loadFeaturedCandidates(): Promise<Array<{ card: CatalogCard & { imageUrl: string } }>> {
  const result = await catalogDb().query<CardImageRow>(
    `select c.id,c.name,c.collector_number,s.code as set_code,s.name as set_name,
        c.rarity_code,c.variant_attributes,i.verified,i.usable_in_card_eye,i.license_status,i.image_url,
       i.source_url,i.metadata
     from public.card_featured_config f
     join public.cards c on c.id=f.card_id
     join public.card_sets s on s.id=c.set_id
     join public.card_images i
       on i.card_id=c.id and i.image_type='primary' and i.is_primary=true
     where f.active=true and c.catalog_status='active' and c.language='ja'
       and i.verified=true and i.usable_in_card_eye=true
        and i.license_status in ('display_only_authorized_by_card_eye_owner','display_only_authorized_by_provider')
     order by f.priority desc,c.id
     limit $1`,
    [MAX_FEATURED_CANDIDATES],
  );
  const cards = result.rows.flatMap((row) => {
    const imageUrl = primaryImageUrl(row);
    return imageUrl ? [{ card: { ...toCatalogCard(row, imageUrl), imageUrl } }] : [];
  });
  return cards.slice(0, MAX_FEATURED_CARDS);
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

async function buildFeaturedCards(): Promise<FeaturedCard[]> {
  const candidates = await loadFeaturedCandidates();
  const cards = await mapWithConcurrency(candidates, 3, async ({ card }) => {
    try {
      const { getLiveCardPrices } = await import("../lib/live-prices");
      const prices = await getLiveCardPrices(card.number, card.name, 90, true);
      return { ...card, ...confirmedFeaturedPrice({
        marketPrice: prices.marketPrice,
        marketPriceBasis: prices.marketPriceBasis,
        transactionCount: prices.summary.transactionCount,
      }) };
    } catch {
      // A failed price provider is an unavailable price, not a fabricated estimate.
    }
    return { ...card, marketPrice: null, marketPriceBasis: null, transactionCount: 0 };
  });
  return cards.sort((a, b) => Number(b.marketPrice !== null) - Number(a.marketPrice !== null));
}

export async function getFeaturedCards(): Promise<FeaturedCard[]> {
  if (featuredCache && featuredCache.expiresAt > Date.now()) return featuredCache.promise;
  const promise = buildFeaturedCards();
  featuredCache = { expiresAt: Date.now() + FEATURED_CACHE_TTL_MS, promise };
  try {
    return await promise;
  } catch (error) {
    if (featuredCache?.promise === promise) featuredCache = undefined;
    throw error;
  }
}