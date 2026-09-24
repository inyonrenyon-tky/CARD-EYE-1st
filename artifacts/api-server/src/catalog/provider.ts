export type CatalogSet = {
  sourceId: string;
  code: string;
  name: string;
  series: string | null;
  releaseDate: string | null;
  officialCount: number | null;
};

export type CatalogCard = {
  externalId: string;
  set: CatalogSet;
  name: string;
  collectorNumber: string;
  rarity: string | null;
  language: "ja";
  variantCode: string;
  variantAttributes: Record<string, unknown>;
  imageUrl: string | null;
};

export type SourceMetadata = {
  id: string;
  catalogLicense: string;
  imageRights: "requires_review";
  rateLimit: "undocumented";
  attribution: string;
};

export interface CardCatalogProvider {
  getSourceMetadata(): SourceMetadata;
  fetchSets(): Promise<CatalogSet[]>;
  fetchCardsBySet(set: CatalogSet): Promise<Array<{ id: string }>>;
  fetchCards(): AsyncIterable<CatalogCard>;
  fetchUpdatedCards(since: Date | null): AsyncIterable<CatalogCard>;
  normalizeCard(raw: unknown, set: CatalogSet): CatalogCard;
  fetchCard(id: string, set: CatalogSet): Promise<CatalogCard>;
}