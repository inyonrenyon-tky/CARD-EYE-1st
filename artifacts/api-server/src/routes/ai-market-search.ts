import { Router, type IRouter } from "express";
import { SearchCardMarketWithAiBody, SearchCardMarketWithAiResponse } from "@workspace/api-zod";
import { aiMarketSearchService } from "../lib/ai-market-search";

const router: IRouter = Router();
const WINDOW_MS = 60 * 60_000;
const perClientLimit = 12;
const requests = new Map<string, { count: number; until: number }>();

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

  const now = Date.now();
  const clientKey = req.ip ?? "unknown";
  const previous = requests.get(clientKey);
  const current = previous && previous.until > now ? previous : { count: 0, until: now + WINDOW_MS };
  if (current.count >= perClientLimit) {
    res.set("Retry-After", String(Math.ceil((current.until - now) / 1000)));
    res.status(429).json({ error: "Too many AI market searches. Please try again later." });
    return;
  }
  current.count++;
  requests.set(clientKey, current);
  if (requests.size > 1000) {
    for (const [key, value] of requests) if (value.until <= now) requests.delete(key);
  }

  try {
    const result = await aiMarketSearchService.search({
      cardName,
      cardNumber: cardNumber || null,
      series: series || null,
      rarity: typeof parsed.data.rarity === "string" ? parsed.data.rarity.normalize("NFKC").trim() || null : null,
    });
    res.json(SearchCardMarketWithAiResponse.parse(result));
  } catch {
    req.log.error("AI market web search failed");
    res.status(502).json({ error: "AI market web research is temporarily unavailable or returned invalid data." });
  }
});

export default router;