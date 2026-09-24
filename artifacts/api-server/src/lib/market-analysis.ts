import type { ConditionAnalysis } from "@workspace/integrations-openai-ai-server";
import { median } from "./price-domain";
import type { MarketPriceSnapshot, PriceObservation } from "./market-price-provider";

const DAY = 86_400_000;
const roundOne = (value: number) => Math.round(value * 10) / 10;
const yen = (value: number) => `¥${value.toLocaleString("ja-JP")}`;
const percent = (value: number) => `${value > 0 ? "+" : ""}${roundOne(value)}%`;

function average(items: PriceObservation[]): number | null {
  return items.length >= 2 ? Math.round(items.reduce((sum, item) => sum + item.price, 0) / items.length) : null;
}
function difference(current: number | null, previous: number | null): number | null {
  return current !== null && previous !== null && previous > 0
    ? roundOne((current - previous) / previous * 100) : null;
}

function describeCondition(condition: ConditionAnalysis | null): string | null {
  if (!condition) return null;
  if (condition.imageQuality === "unusable" || condition.retakeRecommended) {
    return "画像品質が十分でないため、カード状態は判断できません。";
  }
  const labels = [
    ["whitening", "白かけ"], ["corners", "角"], ["edges", "エッジ"],
    ["scratches", "傷"], ["surface", "表面"], ["centering", "センタリング"],
  ] as const;
  const severity: Record<string, string> = {
    minor: "軽微な", moderate: "中程度の", significant: "目立つ",
  };
  for (const [key, label] of labels) {
    const finding = condition[key];
    if (severity[finding.status]) return `${label}に${severity[finding.status]}所見がある可能性があります。`;
  }
  return "画像で確認できた範囲に限る状態判定です。見えない部分は判断できません。";
}

