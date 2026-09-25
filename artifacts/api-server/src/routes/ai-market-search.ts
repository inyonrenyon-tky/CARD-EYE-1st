import { Router, type IRouter } from "express";
import { SearchCardMarketWithAiBody, SearchCardMarketWithAiResponse } from "@workspace/api-zod";
import {
  aiMarketSearchService,
  AiMarketSearchRateLimitError,
  reserveAiMarketSearchQuota,
} from "../lib/ai-market-search";

const router: IRouter = Router();

router.post("/cards/ai-market-search", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const parsed = SearchCardMarketWithAiBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide a card name and bounded card identity fields." });
    return;
  }
  const cardName = parsed.data.cardName.normalize("NFKC").trim();
  const cardNumber = typeof parsed.data.cardNumber === "string" ? parsed.data.cardNumber.normalize("NFKC").trim() : "";
  const series = typeof parsed.data.series === "string" ? parsed.data.series.normalize("NFKC").trim() : "";
  if (!cardName || (!cardNumber && !series)) {
    res.status(400).json({ error: "A card name and at least a card number or series are required." });
    return;
  }
  const imageBase64 = parsed.data.imageBase64;
  const mimeType = parsed.data.mimeType;
  const photo = imageBase64 ? Buffer.from(imageBase64, "base64") : null;
  const matchesMimeType = photo && (
    (mimeType === "image/jpeg" && photo[0] === 0xff && photo[1] === 0xd8)
    || (mimeType === "image/png" && photo.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    || (mimeType === "image/webp" && photo.toString("ascii", 0, 4) === "RIFF" && photo.toString("ascii", 8, 12) === "WEBP")
  );
  if (imageBase64 && (
    !mimeType
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(imageBase64)
    || !matchesMimeType
    || photo!.length > 5 * 1024 * 1024
  )) {
    res.status(400).json({ error: "Provide a valid card photo of up to 5 MiB and its mime type." });
    return;
  }

  try {
    const result = await aiMarketSearchService.search({
      cardName,
      cardNumber: cardNumber || null,
      series: series || null,
      rarity: typeof parsed.data.rarity === "string" ? parsed.data.rarity.normalize("NFKC").trim() || null : null,
      ...(imageBase64 && mimeType ? { imageBase64, mimeType } : {}),
    }, () => {
      reserveAiMarketSearchQuota(req.ip ?? "unknown");
    });
    res.json(SearchCardMarketWithAiResponse.parse(result));
  } catch (error) {
    if (error instanceof AiMarketSearchRateLimitError) {
      res.set("Retry-After", String(error.retryAfterSeconds));
      res.status(429).json({ error: "Too many AI market searches. Please try again later." });
      return;
    }
    req.log.error("AI market web search failed");
    res.status(502).json({ error: "AI market web research is temporarily unavailable or returned invalid data." });
  }
});

export default router;