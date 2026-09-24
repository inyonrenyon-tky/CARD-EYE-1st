import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scansRouter from "./scans";
import pricesRouter from "./prices";
import marketAnalysisRouter from "./market-analysis";
import supabaseRouter from "./supabase";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scansRouter);
router.use(pricesRouter);
router.use(marketAnalysisRouter);
router.use(supabaseRouter);

export default router;