export function calculateMarketAnalysis(
  cardId: string,
  snapshot: MarketPriceSnapshot,
  condition: ConditionAnalysis | null,
  now = new Date(),
) {
  const currentTime = now.getTime();
  const valid = snapshot.observations.filter((item) => {
    const time = Date.parse(item.observedAt);
    return item.cardId === cardId && item.currency === "JPY" &&
      Number.isFinite(item.price) && item.price > 0 && Number.isFinite(time) &&
      time <= currentTime && time >= currentTime - 90 * DAY;
  });
  const sales = valid.filter((item) => item.priceType === "SALE")
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const listings = valid.filter((item) => item.priceType === "LISTING")
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  const within = (days: number) => sales.filter((item) => Date.parse(item.observedAt) >= currentTime - days * DAY);
  const recent7 = within(7);
  const recent30 = within(30);
  const recent90 = sales;
  const previous7 = sales.filter((item) => {
    const time = Date.parse(item.observedAt);
    return time >= currentTime - 14 * DAY && time < currentTime - 7 * DAY;
  });
  const previous30 = sales.filter((item) => {
    const time = Date.parse(item.observedAt);
    return time >= currentTime - 60 * DAY && time < currentTime - 30 * DAY;
  });
  const average7d = average(recent7);
  const average30d = average(recent30);
  const average90d = average(recent90);
  const currentSales = recent7.length >= 2 ? recent7 : recent30.length >= 2 ? recent30 : recent90;
  const currentSalePrice = median(currentSales.map((item) => item.price));
  const listing = listings[0] ?? null;
  const currentPrice = currentSalePrice ?? listing?.price ?? null;
  const currentPriceBasis = currentSalePrice !== null ? "SALE" as const : listing ? "LISTING" as const : null;
  const change7d = difference(average7d, average(previous7));
  const change30d = difference(average30d, average(previous30));
  const deviationFrom90d = currentPriceBasis === "SALE" ? difference(currentPrice, average90d) : null;
  const trendBasis = change30d ?? change7d;
  const trend = trendBasis === null ? "insufficient" as const
    : trendBasis > 3 ? "rising" as const : trendBasis < -3 ? "falling" as const : "stable" as const;
  const mean30 = average30d;
  const volatilityPercent = mean30 !== null && recent30.length >= 5
    ? roundOne(Math.sqrt(recent30.reduce((sum, item) => sum + (item.price - mean30) ** 2, 0) / recent30.length) / mean30 * 100)
    : null;
  const volumeChangePercent = previous7.length >= 2
    ? roundOne((recent7.length - previous7.length) / previous7.length * 100) : null;
  const lastSale = sales.at(-1)?.observedAt ?? null;
  const lastObserved = [...valid].sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0]?.observedAt ?? null;
  const saleAge = lastSale ? (currentTime - Date.parse(lastSale)) / DAY : Infinity;
  const coverageDays = sales.length ? (currentTime - Date.parse(sales[0].observedAt)) / DAY : 0;
  const sourceCount = new Set(sales.map((item) => item.source)).size;
  const dataConfidence = sales.length >= 20 && sourceCount >= 2 && saleAge <= 7 && coverageDays >= 75 && average7d !== null
    ? "high" as const
    : sales.length >= 10 && saleAge <= 14 && coverageDays >= 45 && average30d !== null
      ? "medium" as const
      : sales.length >= 3 && saleAge <= 30
        ? "low" as const : "insufficient" as const;
  const confidenceReasons: string[] = [];
  if (sales.length < 3) confidenceReasons.push("90日内に確認できた成約観測が3件未満");
  if (saleAge > 30) confidenceReasons.push("確認できた成約データが30日以上前、または存在しません");
  if (sourceCount < 2) confidenceReasons.push("成約データの情報源が1種類以下");
  if (coverageDays < 60) confidenceReasons.push("90日間全体を十分にカバーする観測がありません");
  if (average7d === null) confidenceReasons.push("7日平均を出すための観測が不足");
  if (average30d === null) confidenceReasons.push("30日平均を出すための観測が不足");
  if (change30d === null) confidenceReasons.push("前30日と比較できる観測が不足");
  const conditionSummary = describeCondition(condition);
  const priceLevel = deviationFrom90d === null
    ? "90日平均との比較はデータ不足"
    : `90日平均より${Math.abs(deviationFrom90d)}%${deviationFrom90d >= 0 ? "高い" : "低い"}`;
  const shortTermTrend = trend === "insufficient" ? "短期トレンドはデータ不足"
    : trend === "rising" ? "直近の成約価格は上昇傾向"
      : trend === "falling" ? "直近の成約価格は下落傾向" : "直近の成約価格は横ばい";
  const volatility = volatilityPercent === null ? "価格変動の比較はデータ不足"
    : volatilityPercent >= 15 ? "直近30日の価格変動が大きい" : "直近30日の価格変動は比較的小さい";
  const activity = volumeChangePercent === null ? "観測件数の比較はデータ不足"
    : volumeChangePercent > 10 ? "直近7日の観測件数が増加"
      : volumeChangePercent < -10 ? "直近7日の観測件数が減少" : "直近7日の観測件数はほぼ横ばい";
  const indicators = {
    priceLevel, shortTermTrend, volatility, activity,
    condition: conditionSummary ?? "保存されたCARD EYE状態判定はありません",
    marketInfo: "市場情報なし",
    reliability: ({ high: "十分", medium: "一定の観測あり", low: "限定的", insufficient: "データ不足" } as const)[dataConfidence],
  };
  const basis = currentPriceBasis === "SALE" ? "確認できた直近の成約中央値"
    : currentPriceBasis === "LISTING" ? "店頭の販売提示価格（成約価格ではありません）" : null;
  const facts = currentPrice === null
    ? "現在の参考価格はデータ不足です。"
    : `現在の参考価格は${yen(currentPrice)}（${basis}）です。`;
  const comparison = deviationFrom90d === null ? "90日平均との比較はデータ不足です。"
    : `過去90日平均${yen(average90d!)}に対し${percent(deviationFrom90d)}です。`;
  const analysisSummary = `${facts}${comparison}${shortTermTrend}。価格・観測件数・画像で確認できた状態を合わせて判断してください。`;
  return {
    cardId, currency: "JPY" as const, currentPrice, currentPriceBasis,
    average7d, average30d, average90d, change7d, change30d, deviationFrom90d,
    trend, volatilityPercent, volume7d: recent7.length, volume30d: recent30.length,
    volume90d: recent90.length, volumeChangePercent, conditionSummary,
    marketEvents: [] as Array<{ title: string; source: string; observedAt: string }>,
    dataConfidence, confidenceReasons, indicators, analysisSummary,
    aiExplanation: null as string | null, calculatedAt: now.toISOString(),
    dataAsOf: lastObserved, dataSources: [...new Set(valid.map((item) => item.source))],
    sourceAvailability: snapshot.sourceAvailability,
    history: sales.map((item) => ({ date: item.observedAt, price: item.price })),
    methodology: `${snapshot.methodology} 数値は確認できた成約観測からサーバーで計算。直近の成約中央値は7日（不足時30日、90日）を使用。7日/30日騰落率は直前の同じ日数の平均との比較。変動率は直近30日の標準偏差÷平均。`,
  };
}