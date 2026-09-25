import { catalogDb, catalogDbConfigured } from "./db";
import {
  isApprovedPrimaryImage,
  type CardImageProvider,
  type CardImageProviderImage,
  type CardImageProviderInput,
  type CardImageProviderResult,
} from "./card-image-provider";

const OFFICIAL_ORIGIN = "https://www.pokemon-card.com";
const SOURCE = "pokemon-card-official";
const DISPLAY_LICENSE_STATUS = "display_only_authorized_by_card_eye_owner";
const SEARCH_URL = `${OFFICIAL_ORIGIN}/card-search/resultAPI.php`;
const DETAIL_PATH = "/card-search/details.php/card/";
const MAX_SEARCH_PAGES = 10;
const MAX_DETAIL_CANDIDATES = 24;
const CACHE_TTL_MS = 10 * 60 * 1000;

export type RepresentativeImageInput = CardImageProviderInput & {
  cardId?: string | null;
};

export type RepresentativeImageResult = {
  cardId: string | null;
  imageUrl: string | null;
  sourceUrl: string | null;
  status: "matched" | "representative" | "unmatched" | "ambiguous" | "unavailable";
};

export type OfficialCardDetail = {
  officialId: string;
  name: string;
  collectorNumber: string;
  setCode: string;
  setName: string | null;
  rarity: string;
  imageUrl: string;
  sourceUrl: string;
};

type OfficialSearchCard = {
  cardID: string;
  cardThumbFile: string;
  cardNameAltText: string;
  cardNameViewText?: string;
};

type SearchPage = {
  result: number;
  hitCnt: number;
  maxPage: number;
  cardList: OfficialSearchCard[];
};

type SearchCacheEntry = { expiresAt: number; pages: Map<number, OfficialSearchCard[]>; maxPage: number };
type DetailCacheEntry = { expiresAt: number; detail: OfficialCardDetail };
type NegativeCacheEntry = { expiresAt: number; status: "unmatched" | "ambiguous" };

const searchCache = new Map<string, SearchCacheEntry>();
const detailCache = new Map<string, DetailCacheEntry>();
const negativeCache = new Map<string, NegativeCacheEntry>();
let nextOfficialRequestAt = 0;
let officialRequestQueue = Promise.resolve();

const normalize = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("ja-JP").replace(/[\s・\-＿_]/g, "");

function normalizeSeries(value: string) {
  return normalize(value)
    .replace(/^(?:拡張パック|強化拡張パック|ハイクラスパック|スターターセット)/, "")
    .replace(/[「」『』【】]/g, "");
}

function normalizeRarity(value: string) {
  const normalized = normalize(value).replace(/[_-]/g, "");
  const aliases: Record<string, string> = {
    ar: "ar",
    illustrationrare: "ar",
    sar: "sar",
    specialillustrationrare: "sar",
    rr: "rr",
    doublerare: "rr",
    sr: "sr",
    superrare: "sr",
    ur: "ur",
    ultrarare: "ur",
    hr: "hr",
    hyperrare: "hr",
    csr: "csr",
    charizardsuperrare: "csr",
    s: "s",
    ace: "acespec",
    acespec: "acespec",
  };
  return aliases[normalized] ?? normalized;
}

type ParsedNumber = { local: string; total: string | null };

function normalizeNumberPart(value: string) {
  const normalized = value.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
  return /^\d+$/.test(normalized) ? String(Number(normalized)) : normalized;
}

