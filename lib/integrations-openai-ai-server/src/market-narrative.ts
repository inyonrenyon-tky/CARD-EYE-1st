import { openai } from "./client";

type VerifiedContext = {
  confidence: "high" | "medium" | "low";
  trend: "rising" | "falling" | "stable" | "insufficient";
  volatility: "large" | "limited" | "unknown";
  conditionAvailable: boolean;
};

// The model receives no raw prices or market news. It only supplies an optional
// short caution; every number and the factual summary are built by the server.
export async function generateMarketCaution(context: VerifiedContext): Promise<string | null> {
  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 350,
    messages: [
      {
        role: "system",
        content: "確認済みの指標について日本語で1文の短い注意点だけを書いてください。数値、金額、割合、サイト名、ニュース、未来予測、売買指示、総合スコア、真贋・鑑定は書かないでください。情報不足は不足と明記し、架空の情報を付け足さないでください。返答は指定JSONのみ。",
      },
      {
        role: "user",
        content: JSON.stringify(context),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "market_caution",
        strict: true,
        schema: {
          type: "object",
          properties: { caution: { type: "string" } },
          required: ["caution"],
          additionalProperties: false,
        },
      },
    },
  } as never, { timeout: 10_000, maxRetries: 0 });
  const content = response.choices[0]?.message?.content;
  if (!content) return null;
  const caution = (JSON.parse(content) as { caution?: unknown }).caution;
  if (typeof caution !== "string" || !caution.trim() || caution.length > 130 ||
      /[0-9０-９¥￥%％]|今すぐ|絶対|必ず|売るべき|売却推奨|購入推奨|値上がり|高騰|真贋|本物|偽物|PSA|BGS|CGC|ARS/i.test(caution)) return null;
  return caution.trim();
}