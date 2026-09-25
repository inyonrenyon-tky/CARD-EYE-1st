import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PriceChart, type ChartSource } from '@/variants/playful/components/PriceChart';
import { CardThumbnail } from '@/variants/playful/components/CardThumbnail';
import { useColors } from '@/hooks/useColors';
import { designTokens } from '@/variants/playful/design-tokens';
import { useSavedCards } from '@/hooks/SavedCardsContext';
import {
  useAnalyzeMarket,
  type MarketAnalysis,
} from '@workspace/api-client-react';

const DISCLAIMER =
  'CARD EYEの分析は、取得できた価格データ・市場情報・画像状態分析をもとに判断材料を提供するもので、将来の価格や売却結果を保証するものではありません。';

const indicatorRows: Array<{ key: keyof MarketAnalysis['indicators']; label: string }> = [
  { key: 'priceLevel', label: '価格水準' },
  { key: 'shortTermTrend', label: '短期トレンド' },
  { key: 'volatility', label: '価格変動' },
  { key: 'activity', label: '取引状況' },
  { key: 'condition', label: 'カード状態' },
  { key: 'marketInfo', label: '市場情報' },
];

function formatYen(value: number | null | undefined) {
  return value == null ? 'データなし' : `¥${Math.round(value).toLocaleString('ja-JP')}`;
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return 'データなし';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)}%`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '確認できる日付はありません';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '確認できる日付はありません'
    : date.toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function confidenceLabel(value: MarketAnalysis['dataConfidence']) {
  switch (value) {
    case 'high': return '高';
    case 'medium': return '中';
    case 'low': return '低';
    case 'insufficient': return '不十分';
  }
}

export default function SellTimingAnalysisScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { savedCardId } = useLocalSearchParams<{ savedCardId?: string }>();
  const { cards, isLoaded, loadError } = useSavedCards();
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const card = cards.find((item) => item.id === savedCardId);
  const market = useAnalyzeMarket();
  const cardId = card?.catalogCardId
    ?? card?.number.match(/(?:^|\s)(\d{1,4}\/[\w-]{2,25})$/i)?.[1]
    ?? null;
  const condition = card?.conditionAnalysis ?? null;

  const requestPayload = useMemo(() => {
    if (!card || !card.name.trim() || !cardId) return null;
    return { cardId, name: card.name, condition };
  }, [card, cardId, condition]);

  const submitAnalysis = () => {
    if (requestPayload) market.mutate({ data: requestPayload });
  };

  useEffect(() => {
    if (requestPayload && !market.data && !market.error && !market.isPending) {
      market.mutate({ data: requestPayload });
    }
  }, [requestPayload, market.data, market.error, market.isPending, market.mutate]);

  const analysis = market.data;
  const chartSources = useMemo<ChartSource[]>(() => {
    if (!analysis?.history?.length) return [];
    const asOf = analysis.dataAsOf ? new Date(analysis.dataAsOf).getTime() : Date.now();
    const cutoff = asOf - period * 24 * 60 * 60 * 1000;
    const history = analysis.history
      .filter((point) => {
        const pointTime = new Date(point.date).getTime();
        return Number.isFinite(pointTime) && pointTime >= cutoff && pointTime <= asOf;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    if (!history.length) return [];
    return [{ source: 'sale-history', displayName: '確認済み成約', history, type: 'sale' }];
  }, [analysis, period]);

  const baseTop = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const baseBottom = Platform.OS === 'web' ? Math.max(insets.bottom, 34) : insets.bottom;

  const renderMetric = (label: string, value: string, tone?: string) => (
    <View key={label} style={[styles.metric, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: tone ?? colors.foreground }]}>{value}</Text>
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: baseTop + 10 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="戻る"
          testID="sell-timing-analysis-back"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 }]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>CARD EYE · MARKET INSIGHT</Text>
          <Text style={[styles.topTitle, { color: colors.foreground }]}>売り時分析</Text>
        </View>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: baseBottom + 30 }]}
        showsVerticalScrollIndicator={false}
      >
        {!isLoaded ? (
          <View style={[styles.noticeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>保存したカードを読み込み中...</Text>
          </View>
        ) : loadError ? (
          <View style={[styles.noticeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.bodyText, { color: colors.destructive }]}>{loadError}</Text>
          </View>
        ) : !card ? (
          <View style={[styles.noticeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="alert-circle" size={19} color={colors.warning} />
            <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>保存したカードが見つかりません。カード詳細からもう一度お試しください。</Text>
          </View>
        ) : (
          <>
            <View style={[styles.identityCard, { backgroundColor: colors.card, borderColor: colors.foreground }]}>
              <View style={styles.identityImage}>
                <CardThumbnail
                  compact
                  card={{
                    name: card.name,
                    number: card.number,
                    series: card.series,
                    rarity: card.rarity,
                    cardId: card.catalogCardId,
                  }}
                />
              </View>
              <View style={styles.identityCopy}>
                <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={2}>{card.name}</Text>
                <Text style={[styles.cardNumber, { color: colors.mutedForeground }]}>{card.number}</Text>
              </View>
            </View>

            {market.isPending ? (
              <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="loader" size={18} color={colors.primary} />
                <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>価格・市場情報を確認しています...</Text>
              </View>
            ) : market.error ? (
              <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.destructive }]}>
                <Feather name="alert-triangle" size={18} color={colors.destructive} />
                <View style={styles.stateCopy}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>分析を取得できませんでした</Text>
                  <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
                    {market.error instanceof Error ? market.error.message : '通信に失敗しました。時間をおいて再試行してください。'}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    testID="sell-analysis-retry"
                    onPress={submitAnalysis}
                    style={[styles.retryButton, { backgroundColor: colors.primary }]}
                  >
                    <Text style={[styles.retryText, { color: colors.primaryForeground }]}>再試行</Text>
                  </Pressable>
                </View>
              </View>
            ) : !cardId || !card.name.trim() ? (
              <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="info" size={18} color={colors.warning} />
                <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
                  有効なカード名とカード番号（例：123/190）が必要なため、市場分析を取得できません。
                </Text>
              </View>
            ) : !analysis ? (
              <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="info" size={18} color={colors.primary} />
                <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>分析データがありません。カードの市場データが確認できると、ここに表示されます。</Text>
                <Pressable
                  accessibilityRole="button"
                  testID="sell-analysis-load"
                  onPress={submitAnalysis}
                  style={[styles.retryButton, { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.retryText, { color: colors.primaryForeground }]}>分析を取得</Text>
                </Pressable>
              </View>
            ) : (
              <>
                  <View style={[styles.heroCard, { backgroundColor: colors.accent, borderColor: colors.foreground }]}>
                  <View style={styles.heroTopline}>
                    <View style={[styles.liveDot, { backgroundColor: analysis.currentPrice == null ? colors.mutedForeground : colors.positive }]} />
                    <Text style={[styles.heroLabel, { color: colors.mutedForeground }]}>現在の参考価格</Text>
                    <View style={[styles.basisPill, { backgroundColor: colors.accent }]}>
                      <Text style={[styles.basisText, { color: colors.secondaryForeground }]}>
                        {analysis.currentPriceBasis === 'SALE' ? 'SALE · 成約価格' : analysis.currentPriceBasis === 'LISTING' ? 'LISTING · 販売価格' : '価格基準なし'}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.heroPrice, { color: analysis.currentPrice == null ? colors.mutedForeground : colors.foreground }]}>
                    {formatYen(analysis.currentPrice)}
                  </Text>
                  <View style={[styles.heroDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.heroMetricRow}>
                    <View style={styles.heroMetric}>
                      <Text style={[styles.heroMetricLabel, { color: colors.mutedForeground }]}>90日平均</Text>
                      <Text style={[styles.heroMetricValue, { color: colors.foreground }]}>{formatYen(analysis.average90d)}</Text>
                    </View>
                    <View style={[styles.heroMetricSeparator, { backgroundColor: colors.border }]} />
                    <View style={styles.heroMetric}>
                      <Text style={[styles.heroMetricLabel, { color: colors.mutedForeground }]}>90日平均比</Text>
                      <Text style={[
                        styles.heroMetricValue,
                        { color: analysis.deviationFrom90d == null ? colors.mutedForeground : analysis.deviationFrom90d >= 0 ? colors.positive : colors.destructive },
                      ]}>
                        {formatPercent(analysis.deviationFrom90d)}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.metricsGrid}>
                  {renderMetric('7日平均', formatYen(analysis.average7d))}
                  {renderMetric('30日平均', formatYen(analysis.average30d))}
                  {renderMetric('7日変化', formatPercent(analysis.change7d), analysis.change7d == null ? undefined : analysis.change7d >= 0 ? colors.positive : colors.destructive)}
                  {renderMetric('30日変化', formatPercent(analysis.change30d), analysis.change30d == null ? undefined : analysis.change30d >= 0 ? colors.positive : colors.destructive)}
                  {renderMetric('価格変動率', formatPercent(analysis.volatilityPercent))}
                  {renderMetric('取引数 · 7 / 30 / 90日', `${analysis.volume7d} / ${analysis.volume30d} / ${analysis.volume90d}件`)}
                </View>

                <View style={styles.section}>
                  <View style={styles.sectionHeading}>
                    <View>
                      <Text style={[styles.sectionEyebrow, { color: colors.primary }]}>PRICE HISTORY</Text>
                      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>価格推移グラフ</Text>
                    </View>
                    <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>成約履歴</Text>
                  </View>
                  <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                     <View style={[styles.periodToggle, { backgroundColor: colors.lavender }]}>
                      {([7, 30, 90] as const).map((days) => (
                        <Pressable
                          key={days}
                          accessibilityRole="tab"
                          accessibilityState={{ selected: period === days }}
                          testID={`sell-analysis-period-${days}`}
                          onPress={() => setPeriod(days)}
                          style={[styles.periodButton, period === days && { backgroundColor: colors.primary }]}
                        >
                          <Text style={[styles.periodText, { color: period === days ? colors.primaryForeground : colors.mutedForeground }]}>{days}日</Text>
                        </Pressable>
                      ))}
                    </View>
                    {chartSources.length ? (
                      <PriceChart sources={chartSources} periodDays={period} />
                    ) : (
                      <View style={styles.chartEmpty}>
                        <Feather name="activity" size={20} color={colors.mutedForeground} />
                        <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
                          選択期間に確認できる成約履歴はありません
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.section}>
                  <View style={styles.sectionHeading}>
                    <View>
                      <Text style={[styles.sectionEyebrow, { color: colors.primary }]}>CARD EYE</Text>
                      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>CARD EYEの分析</Text>
                    </View>
                    <View style={[styles.confidencePill, { backgroundColor: colors.secondary }]}>
                      <Text style={[styles.confidenceText, { color: colors.secondaryForeground }]}>確信度 {confidenceLabel(analysis.dataConfidence)}</Text>
                    </View>
                  </View>
                  <View style={[styles.indicatorList, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {indicatorRows.map((item, index) => (
                      <View key={item.key} style={[
                        styles.indicatorRow,
                        index < indicatorRows.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                      ]}>
                        <Text style={[styles.indicatorLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
                        <Text style={[styles.indicatorValue, { color: colors.foreground }]}>{analysis.indicators[item.key]}</Text>
                      </View>
                    ))}
                  </View>
                  {analysis.confidenceReasons.length > 0 ? (
                      <View style={[styles.subtlePanel, { backgroundColor: colors.overlay }]}>
                      <Text style={[styles.panelLabel, { color: colors.mutedForeground }]}>データの確信度について</Text>
                      {analysis.confidenceReasons.map((reason, index) => (
                        <Text key={`${index}-${reason}`} style={[styles.bodyText, { color: colors.foreground }]}>・{reason}</Text>
                      ))}
                    </View>
                  ) : null}
                </View>

                <View style={styles.section}>
                  <Text style={[styles.sectionEyebrow, { color: colors.primary }]}>MARKET CONTEXT</Text>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>市場情報</Text>
                  <View style={[styles.infoPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.bodyText, { color: colors.foreground }]}>
                      {analysis.conditionSummary || '保存された画像状態の分析はありません。'}
                    </Text>
                    {analysis.marketEvents.length > 0 ? (
                      <View style={[styles.infoDivider, { backgroundColor: colors.border }]}>
                        {analysis.marketEvents.map((event, index) => (
                          <View key={`${event.observedAt}-${index}`} style={styles.eventRow}>
                            <Feather name="calendar" size={14} color={colors.primary} />
                            <View style={styles.eventCopy}>
                              <Text style={[styles.eventTitle, { color: colors.foreground }]}>{event.title}</Text>
                              <Text style={[styles.eventMeta, { color: colors.mutedForeground }]}>{event.source} · {formatDate(event.observedAt)}</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : (
                      <Text style={[styles.eventMeta, { color: colors.mutedForeground }]}>関連する市場イベントは確認できていません。</Text>
                    )}
                    <View style={[styles.infoDivider, { backgroundColor: colors.border }]}>
                      <Text style={[styles.panelLabel, { color: colors.mutedForeground }]}>データソース</Text>
                      <Text style={[styles.bodyText, { color: colors.foreground }]}>
                        {analysis.dataSources.length ? analysis.dataSources.join(' · ') : '利用可能なデータソースはありません'}
                      </Text>
                      <Text style={[styles.eventMeta, { color: colors.mutedForeground }]}>データ基準日時 · {formatDate(analysis.dataAsOf)}</Text>
                      <Text style={[styles.eventMeta, { color: colors.mutedForeground }]}>分析日時 · {formatDate(analysis.calculatedAt)}</Text>
                    </View>
                    <View style={[styles.availabilityList, { borderTopColor: colors.border }]}>
                      <Text style={[styles.panelLabel, { color: colors.mutedForeground }]}>ソースの取得状況</Text>
                      {analysis.sourceAvailability.length ? analysis.sourceAvailability.map((source, index) => (
                        <Text key={`${source.source}-${source.priceType}-${index}`} style={[styles.eventMeta, { color: colors.mutedForeground }]}>
                          {source.source} · {source.priceType} · {source.status === 'available' ? '取得可能' : source.status === 'no_data' ? 'データなし' : '利用不可'}
                          {source.reason ? ` — ${source.reason}` : ''}
                        </Text>
                      )) : (
                        <Text style={[styles.eventMeta, { color: colors.mutedForeground }]}>ソース状況はありません。</Text>
                      )}
                    </View>
                  </View>
                </View>

                <View style={styles.section}>
                  <Text style={[styles.sectionEyebrow, { color: colors.primary }]}>SUMMARY</Text>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>判断材料まとめ</Text>
                  <View style={[styles.summaryCard, { backgroundColor: colors.accent, borderColor: colors.border }]}>
                    <Feather name="align-left" size={17} color={colors.primary} />
                    <Text style={[styles.summaryText, { color: colors.foreground }]}>{analysis.analysisSummary || '確認できる情報がありません。'}</Text>
                    {analysis.aiExplanation ? (
                      <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>{analysis.aiExplanation}</Text>
                    ) : null}
                  </View>
                  {analysis.methodology ? (
                    <Text style={[styles.methodology, { color: colors.mutedForeground }]}>{analysis.methodology}</Text>
                  ) : null}
                </View>
              </>
            )}

          </>
        )}
        <View style={[styles.disclaimerCard, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
          <Feather name="alert-circle" size={17} color={colors.warning} />
          <Text style={[styles.disclaimerText, { color: colors.foreground }]}>{DISCLAIMER}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { minHeight: 82, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10 },
  backButton: { width: 42, height: 42, borderWidth: 2, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  headerTitleWrap: { flex: 1, alignItems: 'center', gap: 3 },
  eyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
  topTitle: { fontSize: 19, fontWeight: '800' },
  content: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 10, gap: 24 },
  identityCard: { width: '100%', borderWidth: 2, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 15, shadowColor: designTokens.shadows.soft.shadowColor, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 3, height: 3 }, elevation: 3 },
  identityImage: { width: 54, height: 74, borderRadius: 9, overflow: 'hidden' },
  identityCopy: { flex: 1, gap: 4 },
  cardName: { fontSize: 16, fontWeight: '700' },
  cardNumber: { fontSize: 12 },
  heroCard: { width: '100%', borderWidth: 2, borderRadius: 22, padding: 22, overflow: 'hidden', shadowColor: designTokens.shadows.soft.shadowColor, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 4, height: 4 }, elevation: 4 },
  heroTopline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  heroLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  basisPill: { borderRadius: 30, paddingHorizontal: 10, paddingVertical: 6 },
  basisText: { fontSize: 10, fontWeight: '700' },
  heroPrice: { fontSize: 38, lineHeight: 49, fontWeight: '800', letterSpacing: -1, marginTop: 9 },
  heroDivider: { height: StyleSheet.hairlineWidth, marginVertical: 15 },
  heroMetricRow: { flexDirection: 'row', alignItems: 'center' },
  heroMetric: { flex: 1, gap: 5 },
  heroMetricSeparator: { width: StyleSheet.hairlineWidth, height: 38, marginHorizontal: 14 },
  heroMetricLabel: { fontSize: 11, fontWeight: '600' },
  heroMetricValue: { fontSize: 18, fontWeight: '800' },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { flexGrow: 1, flexBasis: '30%', minWidth: '30%', borderWidth: 2, borderRadius: 15, padding: 14, gap: 7 },
  metricLabel: { fontSize: 10, fontWeight: '600' },
  metricValue: { fontSize: 14, fontWeight: '700' },
  section: { width: '100%', gap: 11 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 },
  sectionEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.4, marginBottom: 3 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  sectionCaption: { fontSize: 11, marginBottom: 2 },
  chartCard: { width: '100%', borderWidth: 2, borderRadius: 19, padding: 16, gap: 14, shadowColor: designTokens.shadows.soft.shadowColor, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 3, height: 3 }, elevation: 3 },
  periodToggle: { width: '100%', flexDirection: 'row', borderRadius: 12, padding: 4 },
  periodButton: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 9 },
  periodText: { fontSize: 12, fontWeight: '700' },
  chartEmpty: { minHeight: 125, alignItems: 'center', justifyContent: 'center', gap: 10 },
  confidencePill: { borderRadius: 30, paddingHorizontal: 10, paddingVertical: 6 },
  confidenceText: { fontSize: 10, fontWeight: '700' },
  indicatorList: { borderWidth: 2, borderRadius: 16, paddingHorizontal: 14 },
  indicatorRow: { minHeight: 50, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  indicatorLabel: { fontSize: 12, fontWeight: '600' },
  indicatorValue: { flex: 1, fontSize: 12, lineHeight: 18, textAlign: 'right' },
  subtlePanel: { borderRadius: 14, padding: 13, gap: 6 },
  panelLabel: { fontSize: 10, fontWeight: '700', marginBottom: 3 },
  infoPanel: { borderWidth: 2, borderRadius: 19, padding: 16, gap: 12 },
  bodyText: { fontSize: 12, lineHeight: 19 },
  infoDivider: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 8 },
  eventRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  eventCopy: { flex: 1, gap: 3 },
  eventTitle: { fontSize: 12, fontWeight: '700', lineHeight: 17 },
  eventMeta: { fontSize: 10, lineHeight: 16 },
  availabilityList: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 5 },
  summaryCard: { borderWidth: 2, borderRadius: 19, padding: 17, gap: 10 },
  summaryText: { fontSize: 14, lineHeight: 22, fontWeight: '600' },
  methodology: { fontSize: 10, lineHeight: 16 },
  stateCard: { width: '100%', borderWidth: 1, borderRadius: 17, padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  stateCopy: { flex: 1, gap: 8 },
  noticeCard: { width: '100%', borderWidth: 1, borderRadius: 16, padding: 16 },
  retryButton: { alignSelf: 'flex-start', borderRadius: 11, paddingHorizontal: 15, paddingVertical: 10, marginTop: 3 },
  retryText: { fontSize: 12, fontWeight: '700' },
  disclaimerCard: { width: '100%', borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 3 },
  disclaimerText: { flex: 1, fontSize: 11, lineHeight: 17, fontWeight: '600' },
});