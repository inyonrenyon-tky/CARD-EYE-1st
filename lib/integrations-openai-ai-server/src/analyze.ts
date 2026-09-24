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
    model: "gpt-5-mini",
    max_completion_tokens: 8192,
    messages: [
      {
        role: "system",
        content:
          "Analyze this photo as a CARD EYE Japanese Pokemon card identification specialist. Return only JSON matching the requested schema. Identify the card only when readable; never guess and use null for unreadable fields. This request identifies the card only. Do not assess condition, price, grade or authenticity.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Identify the Japanese Pokemon card. Return its readable name, series, card number and rarity. Do not analyze physical condition.",
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
          ],
          properties: {
            identified: { type: "boolean" },
            cardName: { type: ["string", "null"] },
            series: { type: ["string", "null"] },
            cardNumber: { type: ["string", "null"] },
            rarity: { type: ["string", "null"] },
          },
        },
      },
    },
  } as never);

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("The card analysis response was empty.");
  return {
    ...(JSON.parse(content) as object),
    // Keep legacy response fields for older clients; condition has its own endpoint.
    conditionSummary: null,
    observations: {
      centering: null, corners: null, edges: null,
      surface: null, dirt: null, other: null,
    },
  };
}