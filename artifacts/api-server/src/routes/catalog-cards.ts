import { Router, type IRouter } from "express";
import { SearchCardMarketWithAiResponse } from "@workspace/api-zod";
import {
  CatalogAiMarketResultError,
  getCatalogCard,
  getCatalogCardAiMarketResult,
  getFeaturedCards,
  isCanonicalCatalogUuid,
  listDiscoveryCards,
} from "../catalog/cards";
import {
  AiMarketSearchRateLimitError,
  reserveAiMarketSearchQuota,
} from "../lib/ai-market-search";

const router: IRouter = Router();

router.get("/cards/featured", async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  try {
    res.json({ cards: await getFeaturedCards() });
  } catch (error) {
    req.log.error({ error }, "Could not load featured catalog cards");
    res.status(503).json({ error: "Featured card catalog is temporarily unavailable" });
  }
});

router.get("/cards/discover", async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const limit = req.query.limit === undefined ? 24 : Number(req.query.limit);
  const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
  const query = req.query.query === undefined ? "" : req.query.query;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 30
    || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000
    || typeof query !== "string" || query.length > 60) {
    res.status(400).json({ error: "Invalid discovery query" });
    return;
  }
  try {
    res.json(await listDiscoveryCards(limit, offset, query.normalize("NFKC").trim()));
  } catch (error) {
    req.log.error({ error }, "Could not load discovery catalog");
    res.status(503).json({ error: "Discovery catalog is temporarily unavailable" });
  }
});

router.get("/cards/catalog/:cardId", async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  if (!isCanonicalCatalogUuid(req.params.cardId)) {
    res.status(400).json({ error: "cardId must be a catalog UUID" });
    return;
  }
  try {
    const card = await getCatalogCard(req.params.cardId);
    if (!card) {
      res.status(404).json({ error: "Catalog card not found" });
      return;
    }
    res.json({ card });
  } catch (error) {
    req.log.error({ error }, "Could not load catalog card");
    res.status(503).json({ error: "Catalog card data is temporarily unavailable" });
  }
});

router.get("/cards/catalog/:cardId/ai-market-result", async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  if (!isCanonicalCatalogUuid(req.params.cardId)) {
    res.status(400).json({ error: "cardId must be a catalog UUID" });
    return;
  }
  try {
    const result = await getCatalogCardAiMarketResult(
      req.params.cardId,
      () => reserveAiMarketSearchQuota(req.ip ?? "unknown"),
    );
    if (!result) {
      res.status(404).json({ error: "Catalog card not found" });
      return;
    }
    res.json(SearchCardMarketWithAiResponse.parse(result));
  } catch (error) {
    if (error instanceof AiMarketSearchRateLimitError) {
      res.set("Retry-After", String(error.retryAfterSeconds));
      res.status(429).json({ error: "Too many AI market searches. Please try again later." });
      return;
    }
    if (error instanceof CatalogAiMarketResultError && error.kind === "database") {
      req.log.error({ error }, "Could not load catalog card for AI market research");
      res.status(503).json({ error: "Catalog card data is temporarily unavailable" });
      return;
    }
    req.log.error({ error }, "AI market web search failed for catalog card");
    res.status(502).json({ error: "AI market web research is temporarily unavailable or returned invalid data." });
  }
});

export default router;