function parseCollectorNumber(value: string, series: string): ParsedNumber | null {
  let normalized = value.normalize("NFKC").trim();
  const seriesPrefix = new RegExp(`^${escapeRegExp(series.normalize("NFKC").trim())}[\\s:：-]*`, "i");
  normalized = normalized.replace(seriesPrefix, "");
  normalized = normalized.replace(/^[A-Za-z0-9_-]{2,16}[\s:：-]+(?=\d{1,4}\s*\/)/, "");
  normalized = normalized.replace(/\s+/g, "");
  const match = normalized.match(/^([A-Za-z0-9-]{1,24})(?:\/([A-Za-z0-9-]{1,24}))?$/);
  if (!match) return null;
  return {
    local: normalizeNumberPart(match[1]),
    total: match[2] ? normalizeNumberPart(match[2]) : null,
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;|&#160;|&#x0*a0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_whole, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_whole, decimal: string) => String.fromCodePoint(Number(decimal)));
}

function textContent(value: string) {
  return decodeHtml(value.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

function officialRarityFromIcon(icon: string): string | null {
  const rarityCodes: Record<string, string> = {
    ar: "AR",
    sar: "SAR",
    rr: "RR",
    sr: "SR",
    sr_c: "SR",
    ur: "UR",
    hr: "HR",
    csr: "CSR",
    s: "S",
  };
  // The result page also contains common and older rarity icons. Preserve their
  // distinct code so they cannot be mistaken for AR/SAR/RR, rather than making
  // one unrelated candidate invalidate the whole search.
  return rarityCodes[icon.toLowerCase()] ?? icon.toUpperCase();
}

export function parseOfficialCardDetail(html: string, officialId: string): OfficialCardDetail | null {
  if (!/^\d{1,12}$/.test(officialId)) return null;
  const titleMatch = html.match(/<h1\b[^>]*class=["'][^"']*\bHeading1\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
  const imageMatch = html.match(/<img\b[^>]*class=["']fit["'][^>]*src=["']([^"']+)["'][^>]*>/i);
  const regulationMatch = html.match(/<img\b[^>]*class=["']img-regulation["'][^>]*alt=["']([^"']+)["'][^>]*>/i);
  const numberAndRarityMatch = html.match(
    /<div\b[^>]*class=["']subtext\s+Text-fjalla["'][^>]*>([\s\S]*?)<\/div>/i,
  );
  if (!titleMatch || !imageMatch || !regulationMatch || !numberAndRarityMatch) return null;

  const name = textContent(titleMatch[1]);
  const image = new URL(imageMatch[1], OFFICIAL_ORIGIN);
  const pathSetMatch = image.pathname.match(/^\/assets\/images\/card_images\/large\/([A-Za-z0-9_-]+)\/[^/]+$/);
  const setCode = decodeHtml(regulationMatch[1]).trim();
  const subtext = numberAndRarityMatch[1].replace(/&nbsp;|&#160;|&#x0*a0;/gi, " ");
  const numberMatch = subtext.match(/(?:^|\s)(\d{1,4})\s*\/\s*(\d{1,4})(?:\s|<|$)/);
  const rarityMatch = subtext.match(/\/assets\/images\/card\/rarity\/ic_rare_([A-Za-z0-9_-]+)\.gif/i);
  const rarity = rarityMatch ? officialRarityFromIcon(rarityMatch[1]) : null;
  const packLinkMatch = html.match(
    /<li\b[^>]*class=["']List_item["'][^>]*>\s*<a\b[^>]*>([\s\S]*?)<\/a>/i,
  );
  const sourceUrl = new URL(`${DETAIL_PATH}${officialId}/regu/all`, OFFICIAL_ORIGIN).toString();

  if (
    !name ||
    !/^[A-Za-z0-9_-]{2,16}$/.test(setCode) ||
    !pathSetMatch ||
    pathSetMatch[1].toLowerCase() !== setCode.toLowerCase() ||
    image.origin !== OFFICIAL_ORIGIN ||
    !image.pathname.startsWith("/assets/images/card_images/large/") ||
    !numberMatch ||
    !rarity
  ) {
    return null;
  }

  const productName = packLinkMatch ? textContent(packLinkMatch[1]) : null;
  return {
    officialId,
    name,
    collectorNumber: `${Number(numberMatch[1])}/${Number(numberMatch[2])}`
      .replace(/^(\d+)\//, (_whole, local: string) => `${String(Number(local)).padStart(numberMatch[1].length, "0")}/`)
      .replace(/\/(\d+)$/, (_whole, total: string) => `/${String(Number(total)).padStart(numberMatch[2].length, "0")}`),
    setCode,
    setName: productName,
    rarity,
    imageUrl: image.toString(),
    sourceUrl,
  };
}

export function selectExactOfficialCard(
  input: RepresentativeImageInput,
  candidates: OfficialCardDetail[],
  completeSearch: boolean,
): { status: "matched" | "unmatched" | "ambiguous"; candidate: OfficialCardDetail | null } {
  if (!completeSearch) return { status: "ambiguous", candidate: null };
  const expectedNumber = parseCollectorNumber(input.cardNumber, input.series);
  if (!expectedNumber || !input.cardName.trim() || !input.series.trim() || !input.rarity.trim()) {
    return { status: "unmatched", candidate: null };
  }

  const matchingIdentity = candidates.filter((candidate) => {
    const actualNumber = parseCollectorNumber(candidate.collectorNumber, candidate.setCode);
    if (!actualNumber) return false;
    const numberMatches = actualNumber.local === expectedNumber.local
      && (!expectedNumber.total || actualNumber.total === expectedNumber.total);
    const series = normalizeSeries(input.series);
    const setMatches = normalize(input.series) === normalize(candidate.setCode)
      || (candidate.setName !== null && series === normalizeSeries(candidate.setName));
    return normalize(candidate.name) === normalize(input.cardName)
      && numberMatches
      && setMatches;
  });

  const rarityMatches = matchingIdentity.filter((candidate) =>
    normalizeRarity(candidate.rarity) === normalizeRarity(input.rarity),
  );
  if (rarityMatches.length > 1) return { status: "ambiguous", candidate: null };
  if (rarityMatches.length === 1) return { status: "matched", candidate: rarityMatches[0] };
  if (matchingIdentity.length > 0) return { status: "ambiguous", candidate: null };
  return { status: "unmatched", candidate: null };
}

function validSearchPage(value: unknown): value is SearchPage {
  if (!value || typeof value !== "object") return false;
  const page = value as Partial<SearchPage>;
  return page.result === 1
    && Number.isInteger(page.maxPage)
    && Number.isInteger(page.hitCnt)
    && Array.isArray(page.cardList)
    && page.cardList.every((card) =>
      !!card && typeof card.cardID === "string"
      && typeof card.cardThumbFile === "string"
      && typeof card.cardNameAltText === "string",
    );
}

async function waitForRequestSlot() {
  const current = officialRequestQueue.then(async () => {
    const waitMs = Math.max(0, nextOfficialRequestAt - Date.now());
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    nextOfficialRequestAt = Date.now() + 1000;
  });
  officialRequestQueue = current.catch(() => undefined);
  await current;
}

async function fetchOfficialJson(url: URL): Promise<unknown> {
  if (url.origin !== OFFICIAL_ORIGIN) throw new Error("Unexpected official card API origin");
  await waitForRequestSlot();
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Official card search returned HTTP ${response.status}`);
  return await response.json() as unknown;
}

async function fetchOfficialHtml(url: URL): Promise<string> {
  if (url.origin !== OFFICIAL_ORIGIN || !url.pathname.startsWith(DETAIL_PATH)) {
    throw new Error("Unexpected official card detail origin");
  }
  await waitForRequestSlot();
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Official card detail returned HTTP ${response.status}`);
  const finalUrl = new URL(response.url || url.toString());
  if (finalUrl.origin !== OFFICIAL_ORIGIN) throw new Error("Unexpected redirect from official card detail");
  return await response.text();
}

function getCachedSearch(name: string) {
  const cached = searchCache.get(normalize(name));
  if (!cached || cached.expiresAt <= Date.now()) {
    searchCache.delete(normalize(name));
    return null;
  }
  return cached;
}

async function searchOfficialCards(name: string): Promise<SearchCacheEntry> {
  const existing = getCachedSearch(name);
  if (existing) return existing;

  const firstUrl = new URL(SEARCH_URL);
  firstUrl.searchParams.set("keyword", name);
  firstUrl.searchParams.set("sm_and_keyword", "true");
  firstUrl.searchParams.set("regulation_sidebar_form", "all");
  firstUrl.searchParams.set("page", "1");
  const first = await fetchOfficialJson(firstUrl);
  if (!validSearchPage(first)) throw new Error("Invalid official card search response");
  if (first.maxPage > MAX_SEARCH_PAGES) {
    return { expiresAt: Date.now() + CACHE_TTL_MS, pages: new Map([[1, first.cardList]]), maxPage: MAX_SEARCH_PAGES + 1 };
  }

  const cache: SearchCacheEntry = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    pages: new Map([[1, first.cardList]]),
    maxPage: first.maxPage,
  };
  for (let page = 2; page <= cache.maxPage; page++) {
    const pageUrl = new URL(SEARCH_URL);
    pageUrl.searchParams.set("keyword", name);
    pageUrl.searchParams.set("sm_and_keyword", "true");
    pageUrl.searchParams.set("regulation_sidebar_form", "all");
    pageUrl.searchParams.set("page", String(page));
    const response = await fetchOfficialJson(pageUrl);
    if (!validSearchPage(response) || response.maxPage !== cache.maxPage) {
      throw new Error("Official card search pagination changed during lookup");
    }
    cache.pages.set(page, response.cardList);
  }
  searchCache.set(normalize(name), cache);
  return cache;
}

async function getOfficialDetail(id: string): Promise<OfficialCardDetail> {
  const cached = detailCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.detail;
  const url = new URL(`${DETAIL_PATH}${encodeURIComponent(id)}/regu/all`, OFFICIAL_ORIGIN);
  const parsed = parseOfficialCardDetail(await fetchOfficialHtml(url), id);
  if (!parsed) throw new Error("Official card detail page did not contain verifiable identity metadata");
  detailCache.set(id, { expiresAt: Date.now() + 24 * 60 * 60 * 1000, detail: parsed });
  return parsed;
}

async function catalogSetCode(value: string) {
  if (/^[A-Za-z0-9_-]{2,16}$/.test(value)) return value;
  const result = await catalogDb().query<{ code: string }>(
    `select code from public.card_sets where language='ja'
     and (lower(name)=lower($1) or lower(coalesce(series,''))=lower($1)) limit 2`,
    [value.trim()],
  );
  return result.rows.length === 1 ? result.rows[0].code : null;
}

async function seriesCodeHint(input: RepresentativeImageInput) {
  const numberPrefix = input.cardNumber.normalize("NFKC").trim()
    .match(/^([A-Za-z0-9_-]{2,16})[\s:：-]+(?=\d{1,4}\s*\/)/);
  return numberPrefix?.[1] ?? await catalogSetCode(input.series);
}

async function resolveFromOfficialSite(input: RepresentativeImageInput): Promise<
  { status: "matched"; candidate: OfficialCardDetail } | { status: "unmatched" | "ambiguous" }
> {
  const pages = await searchOfficialCards(input.cardName);
  if (pages.maxPage > MAX_SEARCH_PAGES) return { status: "ambiguous" };

  const setCode = await seriesCodeHint(input);
  const allCards = [...pages.pages.values()].flat();
  const byNameAndSet = allCards.filter((card) => {
    if (normalize(card.cardNameAltText) !== normalize(input.cardName)) return false;
    if (!setCode) return true;
    const image = new URL(card.cardThumbFile, OFFICIAL_ORIGIN);
    if (image.origin !== OFFICIAL_ORIGIN) return false;
    return image.pathname.split("/")[5]?.toLowerCase() === setCode.toLowerCase();
  });
  if (byNameAndSet.length === 0) return { status: "unmatched" };
  if (byNameAndSet.length > MAX_DETAIL_CANDIDATES) return { status: "ambiguous" };

  const details: OfficialCardDetail[] = [];
  for (const card of byNameAndSet) details.push(await getOfficialDetail(card.cardID));
  const exact = selectExactOfficialCard(input, details, pages.pages.size === pages.maxPage);
  if (exact.status === "matched" && exact.candidate) {
    return { status: "matched", candidate: exact.candidate };
  }
  return { status: exact.status === "matched" ? "ambiguous" : exact.status };
}

export class OfficialCardImageProvider implements CardImageProvider {
  async lookup(input: CardImageProviderInput): Promise<CardImageProviderResult> {
    const result = await resolveFromOfficialSite(input);
    if (result.status !== "matched") return result;
    const card = result.candidate;
    return {
      status: "matched",
      image: {
        source: SOURCE,
        externalId: card.officialId,
        imageUrl: card.imageUrl,
        sourceUrl: card.sourceUrl,
        cardName: card.name,
        collectorNumber: card.collectorNumber,
        setCode: card.setCode,
        setName: card.setName,
        rarity: card.rarity,
        rightsInformation: "Display-only authorization reported by CARD EYE owner; remote reference only. Image bytes are not stored.",
        licenseStatus: DISPLAY_LICENSE_STATUS,
        approvedForDisplay: true,
      },
    };
  }
}

let cardImageProvider: CardImageProvider = new OfficialCardImageProvider();

export function setCardImageProvider(provider: CardImageProvider): void {
  cardImageProvider = provider;
}

function output(status: RepresentativeImageResult["status"]): RepresentativeImageResult {
  return { cardId: null, imageUrl: null, sourceUrl: null, status };
}

async function representativeFromOfficialSearch(input: RepresentativeImageInput): Promise<RepresentativeImageResult | null> {
  if (!input.cardName.trim() || /^(?:不明|unknown)$/i.test(input.cardName.trim())) return null;
  const pages = await searchOfficialCards(input.cardName);
  const candidates = [...pages.pages.values()].flat()
    .filter((card) => normalize(card.cardNameAltText) === normalize(input.cardName));
  const setHint = input.series.trim().match(/^[A-Za-z0-9_-]{2,16}$/)?.[0]?.toLowerCase();
  const ranked = setHint
    ? [...candidates].sort((a, b) => {
      const matchesSet = (card: OfficialSearchCard) =>
        new URL(card.cardThumbFile, OFFICIAL_ORIGIN).pathname.split("/")[5]?.toLowerCase() === setHint ? 1 : 0;
      return matchesSet(b) - matchesSet(a);
    })
    : candidates;
  for (const card of ranked) {
    const image = new URL(card.cardThumbFile, OFFICIAL_ORIGIN);
    if (image.origin !== OFFICIAL_ORIGIN || !image.pathname.startsWith("/assets/images/card_images/large/")) continue;
    return {
      cardId: null,
      imageUrl: image.toString(),
      sourceUrl: new URL(`${DETAIL_PATH}${encodeURIComponent(card.cardID)}/regu/all`, OFFICIAL_ORIGIN).toString(),
      status: "representative",
    };
  }
  return null;
}

function identityMatchesInput(
  row: {
    name: string;
    collector_number: string;
    set_code: string;
    set_name: string;
    rarity_code: string | null;
    variant_attributes: Record<string, unknown>;
    metadata: Record<string, unknown>;
  },
  input: RepresentativeImageInput,
) {
  const expected = parseCollectorNumber(input.cardNumber, input.series);
  if (!expected || !row.rarity_code) return false;
  const attributes = row.variant_attributes ?? {};
  const verifiedIdentity = row.metadata.verifiedIdentity;
  const verifiedNumber = verifiedIdentity && typeof verifiedIdentity === "object"
    ? (verifiedIdentity as Record<string, unknown>).collectorNumber : null;
  const fullNumber = typeof verifiedNumber === "string"
    ? verifiedNumber
    : typeof row.metadata.verifiedCollectorNumber === "string"
      ? row.metadata.verifiedCollectorNumber
      : typeof row.metadata.officialCollectorNumber === "string"
        ? row.metadata.officialCollectorNumber
        : typeof attributes.officialCollectorNumber === "string"
          ? attributes.officialCollectorNumber : row.collector_number;
  const actual = parseCollectorNumber(fullNumber, row.set_code);
  const setMatches = normalize(input.series) === normalize(row.set_code)
    || normalizeSeries(input.series) === normalizeSeries(row.set_name);
  return !!actual
    && normalize(row.name) === normalize(input.cardName)
    && actual.local === expected.local
    && (!expected.total || actual.total === expected.total)
    && setMatches
    && normalizeRarity(row.rarity_code) === normalizeRarity(input.rarity);
}

function isSafeRemoteReference(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

async function getCachedImage(input: RepresentativeImageInput): Promise<RepresentativeImageResult | null> {
  const expectedNumber = parseCollectorNumber(input.cardNumber, input.series);
  if (!expectedNumber) return null;
  const normalizedNumber = expectedNumber.local;
  const result = await catalogDb().query<{
    id: string;
    name: string;
    collector_number: string;
    set_code: string;
    set_name: string;
    rarity_code: string | null;
    variant_attributes: Record<string, unknown>;
    image_url: string;
    source_url: string | null;
    source: string;
    license_status: string;
    verified: boolean;
    usable_in_card_eye: boolean;
    metadata: Record<string, unknown>;
  }>(
    `select c.id,c.name,c.collector_number,s.code as set_code,s.name as set_name,
       c.rarity_code,c.variant_attributes,i.image_url,i.source_url,i.source,
       i.license_status,i.verified,i.usable_in_card_eye,i.metadata
     from public.cards c
     join public.card_sets s on s.id=c.set_id
     join public.card_images i on i.card_id=c.id
     where ($1::uuid is null or c.id=$1::uuid)
      and coalesce(nullif(upper(ltrim(c.collector_number_normalized,'0')),''),'0')=$2
      and c.language='ja'
       and i.image_type='primary' and i.is_primary=true
       and i.verified=true and i.usable_in_card_eye=true
       and i.license_status not in ('requires_review','rejected','revoked','denied')
     order by i.updated_at desc
     limit 20`,
    [input.cardId ?? null, normalizedNumber],
  );
  const row = result.rows.find((candidate) =>
    identityMatchesInput(candidate, input)
    && isApprovedPrimaryImage({
      verified: candidate.verified,
      usableInCardEye: candidate.usable_in_card_eye,
      licenseStatus: candidate.license_status,
    })
    && isSafeRemoteReference(candidate.image_url)
    && (!candidate.source_url || isSafeRemoteReference(candidate.source_url)),
  );
  if (!row) return null;
  return { cardId: row.id, imageUrl: row.image_url, sourceUrl: row.source_url, status: "matched" };
}

async function persistProviderImage(
  input: RepresentativeImageInput,
  image: CardImageProviderImage,
): Promise<{ cardId: string; imageUrl: string; sourceUrl: string | null } | null> {
  if (
    !image.approvedForDisplay ||
    !isApprovedPrimaryImage({
      verified: true,
      usableInCardEye: image.approvedForDisplay,
      licenseStatus: image.licenseStatus,
    }) ||
    !isSafeRemoteReference(image.imageUrl) ||
    !isSafeRemoteReference(image.sourceUrl)
  ) {
    return null;
  }
  const client = await catalogDb().connect();
  try {
    await client.query("begin");
    const setResult = await client.query<{ id: string; name: string }>(
      `insert into public.card_sets(source,source_id,code,name,series,language)
       values($1,$2,$2,$3,null,'ja')
       on conflict (code,language) do update set code=excluded.code
       returning id,name`,
      [image.source, image.setCode, image.setName ?? image.setCode],
    );
    const setId = setResult.rows[0].id;
    const number = image.collectorNumber.split("/")[0];
    const normalizedNumber = normalizeNumberPart(number);
    const variants = await client.query<{
      id: string;
      name: string;
      rarity_code: string | null;
      collector_number: string;
      variant_attributes: Record<string, unknown>;
    }>(
      `select id,name,rarity_code,collector_number,variant_attributes from public.cards
       where set_id=$1
         and coalesce(nullif(upper(ltrim(collector_number_normalized,'0')),''),'0')=$2
         and language='ja' and catalog_status='active'
       for update`,
      [setId, normalizedNumber],
    );
    const exactVariants = variants.rows.filter((row) =>
      normalize(row.name) === normalize(image.cardName)
      && (!row.rarity_code || normalizeRarity(row.rarity_code) === normalizeRarity(image.rarity)),
    );
    if (variants.rows.length > 0 && exactVariants.length === 0) {
      await client.query("rollback");
      return null;
    }
    if (exactVariants.length > 1) {
      await client.query("rollback");
      return null;
    }
    if (input.cardId && exactVariants[0]?.id !== input.cardId) {
      await client.query("rollback");
      return null;
    }

    let cardId = exactVariants[0]?.id;
    const verifiedAttributes: Record<string, unknown> = {
      ...(exactVariants[0]?.variant_attributes ?? {}),
      verifiedCollectorNumber: image.collectorNumber,
      verifiedRarity: image.rarity,
      verifiedSetCode: image.setCode,
    };
    if (image.source === SOURCE) {
      verifiedAttributes.officialCardId = image.externalId;
      verifiedAttributes.officialCollectorNumber = image.collectorNumber;
      verifiedAttributes.officialRarity = image.rarity;
      verifiedAttributes.officialSetCode = image.setCode;
    }
    if (!cardId) {
      const inserted = await client.query<{ id: string }>(
        `insert into public.cards(set_id,name,collector_number,collector_number_normalized,rarity_code,language,variant_code,variant_attributes)
         values($1,$2,$3,$4,$5,'ja','standard',$6::jsonb)
         on conflict (set_id,collector_number_normalized,language,variant_code) do nothing
         returning id`,
        [setId, image.cardName, number, normalizedNumber, image.rarity, JSON.stringify(verifiedAttributes)],
      );
      cardId = inserted.rows[0]?.id;
      if (!cardId) {
        const raced = await client.query<{ id: string; name: string; rarity_code: string | null }>(
          `select id,name,rarity_code from public.cards
           where set_id=$1 and collector_number_normalized=$2 and language='ja' and variant_code='standard'
           for update`,
          [setId, normalizedNumber],
        );
        const row = raced.rows[0];
        if (
          !row ||
          normalize(row.name) !== normalize(image.cardName) ||
          (row.rarity_code && normalizeRarity(row.rarity_code) !== normalizeRarity(image.rarity))
        ) {
          await client.query("rollback");
          return null;
        }
        cardId = row.id;
        await client.query(
          `update public.cards set rarity_code=$2,
            variant_attributes=variant_attributes || $3::jsonb,updated_at=now()
           where id=$1`,
          [cardId, image.rarity, JSON.stringify(verifiedAttributes)],
        );
      }
    } else {
      await client.query(
        `update public.cards set rarity_code=$2,
          variant_attributes=variant_attributes || $3::jsonb,updated_at=now()
         where id=$1`,
        [cardId, image.rarity, JSON.stringify(verifiedAttributes)],
      );
    }

    const externalId = await client.query<{ card_id: string }>(
      `insert into public.card_external_ids(provider,external_id,card_id)
       values($1,$2,$3)
       on conflict (provider,external_id) do update
         set last_fetched_at=now()
         where card_external_ids.card_id=excluded.card_id
       returning card_id`,
      [image.source, image.externalId, cardId],
    );
    if (externalId.rows[0]?.card_id !== cardId) {
      await client.query("rollback");
      return null;
    }

    const existingPrimary = await client.query<{
      image_url: string;
      source_url: string | null;
      verified: boolean;
      usable_in_card_eye: boolean;
      license_status: string;
    }>(
      `select image_url,source_url,verified,usable_in_card_eye,license_status
       from public.card_images
       where card_id=$1 and image_type='primary' and is_primary=true
       order by updated_at desc
       limit 20
       for update`,
      [cardId],
    );
    const masterPrimary = existingPrimary.rows.find((row) =>
      isApprovedPrimaryImage({
        verified: row.verified,
        usableInCardEye: row.usable_in_card_eye,
        licenseStatus: row.license_status,
      })
      && isSafeRemoteReference(row.image_url)
      && (!row.source_url || isSafeRemoteReference(row.source_url)),
    );
    if (masterPrimary) {
      await client.query("commit");
      return { cardId, imageUrl: masterPrimary.image_url, sourceUrl: masterPrimary.source_url };
    }

    await client.query(
      `update public.card_images set is_primary=false,updated_at=now()
       where card_id=$1 and image_type='primary' and is_primary=true`,
      [cardId],
    );
    await client.query(
      `insert into public.card_images
        (card_id,source,image_url,source_url,rights_information,license_status,usable_in_card_eye,
         image_type,is_primary,verified,metadata,updated_at)
       values($1,$2,$3,$4,
         $5,$6,$7,'primary',true,true,$8::jsonb,now())
       on conflict (card_id,source,image_url) do update set
         source_url=excluded.source_url,
         rights_information=excluded.rights_information,
         license_status=excluded.license_status,
         usable_in_card_eye=excluded.usable_in_card_eye,
         image_type='primary',
         is_primary=true,
         verified=true,
         metadata=excluded.metadata,
         updated_at=now()`,
      [
        cardId,
        image.source,
        image.imageUrl,
        image.sourceUrl,
        image.rightsInformation,
        image.licenseStatus,
        image.approvedForDisplay,
        JSON.stringify({
          providerCardId: image.externalId,
          verifiedCollectorNumber: image.collectorNumber,
          verifiedIdentity: {
            name: image.cardName,
            collectorNumber: image.collectorNumber,
            setCode: image.setCode,
            rarity: image.rarity,
          },
          ...(image.source === SOURCE ? {
            officialCardId: image.externalId,
            officialCollectorNumber: image.collectorNumber,
            officialSetCode: image.setCode,
            officialRarity: image.rarity,
          } : {}),
        }),
      ],
    );
    await client.query("commit");
    return { cardId, imageUrl: image.imageUrl, sourceUrl: image.sourceUrl };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function resolveRepresentativeImage(
  input: RepresentativeImageInput,
): Promise<RepresentativeImageResult> {
  const representative = async () => {
    try { return await representativeFromOfficialSearch(input); }
    catch { return null; }
  };
  if (!input.cardName.trim()) return output("unmatched");
  const expectedNumber = parseCollectorNumber(input.cardNumber, input.series);
  if (!catalogDbConfigured() || !expectedNumber || !input.series.trim() || !input.rarity.trim()) {
    return await representative() ?? output("unmatched");
  }
  try {
    const cached = await getCachedImage(input);
    if (cached) return cached;
    const cacheKey = [normalize(input.cardName), normalize(input.cardNumber), normalize(input.series), normalizeRarity(input.rarity)].join("|");
    const previous = negativeCache.get(cacheKey);
    if (previous && previous.expiresAt > Date.now()) return await representative() ?? output(previous.status);

    const resolution = await cardImageProvider.lookup(input);
    if (resolution.status !== "matched") {
      if (resolution.status !== "unavailable") {
        negativeCache.set(cacheKey, { status: resolution.status, expiresAt: Date.now() + CACHE_TTL_MS });
      }
      return await representative() ?? output(resolution.status);
    }
    const image = resolution.image;
    const identityMatch = selectExactOfficialCard(input, [{
      officialId: image.externalId,
      name: image.cardName,
      collectorNumber: image.collectorNumber,
      setCode: image.setCode,
      setName: image.setName,
      rarity: image.rarity,
      imageUrl: image.imageUrl,
      sourceUrl: image.sourceUrl,
    }], true);
    if (identityMatch.status !== "matched" || !image.approvedForDisplay) {
      return await representative() ?? output(identityMatch.status === "matched" ? "unmatched" : identityMatch.status);
    }
    const persisted = await persistProviderImage(input, image);
    if (!persisted || (input.cardId && persisted.cardId !== input.cardId)) return await representative() ?? output("ambiguous");
    negativeCache.delete(cacheKey);
    return {
      cardId: persisted.cardId,
      imageUrl: persisted.imageUrl,
      sourceUrl: persisted.sourceUrl,
      status: "matched",
    };
  } catch {
    return await representative() ?? output("unavailable");
  }
}