import assert from "node:assert/strict";
import { test } from "node:test";
import { cardHasChanged } from "./db";
import { matchCandidates, type MatchCandidate } from "./matching";
import { TcgdexProvider } from "./tcgdex";
import type { CatalogSet } from "./provider";

const set: CatalogSet = { sourceId: "SV2a", code: "SV2a", name: "ポケモンカード151", series: null, releaseDate: null, officialCount: 165 };
const source = new TcgdexProvider(0);
const card = source.normalizeCard({ id: "SV2a-201", name: "リザードンex", localId: "201", rarity: "Special illustration rare", variants: { holo: true } }, set);
const candidate: MatchCandidate = {
  id: "11e80102-1234-4543-8901-efb012345678", name: card.name,
  collectorNumber: card.collectorNumber, setCode: set.code, setName: set.name,
  rarity: card.rarity, variantCode: "standard",
};
const input = { cardName: "リザードンex", cardNumber: "201/165", series: "SV2a", rarity: "SAR" };

test("normalization preserves Japanese names, promos, rarity and variant metadata", () => {
  assert.equal(card.name, "リザードンex");
  assert.equal(card.variantAttributes.holo, true);
  assert.equal(source.getSourceMetadata().imageRights, "requires_review");
  assert.throws(() => source.normalizeCard({ id: "incomplete", name: "ピカチュウ" }, set), /Incomplete/);
  assert.equal(source.normalizeCard({ id: "SV-P-001", name: "ピカチュウ", localId: "001" }, { ...set, code: "SV-P" }).collectorNumber, "001");
});

test("first import, repeat, update and variant changes are distinguishable", () => {
  assert.equal(cardHasChanged(undefined, card, "set-1"), true);
  const existing = { id: "card-1", set_id: "set-1", name: card.name, collector_number: card.collectorNumber, rarity_code: card.rarity, variant_attributes: { detailed: [], holo: true } };
  assert.equal(cardHasChanged(existing, card, "set-1"), false);
  assert.equal(cardHasChanged(existing, { ...card, rarity: "Rare" }, "set-1"), true);
  assert.equal(cardHasChanged(existing, { ...card, variantAttributes: { holo: false } }, "set-1"), true);
});

test("DB matching requires set, number and name, including approximate Japanese name", () => {
  assert.equal(matchCandidates(input, [candidate]).matchedCardId, candidate.id);
  assert.equal(matchCandidates({ ...input, cardName: "リザードンe" }, [candidate]).status, "high");
  assert.equal(matchCandidates({ ...input, series: null }, [candidate]).matchedCardId, null);
  assert.equal(matchCandidates({ ...input, cardNumber: null }, [candidate]).matchedCardId, null);
  assert.equal(matchCandidates({ ...input, series: "SV-P" }, [candidate]).status, "unmatched");
  assert.equal(matchCandidates({ ...input, cardName: "別のカード" }, [candidate]).status, "unmatched");
  assert.equal(matchCandidates(input, []).status, "unmatched");
});

test("same number, variant and uncertain rarity never result in a definitive ID", () => {
  const mirror = { ...candidate, id: "22e80102-1234-4543-8901-efb012345678", variantCode: "mirror" };
  assert.equal(matchCandidates(input, [candidate, mirror]).status, "ambiguous");
  assert.equal(matchCandidates(input, [candidate, mirror]).matchedCardId, null);
  assert.equal(matchCandidates(input, [{ ...candidate, rarity: null }]).status, "ambiguous");
  assert.equal(matchCandidates({ ...input, rarity: "AR" }, [candidate]).status, "ambiguous");
});

test("provider retries 429 then fails explicitly on repeated 503", async () => {
  const original = globalThis.fetch;
  try {
    let attempts = 0;
    globalThis.fetch = async () => ++attempts === 1
      ? new Response("", { status: 429, headers: { "retry-after": "0.001" } })
      : Response.json([{ id: "SV2a", name: "ポケモンカード151" }]);
    assert.equal((await source.fetchSets()).length, 1);
    assert.equal(attempts, 2);
    globalThis.fetch = async () => new Response("", { status: 503 });
    await assert.rejects(source.fetchSets(), /temporarily unavailable/);
  } finally {
    globalThis.fetch = original;
  }
});