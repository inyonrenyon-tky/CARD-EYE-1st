import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmedFeaturedPrice, isCanonicalCatalogUuid, verifiedIdentityMatches } from "./cards";
import { isApprovedPrimaryImage } from "./card-image-provider";

test("catalog card IDs must use the canonical UUID shape", () => {
  assert.equal(isCanonicalCatalogUuid("11e80102-1234-4543-8901-efb012345678"), true);
  assert.equal(isCanonicalCatalogUuid("201/SV2a"), false);
  assert.equal(isCanonicalCatalogUuid("11e80102-1234-4543-8901"), false);
});

test("featured price requires at least three confirmed sales, never a listing", () => {
  assert.deepEqual(confirmedFeaturedPrice({
    marketPrice: 1200,
    marketPriceBasis: "confirmed_ungraded_sales",
    transactionCount: 2,
  }), { marketPrice: null, marketPriceBasis: null, transactionCount: 2 });
  assert.deepEqual(confirmedFeaturedPrice({
    marketPrice: 1200,
    marketPriceBasis: "shop_listing_reference",
    transactionCount: 5,
  }), { marketPrice: null, marketPriceBasis: null, transactionCount: 5 });
  assert.deepEqual(confirmedFeaturedPrice({
    marketPrice: 1200,
    marketPriceBasis: "confirmed_ungraded_sales",
    transactionCount: 3,
  }), {
    marketPrice: 1200,
    marketPriceBasis: "confirmed_ungraded_sales",
    transactionCount: 3,
  });
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