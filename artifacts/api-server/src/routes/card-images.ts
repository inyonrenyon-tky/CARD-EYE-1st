import { Router, type IRouter } from "express";
import {
  resolveRepresentativeImage,
  type RepresentativeImageInput,
} from "../catalog/official-card-images";

const router: IRouter = Router();

function parseInput(value: unknown): RepresentativeImageInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (
    typeof body.cardName !== "string" || body.cardName.trim().length === 0 || body.cardName.length > 120 ||
    (body.cardNumber !== undefined && (typeof body.cardNumber !== "string" || body.cardNumber.length > 40)) ||
    (body.series !== undefined && (typeof body.series !== "string" || body.series.length > 120)) ||
    (body.rarity !== undefined && (typeof body.rarity !== "string" || body.rarity.length > 40))
  ) {
    return null;
  }
  if (body.cardId !== undefined && body.cardId !== null &&
      (typeof body.cardId !== "string" || !/^[a-f0-9-]{36}$/i.test(body.cardId))) {
    return null;
  }
  return {
    cardName: body.cardName.trim(),
    cardNumber: typeof body.cardNumber === "string" ? body.cardNumber.trim() : "",
    series: typeof body.series === "string" ? body.series.trim() : "",
    rarity: typeof body.rarity === "string" ? body.rarity.trim() : "",
    cardId: body.cardId as string | null | undefined,
  };
}

router.post("/cards/representative-image", async (req, res): Promise<void> => {
  const input = parseInput(req.body);
  if (!input) {
    res.status(400).json({
      error: "cardName is required; cardId must be a UUID or null.",
    });
    return;
  }

  const result = await resolveRepresentativeImage(input);
  if (result.status === "unavailable") req.log.warn("Official card image lookup unavailable");
  res.json(result);
});

export default router;