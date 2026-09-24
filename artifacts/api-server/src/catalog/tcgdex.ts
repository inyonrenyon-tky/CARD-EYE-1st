import type { CardCatalogProvider, CatalogCard, CatalogSet, SourceMetadata } from "./provider";

const API = "https://api.tcgdex.net/v2/ja";
type SetBrief = { id: string; name: string };
type CardBrief = { id: string };
type CardDetail = {
  id?: string; localId?: string | number; name?: string; rarity?: string;
  image?: string; variants?: Record<string, boolean>; variants_detailed?: unknown[];
};
type SetDetail = SetBrief & {
  serie?: { name?: string }; releaseDate?: string; cardCount?: { official?: number };
  cards?: CardBrief[];
};

function wait(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

export class TcgdexProvider implements CardCatalogProvider {
  private nextRequest = 0;
  private readonly intervalMs: number;

  constructor(intervalMs = 1000) { this.intervalMs = intervalMs; }

  getSourceMetadata(): SourceMetadata {
    return {
      id: "tcgdex",
      catalogLicense: "MIT (tcgdex/cards-database; include LICENSE attribution)",
      imageRights: "requires_review",
      rateLimit: "undocumented",
      attribution: "TCGdex cards-database contributors, MIT. Not affiliated with The Pokémon Company.",
    };
  }

  private async get<T>(path: string): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const delay = this.nextRequest - Date.now();
      if (delay > 0) await wait(delay);
      this.nextRequest = Date.now() + this.intervalMs;
      const response = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(12_000) });
      if (response.status === 429 || response.status >= 500) {
        if (attempt === 2) throw new Error(`TCGdex temporarily unavailable (${response.status})`);
        const seconds = Number(response.headers.get("retry-after"));
        await wait(Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 60_000) : 2000 * (attempt + 1));
        continue;
      }
      if (!response.ok) throw new Error(`TCGdex returned HTTP ${response.status}`);
      return await response.json() as T;
    }
    throw new Error("TCGdex request exhausted");
  }

  async fetchSets(): Promise<CatalogSet[]> {
    const briefs = await this.get<SetBrief[]>("/sets");
    if (!Array.isArray(briefs)) throw new Error("Invalid TCGdex set list");
    return briefs.filter((brief) => !!brief.id && !!brief.name).map((brief) => ({
      sourceId: brief.id, code: brief.id, name: brief.name, series: null,
      releaseDate: null, officialCount: null,
    }));
  }

  async fetchCardsBySet(set: CatalogSet): Promise<CardBrief[]> {
    const data = await this.get<SetDetail>(`/sets/${encodeURIComponent(set.sourceId)}`);
    if (!Array.isArray(data.cards)) throw new Error(`Missing card list in set ${set.sourceId}`);
    set.series = data.serie?.name ?? null;
    set.releaseDate = data.releaseDate ?? null;
    set.officialCount = data.cardCount?.official ?? null;
    return data.cards.filter((card): card is CardBrief => typeof card.id === "string" && !!card.id);
  }

  normalizeCard(raw: unknown, set: CatalogSet): CatalogCard {
    if (!raw || typeof raw !== "object") throw new Error("Invalid card detail");
    const detail = raw as CardDetail;
    const number = String(detail.localId ?? "").trim();
    if (!detail.id || !detail.name?.trim() || !number || !/^[\w-]{1,24}$/u.test(number)) {
      throw new Error(`Incomplete card detail in ${set.code}`);
    }
    return {
      externalId: detail.id, set, name: detail.name.trim(), collectorNumber: number,
      rarity: detail.rarity ?? null, language: "ja", variantCode: "standard",
      variantAttributes: { ...(detail.variants ?? {}), detailed: detail.variants_detailed ?? [] },
      // Store only a reference. Artwork rights are not established.
      imageUrl: detail.image?.startsWith("https://assets.tcgdex.net/") ? detail.image : null,
    };
  }

  async fetchCard(id: string, set: CatalogSet): Promise<CatalogCard> {
    return this.normalizeCard(await this.get<CardDetail>(`/cards/${encodeURIComponent(id)}`), set);
  }

  async *fetchCards(): AsyncIterable<CatalogCard> {
    for (const set of await this.fetchSets()) {
      for (const { id } of await this.fetchCardsBySet(set)) yield await this.fetchCard(id, set);
    }
  }

  // TCGdex does not publish a reliable per-card update cursor.
  // Compare normalized data on each manual sync instead of trusting a stale cursor.
  fetchUpdatedCards(_since: Date | null): AsyncIterable<CatalogCard> { return this.fetchCards(); }
}