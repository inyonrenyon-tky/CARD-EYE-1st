# CARD EYE Japanese card catalog

The catalog is independent of price observations. Its IDs are locally generated UUIDs; provider IDs live in `card_external_ids`. No client has a write policy. The CLI uses a server-only Supabase PostgreSQL connection; it never runs from Expo.

## Source review (2026-09-24)

| Candidate | Findings | Decision |
| --- | --- | --- |
| [TCGdex](https://tcgdex.dev/rest) | Japanese API returned 184 sets and 12,781 card summaries in this environment. The [cards-database repository](https://github.com/tcgdex/cards-database) states an MIT license for its database. The API's [robots.txt](https://api.tcgdex.net/robots.txt) disallows crawlers but explicitly notes that API use is allowed. Public API update cursor and numerical rate limits were not documented in the material checked. Pokémon artwork rights are not established by the database license. | Metadata provider for a conservative manual import. Mark artwork `requires_review`, never copy to Storage or show it. Do not assume undocumented API usage terms/limits permit unrestricted commercial-scale harvesting; review before scheduling full daily scans. |
| [Cardrush](https://www.cardrush-pokemon.jp/) | Homepage requests from the app server returned HTTP 403; no authorized API/CSV access was supplied. Its [robots.txt](https://www.cardrush-pokemon.jp/robots.txt) blocks specific crawler agents, but does **not** grant storage, scraping, commercial use or redistribution rights. | `requires_review`; neither catalog nor price automation is enabled. Do not bypass its access control. |

TCGdex image URLs are metadata references only. The image table is not exposed through public RLS and `usable_in_card_eye` is always false.

## Setup and verification

Provide `SUPABASE_DB_URL` as a **Replit Secret** containing the existing Supabase project's PostgreSQL connection URI (transaction pooler/direct connection). Do not use `DATABASE_URL`, which belongs to the separate Replit database. Do not put this URI in Expo/public env, code, GitHub, logs, or chat. Verify the target database and existing schema before migration; the SQL refuses to modify pre-existing catalog-named tables that do not have our migration marker.

Run from the workspace root:

```sh
pnpm --filter @workspace/api-server run catalog:migrate
pnpm --filter @workspace/api-server run catalog:import --set=SV2a --max-cards=5
pnpm --filter @workspace/api-server run catalog:import
pnpm --filter @workspace/api-server run catalog:sync
pnpm --filter @workspace/api-server run catalog:test
```

Both import and sync compare normalized cards; TCGdex exposes no dependable modified-card cursor. The provider uses at most one request per second and retries temporary errors. A full initial import can take **several hours** at this rate. Each card commits independently, so re-running after a failure does not erase completed work. `catalog_sync_runs` records counts and failures. Run the small sample and repeat it before the full import; inspect counts and RLS before scheduling. A daily scheduler can invoke the same `catalog:sync` CLI **only after** manual sync and source usage limits have been confirmed. Do not run an automatic sync yet.

The scan API fails closed: if the catalog connection is missing/unavailable, it returns `unavailable`, never an invented `card_id`. Saved cards only retain the matched catalog UUID if their identity fields have not been edited. Artwork, images, catalog IDs and prices are separate concerns.