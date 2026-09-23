import { Router, type IRouter } from "express";
import { getCardPrices, PERIODS, type PeriodDays } from "../lib/price-domain";
import { GetCardPricesParams, GetCardPricesQueryParams, GetCardPricesResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/cards/:cardId/prices", (req, res) => {
  const periodRaw = req.query.period;
  const period = periodRaw === undefined ? 30 : Number(periodRaw);
  const demoRaw = req.query.demo;
  const demo = demoRaw === undefined ? false : demoRaw === "true";
  try {
    GetCardPricesParams.parse(req.params);
    if (demoRaw !== undefined && demoRaw !== "true" && demoRaw !== "false") throw new Error("invalid demo");
    GetCardPricesQueryParams.parse({ period, demo: demoRaw === undefined ? false : demo });
  } catch {
    res.status(400).json({ error: "period must be 7, 30, 90, or 365 and demo must be true or false" });
    return;
  }
  const payload = getCardPrices(req.params.cardId, period as PeriodDays, demo ? "demo" : "live");
  res.json(GetCardPricesResponse.parse(payload));
});

export default router;