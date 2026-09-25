import type { ConditionAnalysis, ConditionFinding } from "./condition";

const findingKeys: readonly ConditionFinding[] = [
  "surface", "corners", "edges", "whitening", "centering", "scratches",
  "dents", "creases", "peeling", "water_damage",
];
const majorKeys: readonly ConditionFinding[] = [
  "corners", "edges", "whitening", "centering", "scratches",
  "dents", "creases", "peeling", "water_damage",
];
const defectKeys: readonly ConditionFinding[] = findingKeys.filter((key) => key !== "centering");
const labels: Record<ConditionFinding, string> = {
  surface: "表面", corners: "角", edges: "エッジ", whitening: "白かけ",
  centering: "センタリング", scratches: "傷", dents: "へこみ",
  creases: "折れ", peeling: "剥がれ", water_damage: "水濡れ",
};
const statusLabels = {
  minor: "軽微", moderate: "中程度", significant: "大きな",
} as const;

export type RankDecision = {
  rank: ConditionAnalysis["overall_rank"];
  confidence: number;
  reason: string;
};

function hasClearFinding(result: ConditionAnalysis, key: ConditionFinding, status: string[]) {
  const finding = result[key];
  return status.includes(finding.status) && finding.confidence >= 0.65 &&
    finding.count !== "none";
}

function minorDefects(result: ConditionAnalysis) {
  return findingKeys.filter((key) =>
    result[key].status === "minor" && result[key].confidence >= 0.6 &&
    result[key].count !== "unknown" && result[key].count !== "none");
}

function minorDefectCount(result: ConditionAnalysis) {
  return minorDefects(result).reduce((total, key) => total + ({
    none: 0, one: 1, few: 2, many: 4, unknown: 0,
  }[result[key].count]), 0);
}

function reasonFor(
  result: ConditionAnalysis,
  rank: ConditionAnalysis["overall_rank"],
  views: readonly string[],
): string {
  if (rank === "unassessable") {
    const missingMajorView = !views.includes("front") || !views.includes("back");
    return missingMajorView
      ? "写真の品質または表裏の確認が不足しており、状態を確定できません。表裏を明るく鮮明に撮り直してください。"
      : "写真の品質または未確認項目が多く、状態を確定できません。反射を避けてカード全体を撮り直してください。";
  }
  const evidence = findingKeys.flatMap((key) => {
    const finding = result[key];
    if (
      (finding.status !== "minor" && finding.status !== "moderate" && finding.status !== "significant") ||
      finding.confidence < 0.65 ||
      finding.count === "none"
    ) return [];
    const count = {
      one: "1件", few: "数件", many: "多数",
      unknown: "件数不明",
    }[finding.count];
    return [`${labels[key]}の${statusLabels[finding.status]}所見（${count}）`];
  });
  const explanation = evidence.length
    ? evidence.join("、")
    : "確認可能な項目に明確な欠陥所見なし";
  const rankName: Record<Exclude<ConditionAnalysis["overall_rank"], "unassessable">, string> = {
    S: "S", A: "A", "A-": "A-", B: "B", C: "C", D: "D",
  };
  const limitations: string[] = [];
  if (!views.includes("front") || !views.includes("back")) {
    limitations.push("表裏のいずれかが未撮影");
  }
  const unclear = findingKeys.filter((key) =>
    result[key].status === "uncertain" || result[key].status === "not_assessable");
  if (unclear.length) limitations.push(`確認できない項目：${unclear.map((key) => labels[key]).join("・")}`);
  if (result.imageQuality !== "acceptable" || result.retakeRecommended || result.qualityChecks.strongGlare ||
    result.qualityChecks.cropped || !result.qualityChecks.wholeCardVisible) {
    limitations.push("反射や写り込みのため撮り直しを推奨");
  }
  const limitationText = limitations.length
    ? ` 写真上の制約：${limitations.join("、")}。`
    : "";
  return `ランク${rankName[rank]}：${explanation}を根拠とした画像上の判定です。${limitationText}`;
}

