import assert from "node:assert/strict";
import { test } from "node:test";
import { guardConditionAnalysis, type ConditionAnalysis, type ConditionFinding } from "./condition";

const keys: readonly ConditionFinding[] = [
  "surface", "corners", "edges", "whitening", "centering", "scratches",
  "dents", "creases", "peeling", "water_damage",
];

function analysis(): ConditionAnalysis {
  const good = { status: "good" as const, confidence: 0.92, note: "確認できる範囲で良好", count: "none" as const };
  return {
    ...Object.fromEntries(keys.map((key) => [key, { ...good }])) as Pick<ConditionAnalysis, ConditionFinding>,
    overall_rank: "D",
    rank_confidence: 0.1,
    rank_reason: "モデルが返すランク理由",
    overallConfidence: 0.92,
    imageQuality: "acceptable",
    retakeRecommended: false,
    qualityChecks: {
      wholeCardVisible: true, focusSufficient: true, strongGlare: false,
      cropped: false, conditionAssessable: true,
    },
    limitations: [],
  };
}

function rank(input = analysis(), views: ("front" | "back" | "top-left" | "top-right" | "bottom-left" | "bottom-right")[] = ["front", "back"]) {
  return guardConditionAnalysis(input, views);
}

function setFinding(
  input: ConditionAnalysis,
  key: ConditionFinding,
  status: "good" | "minor" | "moderate" | "significant",
  count: "none" | "one" | "few" | "many",
) {
  input[key] = { status, count, confidence: 0.9, note: "画像で確認した所見" };
}

test("clean high-quality front and back can reach S, while front-only cannot", () => {
  assert.equal(rank().overall_rank, "S");
  assert.equal(rank(analysis(), ["front"]).overall_rank, "A");
});

test("one tiny defect is A and several tiny white marks are A-", () => {
  const one = analysis();
  setFinding(one, "whitening", "minor", "one");
  assert.equal(rank(one).overall_rank, "A");
  const several = analysis();
  setFinding(several, "whitening", "minor", "few");
  assert.equal(rank(several).overall_rank, "A-");
  const limited = analysis();
  limited.imageQuality = "limited";
  assert.equal(rank(limited).overall_rank, "A-");
});

test("glare masks surface and scratch observations and requires a retake", () => {
  const input = analysis();
  input.qualityChecks.strongGlare = true;
  const result = rank(input);
  assert.equal(result.surface.status, "not_assessable");
  assert.equal(result.surface.count, "unknown");
  assert.ok(result.surface.confidence <= 0.35);
  assert.equal(result.scratches.status, "not_assessable");
  assert.ok(result.scratches.confidence <= 0.35);
  assert.equal(result.retakeRecommended, true);
  assert.notEqual(result.overall_rank, "S");
});

test("isolated moderate findings rank B and severe non-structural damage ranks C", () => {
  for (const key of ["scratches", "surface", "edges", "corners"] as const) {
    const input = analysis();
    setFinding(input, key, "moderate", "one");
    assert.equal(rank(input).overall_rank, "B", `moderate ${key}`);
  }
  for (const key of ["scratches", "surface", "edges", "corners"] as const) {
    const input = analysis();
    setFinding(input, key, "significant", "one");
    assert.equal(rank(input).overall_rank, "C", `significant ${key}`);
  }
});

test("minor centering yields A- and reasons identify rank and grounded evidence only", () => {
  const centering = analysis();
  setFinding(centering, "centering", "minor", "one");
  assert.equal(rank(centering).overall_rank, "A-");

  const evidence = analysis();
  setFinding(evidence, "surface", "moderate", "one");
  evidence.water_damage = {
    status: "uncertain", confidence: 0.2, count: "unknown", note: "水濡れは見えない",
  };
  evidence.creases = {
    status: "not_assessable", confidence: 0.1, count: "unknown", note: "確認不能",
  };
  const reason = rank(evidence).rank_reason;
  assert.match(reason, /ランクB/);
  assert.match(reason, /表面.*中程度/);
  assert.doesNotMatch(reason, /(?:水濡れ|折れ)の(?:軽微|中程度|大きな)?所見/);
});

