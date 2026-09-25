import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AiMarketSearchResult } from "./ai-market-search";
import { logger } from "./logger";

export type AiMarketCacheStore = {
  read: (key: string, now: number) => Promise<AiMarketSearchResult | null>;
  write: (key: string, expiresAt: number, result: AiMarketSearchResult) => Promise<void>;
};

/** Short-lived, text-only research cache. Photos and provider pages are never written here. */
export function createFileAiMarketCache(directory = join(tmpdir(), "card-eye-ai-research-v1")): AiMarketCacheStore {
  const filename = (key: string) => join(directory, `${createHash("sha256").update(key).digest("hex")}.json`);
  let pruneStarted = false;
  const pruneExpiredFiles = () => {
    if (pruneStarted) return;
    pruneStarted = true;
    void (async () => {
      const files = await readdir(directory);
      await Promise.all(files.filter((file) => file.endsWith(".json")).map(async (file) => {
        const path = join(directory, file);
        const info = await stat(path);
        if (info.mtimeMs < Date.now() - 60 * 60_000) await unlink(path);
      }));
    })().catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.warn({ error }, "Could not prune expired AI market cache files");
      }
    });
  };
  return {
    async read(key, now) {
      pruneExpiredFiles();
      let content: string;
      try {
        content = await readFile(filename(key), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
      let record: { key?: string; expiresAt?: number; result?: AiMarketSearchResult };
      try {
        record = JSON.parse(content);
      } catch {
        await unlink(filename(key)).catch(() => {});
        return null;
      }
      if (!record || record.expiresAt === undefined || record.expiresAt <= now) {
        await unlink(filename(key)).catch(() => {});
        return null;
      }
      const result = record.result;
      if (record.key !== key || !result || !Number.isFinite(Date.parse(result.searchedAt))
        || typeof result.cardName !== "string" || !Array.isArray(result.sources)
        || !result.estimates?.ungradedExcellent) return null;
      return result;
    },
    async write(key, expiresAt, result) {
      await mkdir(directory, { recursive: true });
      pruneExpiredFiles();
      const target = filename(key);
      const temporary = `${target}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify({ key, expiresAt, result }), { mode: 0o600 });
      await rename(temporary, target);
    },
  };
}