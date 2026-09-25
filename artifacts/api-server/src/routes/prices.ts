import { Router, type IRouter } from "express";
import { getCardPrices, type PeriodDays } from "../lib/price-domain";
import { getLiveCardPrices } from "../lib/live-prices";
import { GetCardPricesParams, GetCardPricesQueryParams, GetCardPricesResponse } from "@workspace/api-zod";
import { getCatalogCard, isCanonicalCatalogUuid } from "../catalog/cards";

const router: IRouter = Router();

router.get("/cards/:cardId/prices", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const periodRaw = req.query.period;
  const period = periodRaw === undefined ? 30 : Number(periodRaw);
  const demoRaw = req.query.demo;
  const demo = demoRaw === undefined ? false : demoRaw === "true";
  try {
    GetCardPricesParams.parse(req.params);
    if (demoRaw !== undefined && demoRaw !== "true" && demoRaw !== "false") throw new Error("invalid demo");
    GetCardPricesQueryParams.parse({ period, demo, name: req.query.name });
  } catch {
    res.status(400).json({ error: "period must be 7, 30, 90, or 365 and demo must be true or false" });
    return;
  }
  try {
    const requestedId = req.params.cardId;
    const catalogId = isCanonicalCatalogUuid(requestedId);
    const catalogCard = catalogId ? await getCatalogCard(requestedId) : null;
    if (catalogId && !catalogCard) {
      res.status(404).json({ error: "Catalog card not found" });
      return;
    }
    const resolvedNumber = catalogCard?.number ?? requestedId;
    const resolvedName = catalogCard?.name ?? req.query.name as string | undefined;
    const payload = demo
      ? getCardPrices(requestedId, period as PeriodDays, "demo")
      : await getLiveCardPrices(resolvedNumber, resolvedName, period as PeriodDays, !!catalogCard);
    if (catalogCard) payload.cardId = requestedId;
    res.json(GetCardPricesResponse.parse(payload));
  } catch (error) {
    req.log.error({ error }, "Could not assemble card prices");
    res.status(502).json({ error: "Price data is temporarily unavailable" });
  }
});

export default router;