test("many tiny scratches, centering, and a clear dent cap the rank at B", () => {
  const scratches = analysis();
  setFinding(scratches, "scratches", "minor", "many");
  assert.equal(rank(scratches).overall_rank, "B");
  const centering = analysis();
  setFinding(centering, "centering", "moderate", "one");
  assert.equal(rank(centering).overall_rank, "B");
  const dent = analysis();
  setFinding(dent, "dents", "minor", "one");
  assert.equal(rank(dent).overall_rank, "B");
});

test("large whitening with a dent is C; severe creases or water damage are D", () => {
  const whiteningAndDent = analysis();
  setFinding(whiteningAndDent, "whitening", "moderate", "few");
  setFinding(whiteningAndDent, "dents", "minor", "one");
  assert.equal(rank(whiteningAndDent).overall_rank, "C");
  const crease = analysis();
  setFinding(crease, "creases", "moderate", "one");
  assert.equal(rank(crease).overall_rank, "C");
  const peeling = analysis();
  setFinding(peeling, "peeling", "moderate", "one");
  assert.equal(rank(peeling).overall_rank, "C");
  const water = analysis();
  setFinding(water, "water_damage", "significant", "one");
  assert.equal(rank(water).overall_rank, "D");
  const severeCrease = analysis();
  setFinding(severeCrease, "creases", "significant", "one");
  assert.equal(rank(severeCrease).overall_rank, "D");
  for (const key of ["creases", "peeling"] as const) {
    const minor = analysis();
    setFinding(minor, key, "minor", "one");
    assert.equal(rank(minor).overall_rank, "C", `visible ${key} is not a tiny cosmetic defect`);
  }
  const clearWaterMark = analysis();
  setFinding(clearWaterMark, "water_damage", "minor", "one");
  assert.equal(rank(clearWaterMark).overall_rank, "D");
});

test("a clearly visible structural injury remains D even when other parts are not visible", () => {
  const input = analysis();
  setFinding(input, "creases", "significant", "one");
  input.qualityChecks.cropped = true;
  input.qualityChecks.wholeCardVisible = false;
  const result = rank(input);
  assert.equal(result.overall_rank, "D");
  assert.equal(result.corners.status, "not_assessable");
  assert.match(result.rank_reason, /折れ/);
  const cleanButCropped = analysis();
  cleanButCropped.qualityChecks.cropped = true;
  assert.equal(rank(cleanButCropped).overall_rank, "unassessable");
});

test("unusable or inadequately observable photos are unassessable", () => {
  const blurry = analysis();
  blurry.imageQuality = "unusable";
  const unusable = rank(blurry);
  assert.equal(unusable.overall_rank, "unassessable");
  for (const key of keys) {
    assert.equal(unusable[key].status, "not_assessable");
    assert.ok(unusable[key].confidence <= 0.25);
    assert.equal(unusable[key].count, "unknown");
  }
  const missing = analysis();
  for (const key of ["corners", "edges", "whitening", "dents"] as const) {
    missing[key] = { status: "not_assessable", confidence: 0.2, count: "unknown", note: "見えない" };
  }
  assert.equal(rank(missing).overall_rank, "unassessable");
});

test("crop masks affected findings with low confidence and unknown counts", () => {
  const input = analysis();
  input.qualityChecks.cropped = true;
  input.qualityChecks.wholeCardVisible = false;
  const result = rank(input);
  for (const key of ["corners", "edges", "whitening", "centering"] as const) {
    assert.equal(result[key].status, "not_assessable");
    assert.ok(result[key].confidence <= 0.35);
    assert.equal(result[key].count, "unknown");
  }
});

test("rank reasons never echo model grade mapping or authentication prose", () => {
  const input = analysis();
  input.rank_reason = "PSA 10相当で本物です";
  input.surface.note = "BGS鑑定と同等です";
  input.limitations = ["CGC相当のグレードに見えます"];
  const result = rank(input);
  const prose = [result.rank_reason, result.surface.note, ...result.limitations].join(" ");
  assert.doesNotMatch(prose, /PSA|BGS|CGC|ARS|本物|偽物|鑑定|グレード/i);
});

test("a prohibited finding note masks status, confidence, and count", () => {
  const input = analysis();
  setFinding(input, "whitening", "significant", "many");
  input.whitening.note = "PSA grading equivalent";
  const result = rank(input).whitening;
  assert.equal(result.status, "uncertain");
  assert.ok(result.confidence <= 0.25);
  assert.equal(result.count, "unknown");
  assert.doesNotMatch(result.note, /PSA|grading/i);
});