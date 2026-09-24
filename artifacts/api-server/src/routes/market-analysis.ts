import { Router, type IRouter } from "express";
import { AnalyzeMarketBody, AnalyzeMarketResponse } from "@workspace/api-zod";
import { calculateMarketAnalysis } from "../lib/market-analysis";
import { optionalMarketExplanation } from "../lib/market-explanation";
import { liveMarketPriceProvider } from "../lib/market-price-provider";

const router: IRouter = Router();
const WINDOW_MS = 60 * 60_000;
const perClientLimit = 40;
const requests = new Map<string, { count: number; until: number }>();

router.post("/cards/market-analysis", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const parsed = AnalyzeMarketBody.safeParse(req.body);
  if (!parsed.success ||
      !/^\d{1,4}\/[\w-]{2,25}$/i.test(parsed.data.cardId) ||
      !parsed.data.name.trim()) {
    res.status(400).json({ error: "A valid card name and collector number are required." });
    return;
  }
  const now = Date.now();
  const ip = req.ip ?? "unknown";
  const previous = requests.get(ip);
  const current = previous && previous.until > now ? previous : { count: 0, until: now + WINDOW_MS };
  if (current.count >= perClientLimit) {
    res.set("Retry-After", String(Math.ceil((current.until - now) / 1000)));
    res.status(429).json({ error: "Too many market analyses. Please try again later." });
    return;
  }
  current.count++;
  requests.set(ip, current);
  if (requests.size > 1000) {
    for (const [key, value] of requests) if (value.until <= now) requests.delete(key);
  }
  try {
    const { cardId, name, condition } = parsed.data;
    const snapshot = await liveMarketPriceProvider.getObservations(cardId, name);
    const analysis = calculateMarketAnalysis(cardId, snapshot, condition, new Date(now));
    let aiExplanation: string | null = null;
    if (analysis.dataConfidence !== "insufficient") {
      aiExplanation = await optionalMarketExplanation({
        confidence: analysis.dataConfidence,
        trend: analysis.trend,
        volatility: analysis.volatilityPercent === null ? "unknown"
          : analysis.volatilityPercent >= 15 ? "large" : "limited",
        conditionAvailable: !!analysis.conditionSummary,
      });
    }
    res.json(AnalyzeMarketResponse.parse({ ...analysis, aiExplanation }));
  } catch (error) {
    req.log.error({ error }, "Could not assemble market analysis");
    res.status(502).json({ error: "Price observations are temporarily unavailable." });
  }
});

export default router;