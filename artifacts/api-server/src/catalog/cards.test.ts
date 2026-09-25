import assert from "node:assert/strict";
import { test } from "node:test";
import { discoverySignal, featuredReferenceProjection, featuredSelectionReason, isCanonicalCatalogUuid, rankFeaturedCards, verifiedIdentityMatches } from "./cards";
import { isApprovedPrimaryImage } from "./card-image-provider";
import { broadenedReferenceRange, type AiMarketEstimates } from "../lib/ai-market-search";

test("catalog card IDs must use the canonical UUID shape", () => {
  assert.equal(isCanonicalCatalogUuid("11e80102-1234-4543-8901-efb012345678"), true);
  assert.equal(isCanonicalCatalogUuid("201/SV2a"), false);
  assert.equal(isCanonicalCatalogUuid("11e80102-1234-4543-8901"), false);
});

test("featured selection uses recent exact scans and discovery, not transactions", () => {
  assert.equal(featuredSelectionReason(1), "scanned");
  assert.equal(featuredSelectionReason(0), "discovery");
  const card = (id: string, recentScanCount: number, available: boolean) => ({
    id, name: id, number: "201/165", series: "SV2a", rarity: "SAR",
    imageUrl: "https://example.com/card.jpg", referenceMin: available ? 1000 : null,
    referenceMax: available ? 1400 : null, referenceCheckedAt: null,
    referenceStatus: available ? "available" as const : "unavailable" as const,
    recentScanCount, selectionReason: featuredSelectionReason(recentScanCount),
  } as const);
  const pool = [card("discovery", 0, false), card("scanned", 2, true), card("priced", 0, true)];
  const ranked = rankFeaturedCards(pool, "2026-09-25");
  assert.deepEqual(ranked.map((item) => item.id), ["scanned", "priced", "discovery"]);
  assert.equal("recentScanCount" in ranked[0], false);
});

test("featured home summary is an exact projection of the canonical reference range", () => {
  const estimates: AiMarketEstimates = {
    ungradedPlayed: { min: 100, max: 500, note: "" },
    ungradedExcellent: { min: 900, max: 1500, note: "" },
    ungradedMint: { min: 1400, max: 2200, note: "" },
    psa9: { min: 5000, max: 8000, note: "" },
    psa10: { min: 9000, max: 12000, note: "" },
    psa10Listing: { min: 11000, max: 15000, note: "" },
  };
  assert.deepEqual(
    featuredReferenceProjection({ estimates }),
    broadenedReferenceRange(estimates),
  );
  assert.deepEqual(featuredReferenceProjection({ estimates: {
    ...estimates,
    ungradedMint: { min: null, max: null, note: "" },
  } }), { referenceMin: null, referenceMax: null });
});

test("discovery order is stable within a day and rotates between days", () => {
  const pool = Array.from({ length: 8 }, (_, index) => ({
    id: `card-${index}`, name: "カード", number: "201/165", series: "SV2a",
    rarity: "SAR", imageUrl: "https://example.com/card.jpg", referenceMin: null,
    referenceMax: null, referenceCheckedAt: null, referenceStatus: "unavailable" as const,
    recentScanCount: 0,
    selectionReason: "discovery" as const,
  }));
  const today = rankFeaturedCards(pool, "2026-09-25").map((item) => item.id);
  assert.deepEqual(rankFeaturedCards([...pool].reverse(), "2026-09-25").map((item) => item.id), today);
  const orders = new Set(Array.from({ length: 7 }, (_, day) =>
    rankFeaturedCards(pool, `2026-09-${String(25 + day).padStart(2, "0")}`).map((item) => item.id).join(",")
  ));
  assert.ok(orders.size > 1);
});

test("a priced discovery appears beside recent scans rather than being buried", () => {
  const card = (id: string, scans: number, available = true) => ({
    id, name: id, number: "201/165", series: "SV2a", rarity: "SAR",
    imageUrl: "https://example.com/card.jpg",
    referenceMin: available ? 1000 : null, referenceMax: available ? 1400 : null,
    referenceCheckedAt: null, referenceStatus: available ? "available" as const : "unavailable" as const,
    recentScanCount: scans, selectionReason: featuredSelectionReason(scans),
  } as const);
  const result = rankFeaturedCards([
    card("one", 5), card("two", 4), card("three", 3), card("four", 2),
    card("new-one", 0), card("new-two", 0, false),
  ], "2026-09-25");
  assert.deepEqual(result.slice(0, 2).map((item) => item.id), ["one", "two"]);
  assert.equal(result[2].selectionReason, "discovery");
  assert.equal(new Set(result.map((item) => item.id)).size, 6);
});

test("catalog discovery only calls a dated release new, and uses real exact scans first", () => {
  const today = new Date("2026-09-25T12:00:00Z");
  assert.equal(discoverySignal(2, null, today), "recently_scanned");
  assert.equal(discoverySignal(0, "2026-07-31", today), "new_release");
  assert.equal(discoverySignal(0, "2025-07-31", today), "catalog");
  assert.equal(discoverySignal(0, "2026-12-01", today), "catalog");
  assert.equal(discoverySignal(0, null, today), "catalog");
});

test("a primary image must match the full verified number and rarity, not just the local number", () => {
  const row = {
    id: "15aa9ec6-771a-4b05-b15b-1922eca82bd6",
    name: "ミュウex",
    collector_number: "205",
    set_code: "SV2a",
    set_name: "ポケモンカード151",
    rarity_code: "SAR",
    variant_attributes: {
      verifiedCollectorNumber: "205/165",
      officialCollectorNumber: "205/165",
      verifiedSetCode: "SV2a",
      officialSetCode: "SV2a",
      verifiedRarity: "SAR",
      officialRarity: "SAR",
    },
    verified: true,
    usable_in_card_eye: true,
    license_status: "display_only_authorized_by_card_eye_owner",
    image_url: "https://example.com/card.jpg",
    source_url: "https://example.com/card",
    metadata: {
      verifiedIdentity: { name: "ミュウex", collectorNumber: "205/165", setCode: "SV2a", rarity: "SAR" },
    },
  };
  assert.equal(verifiedIdentityMatches(row), true);
  assert.equal(verifiedIdentityMatches({
    ...row, metadata: { verifiedIdentity: { ...row.metadata.verifiedIdentity, collectorNumber: "205/999" } },
  }), false);
  assert.equal(verifiedIdentityMatches({
    ...row, metadata: { verifiedIdentity: { ...row.metadata.verifiedIdentity, rarity: "RR" } },
  }), false);
  assert.equal(verifiedIdentityMatches({
    ...row, variant_attributes: { ...row.variant_attributes, verifiedCollectorNumber: "205/999" },
  }), false);
});

test("unrecognized or missing image license status is never an approval", () => {
  const image = { verified: true, usableInCardEye: true, licenseStatus: "display_only_authorized_by_card_eye_owner" };
  assert.equal(isApprovedPrimaryImage(image), true);
  assert.equal(isApprovedPrimaryImage({ ...image, licenseStatus: "unrecognized" }), false);
  assert.equal(isApprovedPrimaryImage({ ...image, licenseStatus: "" }), false);
  assert.equal(isApprovedPrimaryImage({ ...image, licenseStatus: "revoked" }), false);
});