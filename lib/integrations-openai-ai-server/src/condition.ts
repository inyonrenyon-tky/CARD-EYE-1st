import { openai } from "./client";
import { computeConditionRank } from "./condition-rank";

export type ConditionImage = {
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png";
  view: "front" | "back" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
};

export type ConditionJudgement = {
  status: "good" | "minor" | "moderate" | "significant" | "uncertain" | "not_assessable";
  confidence: number;
  note: string;
  count: "none" | "one" | "few" | "many" | "unknown";
};

export type ConditionFinding =
  | "surface" | "corners" | "edges" | "whitening" | "centering" | "scratches"
  | "dents" | "creases" | "peeling" | "water_damage";

export type ConditionAnalysis = {
  [key in ConditionFinding]: ConditionJudgement;
} & {
  overall_rank: "S" | "A" | "A-" | "B" | "C" | "D" | "unassessable";
  rank_confidence: number;
  rank_reason: string;
  overallConfidence: number;
  imageQuality: "acceptable" | "limited" | "unusable";
  retakeRecommended: boolean;
  qualityChecks: {
    wholeCardVisible: boolean;
    focusSufficient: boolean;
    strongGlare: boolean;
    cropped: boolean;
    conditionAssessable: boolean;
  };
  limitations: string[];
};

const judgementSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status", "confidence", "note", "count"],
  properties: {
    status: {
      type: "string",
      enum: ["good", "minor", "moderate", "significant", "uncertain", "not_assessable"],
    },
    confidence: { type: "number" },
    note: { type: "string" },
    count: { type: "string", enum: ["none", "one", "few", "many", "unknown"] },
  },
} as const;

const conditionSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "surface",
    "corners",
    "edges",
    "whitening",
    "centering",
    "scratches",
    "dents",
    "creases",
    "peeling",
    "water_damage",
    "overall_rank",
    "rank_confidence",
    "rank_reason",
    "overallConfidence",
    "imageQuality",
    "retakeRecommended",
    "qualityChecks",
    "limitations",
  ],
  properties: {
    surface: judgementSchema,
    corners: judgementSchema,
    edges: judgementSchema,
    whitening: judgementSchema,
    centering: judgementSchema,
    scratches: judgementSchema,
    dents: judgementSchema,
    creases: judgementSchema,
    peeling: judgementSchema,
    water_damage: judgementSchema,
    overall_rank: { type: "string", enum: ["S", "A", "A-", "B", "C", "D", "unassessable"] },
    rank_confidence: { type: "number" },
    rank_reason: { type: "string" },
    overallConfidence: { type: "number" },
    imageQuality: { type: "string", enum: ["acceptable", "limited", "unusable"] },
    retakeRecommended: { type: "boolean" },
    qualityChecks: {
      type: "object",
      additionalProperties: false,
      required: [
        "wholeCardVisible",
        "focusSufficient",
        "strongGlare",
        "cropped",
        "conditionAssessable",
      ],
      properties: {
        wholeCardVisible: { type: "boolean" },
        focusSufficient: { type: "boolean" },
        strongGlare: { type: "boolean" },
        cropped: { type: "boolean" },
        conditionAssessable: { type: "boolean" },
      },
    },
    limitations: { type: "array", items: { type: "string" } },
  },
} as const;

const findings = [
  "surface",
  "corners",
  "edges",
  "whitening",
  "centering",
  "scratches",
  "dents",
  "creases",
  "peeling",
  "water_damage",
] as const satisfies readonly (keyof ConditionAnalysis)[];

const prohibitedClaim = /(?:\b(?:PSA|BGS|CGC|ARS)\b|本物|偽物|正規品|偽造品|鑑定|グレーディング|真贋|(?:予想)?グレード|grade\s*(?:mapping|equivalent|相当))/i;

