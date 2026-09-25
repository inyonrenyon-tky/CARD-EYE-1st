import { Router, type IRouter } from "express";
import {
  AnalyzeConditionBody,
  AnalyzeConditionResponse,
  AnalyzeScanBody,
  AnalyzeScanResponse,
} from "@workspace/api-zod";
import {
  analyzeCardCondition,
  analyzeCardPhoto,
  guardConditionAnalysis,
} from "@workspace/integrations-openai-ai-server";
import { matchAnalysis } from "../catalog/matching";

const router: IRouter = Router();
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const CONDITION_WINDOW_MS = 10 * 60 * 1000;
const CONDITION_LIMIT = 60;
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;
const GLOBAL_LIMIT = 240;
const conditionRequests = new Map<string, { resetAt: number; count: number }>();
let globalRequests = { resetAt: 0, count: 0 };

function reserveConditionCapacity(ip: string, imageCount: number): boolean {
  const now = Date.now();
  if (now >= globalRequests.resetAt) globalRequests = { resetAt: now + GLOBAL_WINDOW_MS, count: 0 };
  if (conditionRequests.size > 1000) {
    for (const [key, value] of conditionRequests) {
      if (value.resetAt <= now) conditionRequests.delete(key);
    }
  }
  const previous = conditionRequests.get(ip);
  const current = !previous || previous.resetAt <= now
    ? { resetAt: now + CONDITION_WINDOW_MS, count: 0 }
    : previous;
  if (current.count + imageCount > CONDITION_LIMIT || globalRequests.count + imageCount > GLOBAL_LIMIT) return false;
  current.count += imageCount;
  globalRequests.count += imageCount;
  conditionRequests.set(ip, current);
  return true;
}

function decodeImage(value: string, mimeType: string): Buffer {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error("imageBase64 must be valid base64.");
  }
  const image = Buffer.from(value, "base64");
  if (image.length === 0 || image.length > MAX_IMAGE_BYTES) {
    throw new Error("Image must be between 1 byte and 5 MiB.");
  }
  const jpeg = mimeType === "image/jpeg" && image[0] === 0xff && image[1] === 0xd8;
  const png =
    mimeType === "image/png" &&
    image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (!jpeg && !png) throw new Error("Image bytes do not match mimeType.");
  return image;
}

router.post("/scans/analyze", async (req, res) => {
  const parsed = AnalyzeScanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "imageBase64 and a JPEG or PNG mimeType are required." });
    return;
  }
  try {
    decodeImage(parsed.data.imageBase64, parsed.data.mimeType);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid image." });
    return;
  }
  try {
    const analysis = AnalyzeScanResponse.parse(
      await analyzeCardPhoto(parsed.data.imageBase64, parsed.data.mimeType),
    );
    let catalogMatch;
    try {
      catalogMatch = await matchAnalysis(analysis);
    } catch {
      req.log.warn("Card catalog lookup unavailable");
      catalogMatch = { status: "unavailable" as const, matchedCardId: null, method: null, candidates: [] };
    }
    res.json(AnalyzeScanResponse.parse({ ...analysis, catalogMatch }));
  } catch (error) {
    req.log.error("Card image analysis failed");
    res.status(502).json({ error: "Card analysis is temporarily unavailable. Please try again." });
  }
});

router.post("/scans/condition", async (req, res) => {
  const parsed = AnalyzeConditionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "One to six valid JPEG or PNG images are required." });
    return;
  }

  try {
    let totalBytes = 0;
    for (const image of parsed.data.images) {
      totalBytes += decodeImage(image.imageBase64, image.mimeType).length;
    }
    if (totalBytes > MAX_IMAGE_BYTES) {
      res.status(413).json({ error: "Combined images must be no larger than 5 MiB." });
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid image.";
    res.status(message.includes("5 MiB") ? 413 : 400).json({ error: message });
    return;
  }

  if (!reserveConditionCapacity(req.ip ?? "unknown", parsed.data.images.length)) {
    res.setHeader("Retry-After", "600");
    res.status(429).json({ error: "Too many condition requests. Please try again later." });
    return;
  }

  try {
    const parsedModelAnalysis = AnalyzeConditionResponse.parse(
      await analyzeCardCondition(parsed.data.images),
    );
    const analysis = guardConditionAnalysis(
      parsedModelAnalysis,
      parsed.data.images.map((image) => image.view),
    );
    res.json(AnalyzeConditionResponse.parse(analysis));
  } catch {
    req.log.error({ imageCount: parsed.data.images.length }, "Card condition analysis failed");
    res.status(502).json({ error: "Card condition analysis is temporarily unavailable. Please try again." });
  }
});

export default router;