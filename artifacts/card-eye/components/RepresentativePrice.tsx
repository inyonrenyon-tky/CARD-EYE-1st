import { Feather } from '@expo/vector-icons';
import { getGetCardPricesQueryKey, useGetCardPrices, type RepresentativeMarketPrice } from '@workspace/api-client-react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { useColors } from '@/hooks/useColors';

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export function useRepresentativePrice(
  cardId: string | null | undefined,
  cardNumber: string | null | undefined,
  name: string | null | undefined,
  series?: string | null,
  rarity?: string | null,
) {
  const id = cardId && uuidPattern.test(cardId)
    ? cardId
    : cardNumber || (series && cardId ? cardId : '');
  const params = { period: 30 as const, demo: false, name: name ?? '', ...(series ? { series } : {}), ...(rarity ? { rarity } : {}) };
  return useGetCardPrices(encodeURIComponent(id), params, {
    query: {
      queryKey: getGetCardPricesQueryKey(encodeURIComponent(id), params),
      enabled: !!id && !!name?.trim(),
      staleTime: 5 * 60 * 1000,
    },
  });
}

export function representativePriceLabel(price: RepresentativeMarketPrice | undefined): string {
  if (price?.evidenceType === 'ai_research') return 'CARD EYE AI参考価格';
  return price?.price != null && (price.confidenceLabel === 'high' || price.confidenceLabel === 'medium')
    ? 'CARD EYE 市場価格'
    : 'CARD EYE 参考価格';
}

function confidenceText(label: RepresentativeMarketPrice['confidenceLabel']) {
  if (label === 'high') return '高';
  if (label === 'medium') return '中';
  if (label === 'low') return '低';
  return 'データ不足';
}

function methodText(method: RepresentativeMarketPrice['calculationMethod'], evidenceType: RepresentativeMarketPrice['evidenceType']) {
  const methodName = String(method ?? '');
  const evidence = String(evidenceType ?? '');
  const auction = evidence === 'auction_closed';
  switch (methodName) {
    case 'recent_sales_median': return auction ? '直近観測価格中央値' : '直近成約中央値';
    case 'extended_sales_median': return auction ? '拡張期間観測価格中央値' : '拡張期間成約中央値';
    case 'sales_plus_shop': return auction ? '観測価格・店舗参考情報' : '成約・店舗参考情報';
    case 'shop_median': return '店舗掲載中央値';
    case 'limited_market_estimate': return '限定データ参考値';
    case 'observed_market_median': return '実観測価格中央値';
    case 'ai_estimate': return 'AIによる参考推定';
    default: return '算出方法未設定';
  }
}

function conditionText(condition: RepresentativeMarketPrice['condition']) {
  switch (String(condition)) {
    case 'beautiful_ungraded': return '美品・未鑑定';
    case 'ai_estimated': return 'AI推定・未鑑定';
    case 'condition_unverified':
    default: return '状態未確認・未鑑定';
  }
}

function unavailableText(error: boolean) {
  return error
    ? '価格を取得できません。時間をおいて再試行してください。'
    : '価格を調査できませんでした。時間をおいて再試行してください。';
}

function dateText(value: string | null, calculatedAt: string) {
  const observedAt = value ?? calculatedAt;
  if (!observedAt) return '更新日時未確認';
  const date = new Date(observedAt);
  if (Number.isNaN(date.getTime())) return '更新日時未確認';
  return `${value ? '最終確認' : '更新'} ${date.toLocaleDateString('ja-JP')}`;
}

