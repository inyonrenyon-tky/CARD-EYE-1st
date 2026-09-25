import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scansRouter from "./scans";
import pricesRouter from "./prices";
import marketAnalysisRouter from "./market-analysis";
import aiMarketSearchRouter from "./ai-market-search";
import supabaseRouter from "./supabase";
import cardImagesRouter from "./card-images";
import catalogCardsRouter from "./catalog-cards";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scansRouter);
router.use(pricesRouter);
router.use(marketAnalysisRouter);
router.use(aiMarketSearchRouter);
router.use(supabaseRouter);
router.use(cardImagesRouter);
router.use(catalogCardsRouter);

export default router;