export function computeConditionRank(
  result: ConditionAnalysis,
  views: readonly string[],
): RankDecision {
  const unavailableMajorCount = majorKeys.filter((key) =>
    result[key].status === "uncertain" || result[key].status === "not_assessable").length;
  const badPhoto = result.imageQuality === "unusable" ||
    !result.qualityChecks.conditionAssessable || !result.qualityChecks.focusSufficient;
  const incompleteFraming = !result.qualityChecks.wholeCardVisible || result.qualityChecks.cropped;

  let rank: ConditionAnalysis["overall_rank"] = "unassessable";
  if (!badPhoto) {
    const catastrophic =
      hasClearFinding(result, "water_damage", ["minor", "moderate", "significant"]) ||
      hasClearFinding(result, "creases", ["significant"]) ||
      hasClearFinding(result, "peeling", ["significant"]) ||
      hasClearFinding(result, "dents", ["significant"]);
    const moderateOrWorseAxes = defectKeys.filter((key) =>
      hasClearFinding(result, key, ["moderate", "significant"]));
    const observedDamageAxes = defectKeys.filter((key) =>
      hasClearFinding(result, key, ["minor", "moderate", "significant"]) &&
      result[key].count !== "unknown" && result[key].count !== "none");
    const substantial =
      hasClearFinding(result, "whitening", ["significant"]) ||
      hasClearFinding(result, "peeling", ["minor", "moderate", "significant"]) ||
      hasClearFinding(result, "creases", ["minor", "moderate", "significant"]) ||
      moderateOrWorseAxes.length >= 2 ||
      (moderateOrWorseAxes.length >= 1 && observedDamageAxes.length >= 2);
    const manyScratches = result.scratches.status === "minor" &&
      result.scratches.count === "many" && result.scratches.confidence >= 0.65;
    const centeringIssue = hasClearFinding(result, "centering", ["moderate", "significant"]);
    const clearDent = hasClearFinding(result, "dents", ["minor", "moderate", "significant"]) &&
      result.dents.count !== "unknown";
    const minor = minorDefects(result);
    const minorCount = minorDefectCount(result);
    const slightCentering = result.centering.status === "minor" &&
      result.centering.confidence >= 0.6 && result.centering.count !== "unknown" &&
      result.centering.count !== "none";
    const onlyOneTinyDefect = minorCount === 1 &&
      findingKeys.filter((key) => result[key].status !== "good").length === 1 &&
      minor[0] !== "centering" && result[minor[0]!].count === "one";
    const allPristine = findingKeys.every((key) =>
      result[key].status === "good" && result[key].count === "none" &&
      result[key].confidence >= 0.8);
    const frontAndBack = [...views].some((view) => view === "front") &&
      [...views].some((view) => view === "back");
    const highQuality = result.imageQuality === "acceptable" &&
      !result.qualityChecks.strongGlare && result.overallConfidence >= 0.8;
    const strictS = result.overallConfidence >= 0.9 &&
      findingKeys.every((key) => result[key].confidence >= 0.9);

    if (catastrophic) rank = "D";
    else if (incompleteFraming || unavailableMajorCount >= 4) rank = "unassessable";
    else if (substantial) rank = "C";
    else if (manyScratches || centeringIssue || clearDent) rank = "B";
    else if (minorCount >= 2 || slightCentering) rank = "A-";
    else if (onlyOneTinyDefect) rank = "A";
    else if (defectKeys.some((key) =>
      hasClearFinding(result, key, ["moderate"]))) rank = "B";
    else if (findingKeys.some((key) =>
      hasClearFinding(result, key, ["significant"]))) rank = "C";
    else if (allPristine && highQuality && frontAndBack && strictS &&
      majorKeys.every((key) => result[key].confidence >= 0.9)) rank = "S";
    else if (allPristine && highQuality) rank = "A";
    else if (allPristine && result.overallConfidence >= 0.65) rank = "A-";
  }

  const confidence = rank === "unassessable"
    ? Math.min(result.overallConfidence, 0.25)
    : Math.min(result.overallConfidence, ...findingKeys.map((key) => result[key].confidence),
      rank === "S" ? 0.95 : 0.9);
  return { rank, confidence, reason: reasonFor(result, rank, views) };
}