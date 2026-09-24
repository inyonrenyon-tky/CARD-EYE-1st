import { catalogDb, migrateCatalog, saveCard, saveSet } from "./db";
import { TcgdexProvider } from "./tcgdex";

const [command, ...args] = process.argv.slice(2);
const setFilter = args.find((arg) => arg.startsWith("--set="))?.split("=")[1];
const maxCardsRaw = args.find((arg) => arg.startsWith("--max-cards="))?.split("=")[1];
const maxCards = maxCardsRaw ? Number(maxCardsRaw) : Infinity;
if (maxCardsRaw && (!Number.isSafeInteger(maxCards) || maxCards < 1)) throw new Error("Invalid --max-cards");
if (!["migrate", "import", "sync"].includes(command)) {
  throw new Error("Usage: catalog:import|catalog:sync|catalog:migrate [--set=SV2a] [--max-cards=5]");
}

async function main() {
  if (command === "migrate") {
    await migrateCatalog();
    console.log("Catalog schema and RLS are ready in the configured Supabase database.");
    return;
  }
  const db = catalogDb();
  const lockClient = await db.connect();
  const lockId = 7621834;
  let runId: string | undefined;
  let inserted = 0, updated = 0, skipped = 0, failed = 0, fetched = 0;
  try {
    const lock = await lockClient.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [lockId]);
    if (!lock.rows[0].locked) throw new Error("Another catalog sync is running");
    const start = await db.query<{ id: string }>(
      "insert into public.catalog_sync_runs(provider,status) values('tcgdex','running') returning id",
    );
    runId = start.rows[0].id;
    const provider = new TcgdexProvider();
    const sets = await provider.fetchSets();
    for (const set of sets) {
      if (setFilter && set.code.toLowerCase() !== setFilter.toLowerCase()) continue;
      const briefs = await provider.fetchCardsBySet(set);
      const setId = await saveSet(set, provider.getSourceMetadata().id);
      for (const brief of briefs) {
        if (fetched >= maxCards) break;
        fetched++;
        try {
          const card = await provider.fetchCard(brief.id, set);
          const action = await saveCard(card, provider.getSourceMetadata().id, setId);
          if (action === "inserted") inserted++;
          else if (action === "updated") updated++;
          else skipped++;
        } catch (error) {
          failed++;
          console.error(`Card ${brief.id}: ${error instanceof Error ? error.message : "unknown error"}`);
          if (error instanceof Error && /429|temporarily unavailable|request exhausted/i.test(error.message)) throw error;
        }
        if (fetched % 25 === 0) {
          await db.query(
            `update public.catalog_sync_runs set fetched_count=$2,inserted_count=$3,updated_count=$4,skipped_count=$5,failed_count=$6
             where id=$1`, [runId, fetched, inserted, updated, skipped, failed],
          );
          console.log(JSON.stringify({ fetched, inserted, updated, skipped, failed }));
        }
      }
      if (fetched >= maxCards) break;
    }
    await db.query(
      `update public.catalog_sync_runs set completed_at=now(),status=$2,
        fetched_count=$3,inserted_count=$4,updated_count=$5,skipped_count=$6,failed_count=$7 where id=$1`,
      [runId, failed ? "partial" : "success", fetched, inserted, updated, skipped, failed],
    );
    console.log(JSON.stringify({ fetched, inserted, updated, skipped, failed, status: failed ? "partial" : "success" }));
  } catch (error) {
    if (runId) await db.query(
      `update public.catalog_sync_runs set completed_at=now(),status='failed',
       fetched_count=$2,inserted_count=$3,updated_count=$4,skipped_count=$5,failed_count=$6,error_summary=$7 where id=$1`,
      [runId, fetched, inserted, updated, skipped, failed, error instanceof Error ? error.message.slice(0, 300) : "Unknown failure"],
    );
    throw error;
  } finally {
    if (runId) await lockClient.query("select pg_advisory_unlock($1)", [lockId]);
    lockClient.release();
    await db.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Catalog command failed");
  process.exitCode = 1;
});