import { getLiveCardPrices } from "./live-prices";

export type PriceObservation = {
  cardId: string;
  source: string;
  price: number;
  observedAt: string;
  currency: "JPY";
  priceType: "SALE" | "LISTING" | "BUYBACK";
};

export type MarketPriceSnapshot = {
  observations: PriceObservation[];
  sourceAvailability: Array<{
    source: string;
    priceType: "SALE" | "LISTING" | "BUYBACK";
    status: "available" | "no_data" | "unavailable";
    reason: string | null;
  }>;
  methodology: string;
};

export interface PriceProvider {
  getObservations(cardId: string, name: string): Promise<MarketPriceSnapshot>;
}

// Adapter over the existing live route. Demo fixtures are never used for market analysis.
// Its SALE history contains verified, outlier-filtered observations; current
// shop listings stay separately typed and never enter transaction averages.
export const liveMarketPriceProvider: PriceProvider = {
  async getObservations(cardId, name) {
    const live = await getLiveCardPrices(cardId, name, 90);
    const transactions: PriceObservation[] = live.sources.transactions.flatMap((source) =>
      source.history.map((point) => ({
        cardId, source: source.source, price: point.price, observedAt: point.date,
        currency: "JPY" as const, priceType: "SALE" as const,
      })),
    );
    const listings: PriceObservation[] = live.sources.sales.map((source) => ({
      cardId, source: source.source, price: source.price, observedAt: source.lastUpdated,
      currency: "JPY", priceType: "LISTING",
    }));
    return {
      observations: [...transactions, ...listings],
      sourceAvailability: live.sourceAvailability,
      methodology: live.methodology,
    };
  },
};