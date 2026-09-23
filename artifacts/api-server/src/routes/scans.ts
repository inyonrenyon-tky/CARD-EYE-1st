import { Router, type IRouter } from "express";
import { AnalyzeScanBody, AnalyzeScanResponse } from "@workspace/api-zod";
import { analyzeCardPhoto } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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
    const result = await analyzeCardPhoto(parsed.data.imageBase64, parsed.data.mimeType);
    res.json(AnalyzeScanResponse.parse(result));
  } catch (error) {
    req.log.error({ err: error }, "Card image analysis failed");
    res.status(502).json({ error: "Card analysis is temporarily unavailable. Please try again." });
  }
});

export default router;