export function guardConditionAnalysis(
  result: ConditionAnalysis,
  views: readonly ConditionImage["view"][] = [],
): ConditionAnalysis {
  result = {
    ...result,
    limitations: result.limitations.map((text) =>
      prohibitedClaim.test(text) ? "画像で確認できない内容は判断できません。" : text),
    ...Object.fromEntries(findings.map((key) => [key, prohibitedClaim.test(result[key].note)
      ? {
          ...result[key],
          status: "uncertain",
          confidence: Math.min(result[key].confidence, 0.25),
          count: "unknown",
          note: "画像で確認できない内容は判断できません。",
        }
      : result[key].status === "good" && result[key].count === "unknown"
        ? {
            ...result[key],
            status: "uncertain",
            note: "画像から欠陥数を確認できないため、状態は判断できません。",
          }
        : result[key]])),
  } as ConditionAnalysis;

  const { qualityChecks } = result;
  const unusable =
    result.imageQuality === "unusable" ||
    !qualityChecks.conditionAssessable ||
    !qualityChecks.focusSufficient;
  if (unusable) {
    const unassessable = {
      ...result,
      imageQuality: "unusable",
      overallConfidence: Math.min(result.overallConfidence, 0.25),
      retakeRecommended: true,
      limitations: Array.from(
        new Set([
          ...result.limitations,
          "画像品質が不十分なため、カード状態は正確に判定できません。再撮影してください。",
        ]),
      ),
      ...Object.fromEntries(findings.map((key) => [
        key,
        {
          ...result[key],
          status: "not_assessable",
          confidence: Math.min(result[key].confidence, 0.25),
          count: "unknown",
          note: "画像品質のため、この項目は確認できません。カード全体にピントを合わせて再撮影してください。",
        },
      ])),
    } as ConditionAnalysis;
    const rank = computeConditionRank(unassessable, views);
    return {
      ...unassessable,
      overall_rank: rank.rank,
      rank_confidence: rank.confidence,
      rank_reason: rank.reason,
    };
  }

  const mustRetake =
    result.imageQuality === "unusable" ||
    !qualityChecks.wholeCardVisible ||
    !qualityChecks.focusSufficient ||
    qualityChecks.strongGlare ||
    qualityChecks.cropped;
  const maskedFindings = findings.reduce<Partial<ConditionAnalysis>>((guarded, key) => {
    const blockedByCrop = (qualityChecks.cropped || !qualityChecks.wholeCardVisible) &&
      ["corners", "edges", "whitening", "centering"].includes(key);
    const blockedByGlare = qualityChecks.strongGlare && ["surface", "scratches"].includes(key);
    if (blockedByCrop || blockedByGlare) {
      guarded[key] = {
        ...result[key],
        status: "not_assessable",
        confidence: Math.min(result[key].confidence, 0.35),
        count: "unknown",
        note: blockedByGlare
          ? "光の反射で詳細を確認できないため、状態は判断できません。"
          : "カードの一部が切れているため、状態は判断できません。",
      };
    }
    return guarded;
  }, {});

  const guarded = {
    ...result,
    ...maskedFindings,
    retakeRecommended: result.retakeRecommended || mustRetake,
  } as ConditionAnalysis;
  const rank = computeConditionRank(guarded, views);
  return {
    ...guarded,
    retakeRecommended: guarded.retakeRecommended || rank.rank === "unassessable",
    overall_rank: rank.rank,
    rank_confidence: rank.confidence,
    rank_reason: prohibitedClaim.test(rank.reason)
      ? "画像で確認できた範囲に限る状態判定です。見えない部分は判断できません。"
      : rank.reason,
    limitations: guarded.limitations.map((text) =>
      prohibitedClaim.test(text) ? "画像で確認できない内容は判断できません。" : text),
  };
}

export async function analyzeCardCondition(images: ConditionImage[]): Promise<unknown> {
  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 8192,
    messages: [
      {
        role: "system",
        content:
          "あなたはカード写真で実際に見える状態だけを観察します。JSON Schemaに厳密に従い日本語で短く回答してください。10項目(surface,corners,edges,whitening,centering,scratches,dents,creases,peeling,water_damage)をすべて個別に確認してから、仮のCARD EYE overall_rankを提案してください。各項目にstatus、画像上で確認できた欠陥数count(none/one/few/many/unknown)、観察確信度confidence、短い根拠noteを入れます。見えない項目・裏面の未撮影・反射・ぼけのある部分をgoodやcount:noneにせずuncertain/not_assessableとcount:unknownにしてください。全画像の実際の品質を評価し、カード全体、ピント、強い反射、切れ、状態の判定可能性を明示してください。カードの傾き・撮影遠近による見かけの歪みと実際の印刷センタリングずれを区別し、遠近だけで悪いcenteringと判断しないでください。CARD EYEのrankは画像上の所見だけに基づく独自の目安で、専門鑑定との対応づけ・鑑定会社名や真贋の言及は禁止です。rank_reasonは簡潔な日本語で、根拠と見えない部分・撮影し直しの必要があれば記してください。写真不良ならunassessableを選びretakeRecommendedをtrueにします。",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "全画像を観察し、10項目すべてを評価してから暫定ランクを提案してください。各画像のラベルは撮影位置です。画像品質を先に確認し、観察できない項目はuncertainまたはnot_assessable、count unknownとします。カードの傾き/遠近と印刷センタリングを混同せず、薄い印刷模様や反射を傷・白かけと断定しないでください。",
          },
          {
            type: "text",
            text:
              "センタリングは正面に近くカード外周と印刷枠の両方が見えるときだけ、左右・上下の偏りを推定してnoteに根拠を書いてください。傾きや遠近歪みがある場合はconfidenceを下げ、実際の印刷位置を確認できなければuncertainとしてください。比率を測定できない写真から数値を作らないでください。",
          },
          ...images.flatMap((image) => [
            {
              type: "text" as const,
              text: `撮影位置: ${image.view}`,
            },
            {
              type: "image_url" as const,
              image_url: { url: `data:${image.mimeType};base64,${image.imageBase64}`, detail: "high" as const },
            },
          ]),
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "card_condition_analysis",
        strict: true,
        schema: conditionSchema,
      },
    },
  } as never);

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("The card condition analysis response was empty.");
  return JSON.parse(content) as unknown;
}