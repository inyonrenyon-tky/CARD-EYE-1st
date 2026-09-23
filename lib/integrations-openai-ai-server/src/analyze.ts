import { openai } from "./client";

export type CardAnalysis = {
  identified: boolean;
  cardName: string | null;
  series: string | null;
  cardNumber: string | null;
  rarity: string | null;
  conditionSummary: string | null;
  observations: {
    centering: string | null;
    corners: string | null;
    edges: string | null;
    surface: string | null;
    dirt: string | null;
    other: string | null;
  };
};

export async function analyzeCardPhoto(
  imageBase64: string,
  mimeType: "image/jpeg" | "image/png",
): Promise<unknown> {
  const response = await openai.chat.completions.create({
    model: "gpt-5.6-terra",
    max_completion_tokens: 2048,
    messages: [
      {
        role: "system",
        content:
          "Analyze this photo as a CARD EYE Japanese Pokemon card specialist. Return only JSON matching the requested schema. Identify the card only when readable. Never guess: use null for every unreadable field. Assess visible physical condition, not a guaranteed grade or price. For conditionSummary, summarize whether the visible condition may be consistent with NM (Near Mint / NM相当の可能性), needs confirmation, or cannot be judged; never present it as a professional grade. All observation fields must be null when not visible.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Identify the Japanese Pokemon card and describe its visible condition, including whether the photo may be consistent with NM (Near Mint / NM相当の可能性).",
          },
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${imageBase64}` },
          },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "card_analysis",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: [
            "identified",
            "cardName",
            "series",
            "cardNumber",
            "rarity",
            "conditionSummary",
            "observations",
          ],
          properties: {
            identified: { type: "boolean" },
            cardName: { type: ["string", "null"] },
            series: { type: ["string", "null"] },
            cardNumber: { type: ["string", "null"] },
            rarity: { type: ["string", "null"] },
            conditionSummary: { type: ["string", "null"] },
            observations: {
              type: "object",
              additionalProperties: false,
              required: ["centering", "corners", "edges", "surface", "dirt", "other"],
              properties: {
                centering: { type: ["string", "null"] },
                corners: { type: ["string", "null"] },
                edges: { type: ["string", "null"] },
                surface: { type: ["string", "null"] },
                dirt: { type: ["string", "null"] },
                other: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
  } as never);

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("The card analysis response was empty.");
  return JSON.parse(content) as unknown;
}