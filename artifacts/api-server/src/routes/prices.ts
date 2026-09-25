import { Router, type IRouter } from "express";
import { getCardPrices, type PeriodDays } from "../lib/price-domain";
import { getLiveCardPrices } from "../lib/live-prices";
import { GetCardPricesParams, GetCardPricesQueryParams, GetCardPricesResponse } from "@workspace/api-zod";
import { getCatalogCard, getCatalogCardAiMarketResult, isCanonicalCatalogUuid } from "../catalog/cards";
import { aiMarketSearchService, reserveAiMarketSearchQuota } from "../lib/ai-market-search";
import { candidateFromAiResult, estimateWhenNoAiResult, type AiEstimateCandidate } from "../lib/ai-price-estimate";

const router: IRouter = Router();

router.get("/cards/:cardId/prices", async (req, res) => {
  res.set("Cache-Control", "no-store");
  const periodRaw = req.query.period;
  const period = periodRaw === undefined ? 30 : Number(periodRaw);
  const demoRaw = req.query.demo;
  const demo = demoRaw === undefined ? false : demoRaw === "true";
  let validatedSeries: string | undefined;
  let validatedRarity: string | undefined;
  try {
    GetCardPricesParams.parse(req.params);
    if (demoRaw !== undefined && demoRaw !== "true" && demoRaw !== "false") throw new Error("invalid demo");
    const query = GetCardPricesQueryParams.parse({ period, demo, name: req.query.name, series: req.query.series, rarity: req.query.rarity });
    validatedSeries = query.series;
    validatedRarity = query.rarity;
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
    const series = catalogCard?.series ?? validatedSeries ?? null;
    const rarity = catalogCard?.rarity ?? validatedRarity ?? null;
    const cardNumber = /^[\w-]{1,24}\/[\w-]{2,25}$/i.test(resolvedNumber) ? resolvedNumber : null;
    const identity = resolvedName?.trim() && (cardNumber || series)
      ? { cardName: resolvedName.trim(), cardNumber, series, rarity }
      : null;
    let charged = false;
    const reserveOnce = () => {
      if (!charged) {
        reserveAiMarketSearchQuota(req.ip ?? "unknown");
        charged = true;
      }
    };
    let researchPromise: Promise<AiEstimateCandidate | null> | undefined;
    const researchOnce = () => {
      if (!identity) return Promise.resolve(null);
      researchPromise ??= (async () => {
        try {
          const research = catalogCard
            ? await getCatalogCardAiMarketResult(requestedId, reserveOnce)
            : await aiMarketSearchService.search(identity, reserveOnce);
          return research ? candidateFromAiResult(research) : null;
        } catch (error) {
          req.log.warn({ error }, "AI market research unavailable for representative estimate");
          return null;
        }
      })();
      return researchPromise;
    };
    const payload = demo
      ? getCardPrices(requestedId, period as PeriodDays, "demo")
      : await getLiveCardPrices(
        resolvedNumber, resolvedName, period as PeriodDays, !!catalogCard,
        series ?? undefined,
        rarity ?? undefined,
        () => { if (identity) void researchOnce(); },
      );
    if (catalogCard) payload.cardId = requestedId;
    const observedRepresentative = payload.representative;
    const weakObserved = observedRepresentative.price !== null && observedRepresentative.confidenceLabel === "low"
      && observedRepresentative.sampleCount <= 2 && observedRepresentative.evidenceType !== "verified_sale";
    if (!demo && (observedRepresentative.price === null || weakObserved) && identity) {
        let candidate = await researchOnce();
        if (!candidate && observedRepresentative.price === null) {
          try {
            candidate = await estimateWhenNoAiResult(identity, reserveOnce);
          } catch (error) {
            req.log.warn({ error }, "AI reasoning unavailable for representative estimate");
          }
        }
        const corroboratedSingleMarketPage = candidate?.comparisonCount === 1 && candidate.marketEvidence
          && observedRepresentative.price !== null
          && observedRepresentative.evidenceType === "shop_listing"
          && Math.abs(candidate.price - observedRepresentative.price) / observedRepresentative.price <= 0.25;
        if (candidate && (observedRepresentative.price === null
          || (candidate.marketEvidence && candidate.comparisonCount >= 3)
          || (candidate.marketEvidence && candidate.comparisonCount >= 2 && candidate.sourceNames.length >= 2)
          || corroboratedSingleMarketPage)) {
          payload.representative = {
            price: candidate.price,
            condition: candidate.condition,
            calculationMethod: candidate.calculationMethod,
            confidenceScore: 0.2,
            confidenceLabel: "low",
            sampleCount: 0,
            windowDays: null,
            calculatedAt: new Date().toISOString(),
            lastObservedAt: null,
            sourceNames: candidate.sourceNames,
            evidenceType: candidate.evidenceType,
            rangeMin: candidate.rangeMin,
            rangeMax: candidate.rangeMax,
            note: `${candidate.note}${weakObserved ? ` 現在の同一カードの実観測は${observedRepresentative.sourceNames.join("、")}の${observedRepresentative.sampleCount}件（¥${observedRepresentative.price!.toLocaleString("ja-JP")}）のみです。` : ""}`,
          };
          payload.methodology += " 実観測が少ないため、複数の同一カードのAI調査結果を比較した一点参考価格を表示しました。AI価格は確認済み成約や実際の掲載価格として集計していません。";
        } else if (observedRepresentative.price === null) {
          payload.representative.note = "同一カードの実観測価格がなく、AI推定も現在取得できません。根拠のない固定額は表示しません。";
        }
    }
    res.json(GetCardPricesResponse.parse(payload));
  } catch (error) {
    req.log.error({ error }, "Could not assemble card prices");
    res.status(502).json({ error: "Price data is temporarily unavailable" });
  }
});

export default router;