export function RepresentativePrice({
  price,
  isLoading = false,
  error = false,
  onPress,
  detailed = false,
}: {
  price?: RepresentativeMarketPrice;
  isLoading?: boolean;
  error?: boolean;
  onPress?: () => void;
  detailed?: boolean;
}) {
  const colors = useColors();
  const displayLabel = representativePriceLabel(price);
  const hasPrice = !!price && price.price != null && Number.isFinite(price.price) && price.price > 0;
  const content = (
    <>
      <View style={styles.headingRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.primary }]}>{displayLabel}</Text>
          {hasPrice ? <Text style={[styles.condition, { color: colors.mutedForeground }]}>{conditionText(price!.condition)}</Text> : null}
        </View>
        {onPress ? <Feather name="chevron-right" size={18} color={colors.mutedForeground} /> : null}
      </View>
      <Text style={[styles.value, { color: hasPrice ? colors.foreground : colors.mutedForeground }]}>
        {isLoading ? '価格を算出中...' : hasPrice ? `¥${price!.price!.toLocaleString('ja-JP')}` : '取得できません'}
      </Text>
      {hasPrice ? (
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          確信度 {confidenceText(price!.confidenceLabel)} · {dateText(price!.lastObservedAt, price!.calculatedAt)}
        </Text>
      ) : null}
      {detailed && hasPrice ? (
        <View style={styles.details}>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            算出方法：{methodText(price!.calculationMethod, price!.evidenceType)} · 対象期間：{price!.windowDays ?? '—'}日 · 標本数：{price!.sampleCount}件
          </Text>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            出典：{price!.sourceNames.length ? price!.sourceNames.join('、') : '未確認'} · 根拠：{String(price!.evidenceType) === 'verified_sale' ? '確認済み成約' : String(price!.evidenceType) === 'auction_closed' ? '終了オークション（落札・成約未確認）' : String(price!.evidenceType) === 'shop_listing' ? '店舗掲載' : String(price!.evidenceType) === 'ai_research' ? 'AI検索・推定（成約未確認）' : '未確認'}
          </Text>
          {price!.rangeMin != null && price!.rangeMax != null ? (
            <Text style={[styles.meta, { color: colors.mutedForeground }]}>
              {price!.evidenceType === 'ai_research' ? 'AI推定価格幅' : '参考データ範囲'} ¥{price!.rangeMin.toLocaleString('ja-JP')}〜¥{price!.rangeMax.toLocaleString('ja-JP')}
            </Text>
          ) : null}
          {price!.confidenceLabel === 'medium' || price!.confidenceLabel === 'low' || price!.confidenceLabel === 'insufficient' ? (
            <Text style={[styles.note, { color: colors.mutedForeground }]}>
              {price!.note || 'データ件数や出典に制約がある参考値です。実物の状態確認・売買価格・査定額を保証しません。'}
            </Text>
          ) : null}
        </View>
      ) : null}
      {!detailed && hasPrice ? (
        <View style={styles.details}>
          <Text style={[styles.meta, { color: colors.mutedForeground }]} numberOfLines={2}>
            出典：{price!.sourceNames.length ? price!.sourceNames.join('、') : '未確認'}
          </Text>
          {price!.confidenceLabel === 'medium' || price!.confidenceLabel === 'low' ? (
            <Text style={[styles.note, { color: colors.mutedForeground }]} numberOfLines={2}>
              {price!.note || 'データに制約がある参考値です。'}
            </Text>
          ) : null}
        </View>
      ) : null}
      {!isLoading && !hasPrice ? <Text style={[styles.meta, { color: error ? colors.destructive : colors.mutedForeground }]}>{unavailableText(error)}</Text> : null}
      {onPress ? (
        <View style={styles.cta}>
          <Text style={[styles.ctaText, { color: colors.primary }]}>詳しい相場を見る</Text>
          <Feather name="arrow-up-right" size={14} color={colors.primary} />
        </View>
      ) : null}
    </>
  );

  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel="詳しい相場を見る" onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.82 : 1 }]}>
      {content}
    </Pressable>
  ) : (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>{content}</View>
  );
}

export function CompactRepresentativePrice({
  cardId,
  cardNumber,
  name,
  rarity,
  series,
  style,
}: {
  cardId?: string | null;
  cardNumber?: string | null;
  name: string;
  rarity?: string | null;
  series?: string | null;
  style?: StyleProp<TextStyle>;
}) {
  const colors = useColors();
  const query = useRepresentativePrice(cardId, cardNumber, name, series, rarity);
  const price = query.data?.representative;
  const displayLabel = representativePriceLabel(price);
  const hasPrice = price?.price != null && Number.isFinite(price.price) && price.price > 0;
  return (
    <View style={{ gap: 1 }}>
      <Text numberOfLines={1} style={[{ fontSize: 9, fontWeight: '700', color: hasPrice ? colors.foreground : colors.mutedForeground }, style]}>
        {displayLabel}
      </Text>
      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: hasPrice ? colors.foreground : colors.mutedForeground }}>
        {query.isLoading ? '価格を算出中...' : hasPrice ? `¥${price!.price!.toLocaleString('ja-JP')}` : '取得できません'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', borderWidth: 1, borderRadius: 16, padding: 14, gap: 5 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 12, fontWeight: '700' },
  condition: { fontSize: 10, marginTop: 2 },
  value: { fontSize: 25, fontWeight: '700', letterSpacing: -0.4 },
  meta: { fontSize: 10, lineHeight: 15 },
  details: { gap: 4, marginTop: 6 },
  note: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 6, minHeight: 28 },
  ctaText: { fontSize: 12, fontWeight: '700' },
});