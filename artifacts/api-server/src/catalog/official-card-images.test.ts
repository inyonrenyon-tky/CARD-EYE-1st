import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseOfficialCardDetail,
  selectExactOfficialCard,
  type OfficialCardDetail,
  type RepresentativeImageInput,
} from "./official-card-images";
import { matchCandidates } from "./matching";
import { isApprovedPrimaryImage } from "./card-image-provider";

function detailHtml({
  name,
  setCode,
  number,
  rarityIcon,
}: {
  name: string;
  setCode: string;
  number: string;
  rarityIcon: string;
}) {
  const [local, total] = number.split("/");
  return `
    <h1 class="Heading1 mt20">${name}</h1>
    <div class="Box">
      <img class="fit" src="/assets/images/card_images/large/${setCode}/sample.jpg" alt="${name}" />
      <div class="subtext Text-fjalla">
        <img src="/assets/images/card/regulation_logo_1/${setCode}.gif" class="img-regulation" alt="${setCode}" />
        &nbsp;${local}&nbsp;/&nbsp;${total}&nbsp;
        <img src="/assets/images/card/rarity/ic_rare_${rarityIcon}.gif" width="24" />
      </div>
    </div>
    <li class="List_item"><a href="/ex/${setCode.toLowerCase()}/">拡張パック「テスト」</a></li>`;
}

function parsedDetail(
  officialId: string,
  name: string,
  setCode: string,
  number: string,
  rarityIcon: string,
): OfficialCardDetail {
  const value = parseOfficialCardDetail(
    detailHtml({ name, setCode, number, rarityIcon }),
    officialId,
  );
  assert.ok(value);
  return value;
}

test("official detail parser verifies name, full collector number, set, rarity and same-origin artwork", () => {
  const ar = parsedDetail("48430", "ハガネール", "M1L", "073/063", "ar");
  assert.equal(ar.collectorNumber, "073/063");
  assert.equal(ar.rarity, "AR");
  assert.equal(ar.setCode, "M1L");
  assert.equal(ar.imageUrl, "https://www.pokemon-card.com/assets/images/card_images/large/M1L/sample.jpg");
  assert.equal(ar.sourceUrl, "https://www.pokemon-card.com/card-search/details.php/card/48430/regu/all");
  assert.equal(parseOfficialCardDetail(
    detailHtml({ name: "ハガネール", setCode: "M1L", number: "073/063", rarityIcon: "ar" })
      .replace("/assets/images/card_images/large/M1L/", "https://untrusted.example/"),
    "48430",
  ), null);
});

test("AR, SAR and RR resolve only when exact set, full number and rarity all agree", () => {
  const cases: Array<{
    input: RepresentativeImageInput;
    card: OfficialCardDetail;
  }> = [
    {
      input: { cardName: "ハガネール", cardNumber: "073/063", series: "M1L", rarity: "AR" },
      card: parsedDetail("48430", "ハガネール", "M1L", "073/063", "ar"),
    },
    {
      input: { cardName: "リザードンex", cardNumber: "201/165", series: "SV2a", rarity: "SAR" },
      card: parsedDetail("43986", "リザードンex", "SV2a", "201/165", "sar"),
    },
    {
      input: { cardName: "ミュウex", cardNumber: "151/165", series: "SV2a", rarity: "RR" },
      card: parsedDetail("43472", "ミュウex", "SV2a", "151/165", "rr"),
    },
  ];

  for (const { input, card } of cases) {
    assert.deepEqual(selectExactOfficialCard(input, [card], true), { status: "matched", candidate: card });
  }
  const sar = cases[1];
  assert.equal(
    selectExactOfficialCard({ ...sar.input, cardNumber: "SV2a 201/165" }, [sar.card], true).status,
    "matched",
  );
});

test("same-name cards with a different number, set, or rarity are never selected", () => {
  const card = parsedDetail("48430", "ハガネール", "M1L", "073/063", "ar");
  const input = { cardName: "ハガネール", cardNumber: "073/063", series: "M1L", rarity: "AR" };
  const ordinaryCard = parsedDetail("47778", "ハガネール", "M1L", "045/063", "r_c");
  assert.equal(ordinaryCard.rarity, "R_C");
  assert.equal(selectExactOfficialCard(input, [ordinaryCard, card], true).status, "matched");

  assert.equal(selectExactOfficialCard({ ...input, cardNumber: "045/063" }, [card], true).status, "unmatched");
  assert.equal(selectExactOfficialCard({ ...input, cardNumber: "073/064" }, [card], true).status, "unmatched");
  assert.equal(selectExactOfficialCard({ ...input, series: "M1", }, [card], true).status, "unmatched");
  assert.notEqual(selectExactOfficialCard({ ...input, rarity: "SAR" }, [card], true).status, "matched");
  assert.equal(
    selectExactOfficialCard(input, [card, { ...card, officialId: "47778", collectorNumber: "045/063" }], true).status,
    "matched",
  );
  assert.equal(selectExactOfficialCard(input, [card, card], true).status, "ambiguous");
  assert.equal(selectExactOfficialCard(input, [card], false).status, "ambiguous");
});

test("CARD EYE catalog matcher accepts RR as the Double rare card-master rarity", () => {
  const result = matchCandidates(
    { cardName: "ミュウex", cardNumber: "151/165", series: "SV2a", rarity: "RR" },
    [{
      id: "11111111-2222-4333-8444-555555555555",
      name: "ミュウex",
      collectorNumber: "151",
      setCode: "SV2a",
      setName: "ポケモンカード151",
      rarity: "Double rare",
      variantCode: "standard",
    }],
  );
  assert.equal(result.status, "exact");
});

test("a separately approved master primary is retained, while unreviewed TCGdex is not displayable", () => {
  assert.equal(isApprovedPrimaryImage({
    verified: true,
    usableInCardEye: true,
    licenseStatus: "display_only_authorized_by_provider",
  }), true);
  assert.equal(isApprovedPrimaryImage({
    verified: false,
    usableInCardEye: false,
    licenseStatus: "requires_review",
  }), false);
});