export const ALERTS_STORAGE_KEY = 'card-eye:price-alerts:v1';
export const MAX_PRICE_ALERTS = 10;

export type PriceAlert = {
  id: string;
  savedCardId: string;
  cardName: string;
  cardNumber: string;
  basis: 'SALE' | 'LISTING';
  direction: 'above' | 'below';
  threshold: number;
  enabled: boolean;
  triggered: boolean;
  lastPrice: number | null;
  lastObservedAt: string | null;
  lastSource: string | null;
  triggeredAt: string | null;
};

export type PriceQuote = {
  price: number;
  observedAt: string;
  source: string;
};

export function parsePriceAlerts(raw: string | null): PriceAlert[] {
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length > MAX_PRICE_ALERTS) throw new Error('保存されたアラートの形式を確認できません。');
  return value.map((item): PriceAlert => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('保存されたアラートの形式を確認できません。');
    const rule = item as Partial<PriceAlert>;
    if (typeof rule.id !== 'string' || typeof rule.savedCardId !== 'string' ||
        typeof rule.cardName !== 'string' || typeof rule.cardNumber !== 'string' ||
        !['SALE', 'LISTING'].includes(rule.basis ?? '') ||
        !['above', 'below'].includes(rule.direction ?? '') ||
        !Number.isInteger(rule.threshold) || (rule.threshold ?? 0) < 1 || (rule.threshold ?? 0) > 100_000_000 ||
        typeof rule.enabled !== 'boolean' || typeof rule.triggered !== 'boolean' ||
        !(rule.lastPrice === null || typeof rule.lastPrice === 'number') ||
        !(rule.lastObservedAt === null || typeof rule.lastObservedAt === 'string') ||
        !(rule.lastSource === null || typeof rule.lastSource === 'string') ||
        !(rule.triggeredAt === null || typeof rule.triggeredAt === 'string')) {
      throw new Error('保存されたアラートの形式を確認できません。');
    }
    return rule as PriceAlert;
  });
}

export function evaluatePriceAlert(rule: PriceAlert, quote: PriceQuote | null, now = new Date()) {
  if (!rule.enabled || !quote || !Number.isFinite(quote.price) || quote.price <= 0) {
    return { rule, newlyTriggered: false, status: 'データ不足' as const };
  }
  const observed = Date.parse(quote.observedAt);
  const age = now.getTime() - observed;
  // A quote older than seven days is not a current price signal.
  if (!Number.isFinite(observed) || age < 0 || age > 7 * 86_400_000) {
    return { rule, newlyTriggered: false, status: '観測が古いため保留' as const };
  }
  const matches = rule.direction === 'above' ? quote.price >= rule.threshold : quote.price <= rule.threshold;
  const newlyTriggered = matches && !rule.triggered;
  return {
    rule: {
      ...rule,
      triggered: matches,
      triggeredAt: newlyTriggered ? now.toISOString() : matches ? rule.triggeredAt : null,
      lastPrice: quote.price,
      lastObservedAt: quote.observedAt,
      lastSource: quote.source,
    },
    newlyTriggered,
    status: matches ? '条件に到達' as const : '監視中' as const,
  };
}