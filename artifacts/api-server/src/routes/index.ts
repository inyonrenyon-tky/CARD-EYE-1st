import { Router, type IRouter } from "express";
import healthRouter from "./health";
import scansRouter from "./scans";
import pricesRouter from "./prices";

const router: IRouter = Router();

router.use(healthRouter);
router.use(scansRouter);
router.use(pricesRouter);

export default router;
