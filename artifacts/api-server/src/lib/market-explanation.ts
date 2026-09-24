import { generateMarketCaution } from "@workspace/integrations-openai-ai-server";

type Context = Parameters<typeof generateMarketCaution>[0];
type Generator = (context: Context) => Promise<string | null>;

export async function optionalMarketExplanation(
  context: Context,
  generate: Generator = generateMarketCaution,
): Promise<string | null> {
  try {
    return await generate(context);
  } catch {
    return null;
  }
}