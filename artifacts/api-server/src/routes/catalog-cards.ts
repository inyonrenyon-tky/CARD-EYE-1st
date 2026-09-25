import { Router, type IRouter } from "express";
import { getCatalogCard, getFeaturedCards, isCanonicalCatalogUuid } from "../catalog/cards";

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

export default router;