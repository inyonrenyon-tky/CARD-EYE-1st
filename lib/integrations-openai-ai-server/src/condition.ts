import { openai } from "./client";

export type ConditionImage = {
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png";
  view: "front" | "back" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
};

export type ConditionJudgement = {
  status: "good" | "minor" | "moderate" | "significant" | "uncertain" | "not_assessable";
  confidence: number;
  note: string;
};

export type ConditionAnalysis = {
  surface: ConditionJudgement;
  corners: ConditionJudgement;
  edges: ConditionJudgement;
  whitening: ConditionJudgement;
  centering: ConditionJudgement;
  scratches: ConditionJudgement;
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
  required: ["status", "confidence", "note"],
  properties: {
    status: {
      type: "string",
      enum: ["good", "minor", "moderate", "significant", "uncertain", "not_assessable"],
    },
    confidence: { type: "number" },
    note: { type: "string" },
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
] as const satisfies readonly (keyof ConditionAnalysis)[];

const prohibitedClaim = /(?:PSA|BGS|CGC|ARS)|(?:本物|偽物|正規品|偽造品)\s*(?:です|だと|である|と判断|と判定|と断定|の可能性)|(?:予想グレード|鑑定結果)\s*[:：は]?\s*[0-9０-９]/i;

export function guardConditionAnalysis(result: ConditionAnalysis): ConditionAnalysis {
  result = {
    ...result,
    limitations: result.limitations.map((text) =>
      prohibitedClaim.test(text) ? "鑑定グレードや真贋は画像から判断できません。" : text),
    ...Object.fromEntries(findings.map((key) => [key, prohibitedClaim.test(result[key].note)
      ? {
          status: "uncertain",
          confidence: Math.min(result[key].confidence, 0.25),
          note: "この画像からこの項目は確実に判断できません。",
        }
      : result[key]])),
  } as ConditionAnalysis;

  const { qualityChecks } = result;
  const unusable =
    result.imageQuality === "unusable" ||
    !qualityChecks.conditionAssessable ||
    !qualityChecks.focusSufficient;
  if (unusable) {
    return {
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
      ...Object.fromEntries(
        findings.map((key) => [
          key,
          {
            status: "not_assessable",
            confidence: Math.min(result[key].confidence, 0.25),
            note: "画像品質のため、この項目は正確に確認できません。カード全体にピントを合わせて再撮影してください。",
          },
        ]),
      ),
    } as ConditionAnalysis;
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
    if (
      result[key].status === "good" &&
      (blockedByCrop || blockedByGlare)
    ) {
      guarded[key] = {
        ...result[key],
        status: "uncertain",
        confidence: Math.min(result[key].confidence, 0.35),
        note: blockedByGlare
          ? "光の反射で詳細を確認できないため、状態は判断できません。"
          : "カードの一部が切れているため、状態は判断できません。",
      };
    }
    return guarded;
  }, {});

  return {
    ...result,
    ...maskedFindings,
    retakeRecommended: result.retakeRecommended || mustRetake,
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
          "あなたはポケモンカードの写真から見える状態だけを観察します。JSON Schemaに厳密に従い、日本語で短く回答してください。PSA・BGS・CGCその他の鑑定グレード、予想グレード、真贋、本物・偽物を断定してはいけません。画像上で確認できない欠陥を推測せず、見えない部分や反射・ぼけのある部分を絶対にgoodにしないでください。confidenceはカードの品質点ではなく、その画像でその観察ができる確信度です。カード全体、ピント、強い反射、切れ、状態の判定可能性を先に評価してください。カードでない画像、強いぼけ、カードの大きな欠落などで状態を評価できない場合はimageQualityをunusable、conditionAssessableをfalseにし、全項目をnot_assessableまたはuncertain、overallConfidenceを低く、retakeRecommendedをtrueにしてください。表面の微細な傷は単一画像では見えないことが多いため、証拠のない「傷なし」は禁止です。limitationsに単一画像では確認できない内容を記してください。",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "各画像を観察してカードの状態を評価してください。各画像の表示ラベルは撮影位置を示します。まず画像の品質を確認し、観察できない項目はuncertainまたはnot_assessableとしてください。薄い印刷模様や反射を傷・白かけと断定しないでください。",
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