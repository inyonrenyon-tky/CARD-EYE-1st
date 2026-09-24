import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import pg from "pg";
import type { CatalogCard, CatalogSet } from "./provider";

let pool: pg.Pool | undefined;
export function catalogDbConfigured() { return !!process.env.SUPABASE_DB_URL; }

export function catalogDb() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error("SUPABASE_DB_URL is not configured");
  const target = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(target.protocol) ||
      !/(^|\.)supabase\.(co|com)$/.test(target.hostname)) {
    throw new Error("SUPABASE_DB_URL must point to a Supabase PostgreSQL host");
  }
  // Supabase's pooler uses its own CA. Keep hostname validation enabled.
  // Public CA: https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
  // Package scripts and the API workflow run with artifacts/api-server as cwd.
  const ca = readFileSync("catalog/prod-ca-2021.crt", "utf8");
  pool ??= new pg.Pool({
    connectionString, ssl: { ca, rejectUnauthorized: true },
    max: 4, connectionTimeoutMillis: 7_000, idleTimeoutMillis: 10_000,
  });
  return pool;
}

export async function migrateCatalog() {
  const client = await catalogDb().connect();
  try {
    await client.query("begin");
    const migration = await readFile(new URL("../../catalog/schema.sql", import.meta.url), "utf8");
    await client.query(migration);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function saveSet(set: CatalogSet, source: string): Promise<string> {
  const result = await catalogDb().query<{ id: string }>(
    `insert into public.card_sets(source, source_id, code, name, series, language, release_date)
     values ($1,$2,$3,$4,$5,'ja',$6)
     on conflict (source, source_id, language) do update set
       name=excluded.name, code=excluded.code, series=excluded.series,
       release_date=excluded.release_date, last_fetched_at=now()
     returning id`,
    [source, set.sourceId, set.code, set.name, set.series, set.releaseDate],
  );
  return result.rows[0].id;
}

export type SaveResult = "inserted" | "updated" | "skipped";
type ExistingCard = {
  id: string; set_id: string; name: string; collector_number: string;
  rarity_code: string | null; variant_attributes: Record<string, unknown>;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function cardHasChanged(previous: ExistingCard | undefined, card: CatalogCard, setId: string): boolean {
  return !previous || previous.set_id !== setId || previous.name !== card.name ||
    previous.collector_number !== card.collectorNumber || previous.rarity_code !== card.rarity ||
    canonical(previous.variant_attributes) !== canonical(card.variantAttributes);
}
export async function saveCard(card: CatalogCard, source: string, setId: string): Promise<SaveResult> {
  const normalizedNumber = card.collectorNumber.normalize("NFKC").replace(/\s+/g, "").toUpperCase();
  const client = await catalogDb().connect();
  try {
    await client.query("begin");
    const external = await client.query<{ card_id: string }>(
      `select card_id from public.card_external_ids where provider=$1 and external_id=$2 for update`,
      [source, card.externalId],
    );
    const existing = await client.query<{
      id: string; set_id: string; name: string; collector_number: string;
      rarity_code: string | null; variant_attributes: Record<string, unknown>;
    }>(
      external.rows[0]
        ? `select id,set_id,name,collector_number,rarity_code,variant_attributes from public.cards where id=$1 for update`
        : `select id,set_id,name,collector_number,rarity_code,variant_attributes from public.cards
           where set_id=$1 and collector_number_normalized=$2 and language='ja' and variant_code=$3 for update`,
      external.rows[0] ? [external.rows[0].card_id] : [setId, normalizedNumber, card.variantCode],
    );
    const previous = existing.rows[0];
    if (previous && !external.rows.length && previous.name.normalize("NFKC") !== card.name.normalize("NFKC")) {
      throw new Error("Natural-key collision: distinct names share set, number and variant");
    }
    const changed = cardHasChanged(previous, card, setId);
    let id = previous?.id;
    if (!previous) {
      const inserted = await client.query<{ id: string }>(
        `insert into public.cards(set_id,name,collector_number,collector_number_normalized,rarity_code,language,variant_code,variant_attributes)
         values($1,$2,$3,$4,$5,'ja',$6,$7::jsonb) returning id`,
        [setId, card.name, card.collectorNumber, normalizedNumber, card.rarity, card.variantCode, JSON.stringify(card.variantAttributes)],
      );
      id = inserted.rows[0].id;
    } else if (changed) {
      await client.query(
        `update public.cards set set_id=$2,name=$3,collector_number=$4,collector_number_normalized=$5,
          rarity_code=$6,variant_attributes=$7::jsonb,updated_at=now(),last_fetched_at=now() where id=$1`,
        [id, setId, card.name, card.collectorNumber, normalizedNumber, card.rarity, JSON.stringify(card.variantAttributes)],
      );
    } else {
      await client.query("update public.cards set last_fetched_at=now() where id=$1", [id]);
    }
    await client.query(
      `insert into public.card_external_ids(provider,external_id,card_id) values($1,$2,$3)
       on conflict (provider,external_id) do update set last_fetched_at=now()`,
      [source, card.externalId, id],
    );
    if (card.imageUrl) {
      await client.query(
        `insert into public.card_images(card_id,source,image_url,rights_information,license_status,usable_in_card_eye)
         values($1,$2,$3,'Artwork rights not established','requires_review',false)
         on conflict (card_id,source,image_url) do nothing`,
        [id, source, card.imageUrl],
      );
    }
    await client.query("commit");
    return previous ? changed ? "updated" : "skipped" : "inserted";
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}