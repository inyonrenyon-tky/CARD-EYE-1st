import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Defs, LinearGradient, Stop, Line, Text as SvgText, Circle } from 'react-native-svg';
import { CardThumbnail } from '@/components/CardThumbnail';
import { useColors } from '@/hooks/useColors';
import { useScan } from '@/hooks/ScanContext';
import { getGetCardPricesQueryKey, useGetCardPrices, type GetCardPricesPeriod, useSearchCardMarketWithAi, type AiMarketSearchResponse } from '@workspace/api-client-react';

function PriceChart({
  points,
  width,
  height = 180,
  strokeColor,
}: {
  points: { date: string; price: number }[];
  width: number;
  height?: number;
  strokeColor: string;
}) {
  const colors = useColors();
  if (!points || points.length === 0) return null;

  const prices = points.map((p) => p.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;

  const paddingVertical = 20;
  const axisWidth = 58;
  const rightPadding = 8;
  
  const innerWidth = width - axisWidth - rightPadding;
  const innerHeight = height - paddingVertical * 2;

  const getX = (index: number) => 
    points.length > 1 
      ? axisWidth + (index / (points.length - 1)) * innerWidth
      : axisWidth + innerWidth / 2;
      
  const getY = (price: number) => 
    paddingVertical + innerHeight - ((price - minPrice) / priceRange) * innerHeight;

  const pathData = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(p.price)}`)
    .join(' ');

  const areaPath = `${pathData} L ${getX(points.length - 1)} ${height} L ${getX(0)} ${height} Z`;

  return (
    <View style={{ width, height: height + 24 }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={strokeColor} stopOpacity="0.2" />
            <Stop offset="1" stopColor={strokeColor} stopOpacity="0.0" />
          </LinearGradient>
        </Defs>
        {[0, 0.5, 1].map((ratio, i) => (
          <Line
            key={i}
             x1={axisWidth}
            y1={paddingVertical + innerHeight * ratio}
            x2={width}
            y2={paddingVertical + innerHeight * ratio}
            stroke={colors.border}
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        ))}
         <SvgText x={0} y={paddingVertical + 4} fill={colors.mutedForeground} fontSize="10" fontWeight="600">
          {`¥${maxPrice.toLocaleString()}`}
        </SvgText>
         <SvgText x={0} y={height - paddingVertical + 4} fill={colors.mutedForeground} fontSize="10" fontWeight="600">
          {`¥${minPrice.toLocaleString()}`}
        </SvgText>
        
        <Path d={areaPath} fill="url(#gradient)" />
        <Path d={pathData} fill="none" stroke={strokeColor} strokeWidth="2.5" />
        
        <Circle 
          cx={getX(points.length - 1)} 
          cy={getY(points[points.length - 1].price)} 
          r="4" 
          fill={colors.background} 
          stroke={strokeColor} 
          strokeWidth="2" 
        />
      </Svg>
      
       <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: axisWidth, paddingRight: rightPadding, marginTop: 4 }}>
        <Text style={{ fontSize: 10, color: colors.mutedForeground }}>{formatChartDate(points[0].date)}</Text>
        <Text style={{ fontSize: 10, color: colors.mutedForeground }}>
          {points.length > 2 ? formatChartDate(points[Math.floor(points.length/2)].date) : ''}
        </Text>
        <Text style={{ fontSize: 10, color: colors.mutedForeground }}>{formatChartDate(points[points.length - 1].date)}</Text>
      </View>
    </View>
  );
}

function formatChartDate(dateStr: string) {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`;
  }
  return dateStr;
}

export default function MarketOverviewScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { uri: scanUri, scanId: activeScanId } = useScan();
  const { scanId: routeScanId, cardName, series, cardNumber, rarity, catalogCardId } = useLocalSearchParams<{
    scanId?: string;
    cardName?: string;
    series?: string;
    cardNumber?: string;
    rarity?: string;
    catalogCardId?: string;
  }>();
  const uri = routeScanId && routeScanId === activeScanId ? scanUri : undefined;

  const [aiResult, setAiResult] = useState<AiMarketSearchResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const requestedAi = useRef<string | null>(null);
  const searchMarketAi = useSearchCardMarketWithAi();

  const runAiSearch = async () => {
    if (!cardName || (!cardNumber && !series)) return;
    setIsAiLoading(true);
    setAiError(null);
    try {
      const res = await searchMarketAi.mutateAsync({
        data: {
          cardName,
          cardNumber: cardNumber || null,
          series: series || null,
          rarity: rarity || null,
        }
      });
      setAiResult(res);
    } catch (err) {
      setAiError('AIによる相場検索に失敗しました。');
    } finally {
      setIsAiLoading(false);
    }
  };

  const identityKey = `${cardName}|${cardNumber}|${series}|${rarity}`;
  useEffect(() => {
    if (!cardName || (!cardNumber && !series) || requestedAi.current === identityKey) return;
    requestedAi.current = identityKey;
    void runAiSearch();
  }, [identityKey, cardName]);

  const [period, setPeriod] = useState<GetCardPricesPeriod>(30);
  const legacyCardId = cardNumber?.match(/(?:^|\s)(\d{1,4}\/[\w-]{2,25})(?=\s|$)/i)?.[1];
  const cardId = catalogCardId || legacyCardId;
  const encodedId = cardId ? encodeURIComponent(cardId) : '';
  const priceQuery = { period, demo: false, name: cardName };
  const { data: prices, isLoading, error, refetch } = useGetCardPrices(encodedId, priceQuery, {
    request: { cache: 'no-store' },
    query: {
      enabled: !!cardId && !!cardName?.trim(),
      queryKey: getGetCardPricesQueryKey(encodedId, priceQuery),
    },
  });
  const points = useMemo(
    () => (prices?.sources.transactions ?? [])
      .flatMap((source) => source.history)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [prices],
  );
  const hasIdentity = !!cardId && !!cardName?.trim();
  const hasConfirmedMarketPrice = prices?.marketPrice != null
    && prices.marketPriceBasis === 'confirmed_ungraded_sales'
    && prices.summary.transactionCount >= 3;
  const confirmedMarketPrice = hasConfirmedMarketPrice ? prices.marketPrice : null;

  const baseTop = Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top;
  const baseBottom = Platform.OS === 'web' ? Math.max(insets.bottom, 34) : insets.bottom;

  const contentPadding = 20;
  const chartCardPadding = 16;
  const chartWidth = Math.min(width, 600) - contentPadding * 2 - chartCardPadding * 2;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: baseTop + 10 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="戻る"
          testID="market-overview-back-button"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.foreground }]}>市場相場</Text>
        <View style={styles.topSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: baseBottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.warningBanner, { backgroundColor: colors.warningSoft, borderColor: colors.warning }]}>
          <View style={styles.warningIconWrap}>
            <Feather name="alert-triangle" size={16} color={colors.warning} />
          </View>
          <View style={styles.warningTextWrap}>
            <Text style={[styles.warningText, { color: colors.warning }]}>
              AIがWebで調べた参考相場です。確認できた成約データは別枠に表示し、査定額とは区別します。
            </Text>
          </View>
        </View>

        <View style={styles.cardInfoRow}>
          <View style={[styles.cardImageWrap, { backgroundColor: colors.secondary }]}>
            <CardThumbnail
              card={{
                name: cardName || '不明',
                number: cardNumber || '不明',
                series: series || '',
                rarity: rarity || '',
                cardId: catalogCardId || null,
              }}
              scanImageUri={uri}
              scanId={uri ? routeScanId : null}
              tone="orange"
              compact
            />
          </View>
          <View style={styles.cardDetails}>
            <Text style={[styles.cardRarity, { color: colors.primary }]}>{rarity || 'UNKNOWN RARITY'}</Text>
            <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={2}>
              {cardName || 'カード名未確認'}
            </Text>
            <Text style={[styles.cardNumber, { color: colors.mutedForeground }]}>
              {cardNumber || '番号未確認'}
            </Text>
          </View>
        </View>

        <View style={styles.aiContainer}>
          <Text style={[styles.sectionHeading, { color: colors.foreground }]}>AI推定現在相場</Text>
          {isAiLoading ? (
            <View style={styles.aiLoadingWrap}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ color: colors.mutedForeground, marginTop: 8, fontSize: 13 }}>Webから最新の相場情報を検索しています...</Text>
            </View>
          ) : aiError ? (
            <View style={styles.aiErrorWrap}>
              <Text style={{ color: colors.destructive, fontSize: 13, marginBottom: 8 }}>{aiError}</Text>
              <Pressable accessibilityRole="button" onPress={runAiSearch} style={({ pressed }) => [styles.retryButton, { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 }]}>
                <Feather name="rotate-cw" size={14} color={colors.foreground} />
                <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: '600' }}>再試行</Text>
              </Pressable>
            </View>
          ) : aiResult ? (
            <>
              <View style={[styles.aiTable, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.aiTableRow, { backgroundColor: colors.secondary, borderBottomColor: colors.border }]}>
                  <Text style={[styles.aiTableCellLeft, { color: colors.mutedForeground }]}>指標</Text>
                  <Text style={[styles.aiTableCellRight, { color: colors.mutedForeground }]}>現在の目安</Text>
                </View>
                <View style={[styles.aiTableRow, { backgroundColor: colors.secondary, borderBottomColor: colors.border }]}>
                  <Text style={[styles.aiTableCellLeft, { color: colors.foreground, fontWeight: '700' }]}>市場価格（基準値）</Text>
                  <Text style={[styles.aiTableCellRight, { color: colors.primary, fontSize: 21 }]}>
                    {aiResult.marketPrice != null ? `約${aiResult.marketPrice.toLocaleString()}円` : 'データ不足'}
                  </Text>
                </View>
                <View style={[styles.aiTableRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.aiTableCellLeft, { color: colors.mutedForeground }]}>未鑑定 成約中央値</Text>
                  <Text style={[styles.aiTableCellRight, { color: colors.foreground }]}>
                    {aiResult.saleMedian != null
                      ? `約${aiResult.saleMedian.toLocaleString()}円${aiResult.saleCount ? `（${aiResult.saleCount}件）` : ''}`
                      : 'データ不足'}
                  </Text>
                </View>
                <View style={[styles.aiTableRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.aiTableCellLeft, { color: colors.mutedForeground }]}>店舗 販売価格帯</Text>
                  <Text style={[styles.aiTableCellRight, { color: colors.foreground }]}>
                    {aiResult.shopMin != null && aiResult.shopMax != null
                      ? aiResult.shopMin === aiResult.shopMax
                        ? `¥${aiResult.shopMin.toLocaleString()}`
                        : `¥${aiResult.shopMin.toLocaleString()} 〜 ¥${aiResult.shopMax.toLocaleString()}`
                      : aiResult.shopMin != null ? `¥${aiResult.shopMin.toLocaleString()} 〜`
                      : aiResult.shopMax != null ? `〜 ¥${aiResult.shopMax.toLocaleString()}`
                      : 'データ不足'}
                  </Text>
                </View>
                <View style={[styles.aiTableRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.aiTableCellLeft, { color: colors.mutedForeground }]}>店舗 買取価格帯</Text>
                  <Text style={[styles.aiTableCellRight, { color: colors.foreground }]}>
                    {aiResult.buybackMin != null && aiResult.buybackMax != null
                      ? aiResult.buybackMin === aiResult.buybackMax
                        ? `¥${aiResult.buybackMin.toLocaleString()}`
                        : `¥${aiResult.buybackMin.toLocaleString()} 〜 ¥${aiResult.buybackMax.toLocaleString()}`
                      : aiResult.buybackMin != null ? `¥${aiResult.buybackMin.toLocaleString()} 〜`
                      : aiResult.buybackMax != null ? `〜 ¥${aiResult.buybackMax.toLocaleString()}`
                      : 'データ不足'}
                  </Text>
                </View>
                <View style={styles.aiTableRow}>
                  <Text style={[styles.aiTableCellLeft, { color: colors.mutedForeground }]}>同カード PSA10 成約</Text>
                  <Text style={[styles.aiTableCellRight, { color: colors.foreground }]}>
                    {aiResult.psa10Median != null ? `¥${aiResult.psa10Median.toLocaleString()}` : 'データ不足'}
                  </Text>
                </View>
              </View>
              {aiResult.searchedAt && (
                <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                  検索日時: {new Date(aiResult.searchedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </Text>
              )}

              {aiResult.explanation ? (
                <View style={[styles.aiExplanation, { backgroundColor: colors.secondary }]}>
                  <Feather name="info" size={16} color={colors.primary} style={{ marginTop: 2 }} />
                  <Text style={[styles.aiExplanationText, { color: colors.foreground }]}>{aiResult.explanation}</Text>
                </View>
              ) : null}

              {aiResult.sources && aiResult.sources.length > 0 && (
                <View style={styles.aiSources}>
                  <Text style={[styles.aiSourcesHeading, { color: colors.foreground }]}>参照ページ（{aiResult.sources.length}件）</Text>
                  {aiResult.sources.map((src, i) => (
                    <Pressable
                      key={i}
                      style={({ pressed }) => [
                        styles.aiSourceItem,
                        { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }
                      ]}
                      onPress={() => {
                        if (src.url && src.url.startsWith('https://')) {
                          Linking.openURL(src.url);
                        }
                      }}
                    >
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.foreground }} numberOfLines={1}>
                          {src.title}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.mutedForeground }}>
                          {src.category === 'shop' ? 'ショップ販売'
                            : src.category === 'buyback' ? 'ショップ買取'
                            : src.category === 'psa10' ? 'PSA10成約'
                            : '未鑑定成約'}
                        </Text>
                      </View>
                      {src.price != null && (
                        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.foreground }}>
                          ¥{src.price.toLocaleString()}
                        </Text>
                      )}
                      {src.url && src.url.startsWith('https://') && (
                        <Feather name="external-link" size={14} color={colors.mutedForeground} style={{ marginLeft: 4 }} />
                      )}
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={styles.aiErrorWrap}>
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>価格の確認にはカード名と番号またはシリーズが必要です</Text>
            </View>
          )}
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <View style={styles.auxiliaryContainer}>
          <Text style={[styles.sectionHeading, { color: colors.foreground }]}>確定履歴データ (別参照)</Text>

          <View style={styles.priceContainer}>
            <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>直近{period}日の成約中央値</Text>
            {hasConfirmedMarketPrice ? (
              <View style={styles.priceValueRow}>
                <Text style={[styles.priceCurrency, { color: colors.foreground }]}>¥</Text>
                <Text style={[styles.priceValue, { color: colors.foreground }]}>{confirmedMarketPrice?.toLocaleString()}</Text>
              </View>
            ) : (
              <Text style={[styles.priceLabel, { color: error ? colors.destructive : colors.mutedForeground }]}>
                {!hasIdentity ? '価格の確認にはカード名と番号が必要です'
                  : error ? '価格の取得に失敗しました'
                  : isLoading ? '価格を確認中...' : '確認できた成約データがありません'}
              </Text>
            )}
            {prices?.summary.shopMedian != null && (
              <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>
                店舗販売価格の参考値 ¥{prices.summary.shopMedian.toLocaleString()}（成約価格には含めません）
              </Text>
            )}
            {hasConfirmedMarketPrice && (
              <View style={[styles.trendBadge, { backgroundColor: colors.positiveSoft }]}>
                <Feather name="trending-up" size={12} color={colors.positive} />
                <Text style={[styles.trendBadgeText, { color: colors.positive }]}>
                  確認済み成約 {prices.summary.transactionCount}件
                </Text>
              </View>
            )}
            {error && (
              <Pressable accessibilityRole="button" onPress={() => { void refetch(); }} style={{ padding: 10 }}>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>再試行</Text>
              </Pressable>
            )}
            {prices?.methodology && (
              <Text style={[styles.warningText, { color: colors.mutedForeground }]}>
                {prices.methodology}
              </Text>
            )}
          </View>

          <View style={[styles.periodToggle, { backgroundColor: colors.secondary }]}>
          {([7, 30, 90, 365] as const).map((p) => (
            <Pressable
              key={p}
              accessibilityRole="tab"
              accessibilityState={{ selected: period === p }}
              testID={`period-control-${p}`}
              onPress={() => setPeriod(p)}
              style={[
                styles.periodButton,
                period === p && { backgroundColor: colors.primary }
              ]}
            >
              <Text style={[
                styles.periodText,
                { color: period === p ? colors.primaryForeground : colors.mutedForeground }
              ]}>
                {p}日
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {points.length ? (
            <PriceChart points={points} width={chartWidth} strokeColor={colors.primary} />
          ) : (
            <Text style={[styles.warningText, { color: colors.mutedForeground }]}>
              成約履歴がないため価格推移は表示できません
            </Text>
          )}
        </View>

        <View style={styles.statsContainer}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>最高成約</Text>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {prices?.summary.highestPrice != null ? `¥${prices.summary.highestPrice.toLocaleString()}` : 'データなし'}
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>最低成約</Text>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {prices?.summary.lowestPrice != null ? `¥${prices.summary.lowestPrice.toLocaleString()}` : 'データなし'}
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>店舗販売参考</Text>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {prices?.summary.shopMedian != null ? `¥${prices.summary.shopMedian.toLocaleString()}` : 'データなし'}
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>確認済み成約数</Text>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {prices?.summary.transactionCount ?? 0}件
            </Text>
          </View>
        </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    minHeight: 72,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { fontSize: 16, fontWeight: '700' },
  topSpacer: { width: 42, height: 42 },
  content: { 
    paddingHorizontal: 20, 
    alignItems: 'center', 
    gap: 24, 
    paddingTop: 10,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  
  warningBanner: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  warningIconWrap: {
    marginTop: 2,
  },
  warningTextWrap: {
    flex: 1,
  },
  warningText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },

  cardInfoRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  cardImageWrap: {
    width: 60,
    height: 84,
    borderRadius: 8,
    overflow: 'hidden',
    padding: 2,
  },
  cardDetails: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  cardRarity: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  cardNumber: {
    fontSize: 12,
  },

  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    width: '100%',
    textAlign: 'left',
    marginTop: 8,
  },
  aiContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },
  aiLoadingWrap: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiErrorWrap: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiMainIndicator: {
    width: '100%',
    alignItems: 'center',
    gap: 4,
    marginVertical: 8,
  },
  aiTable: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  aiTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  aiTableCellLeft: {
    fontSize: 13,
    fontWeight: '500',
  },
  aiTableCellRight: {
    fontSize: 14,
    fontWeight: '700',
  },
  aiExplanation: {
    width: '100%',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  aiExplanationText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  aiSources: {
    width: '100%',
    gap: 8,
    marginTop: 8,
  },
  aiSourcesHeading: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  aiSourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  divider: {
    width: '100%',
    height: 1,
    marginVertical: 8,
  },
  auxiliaryContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 16,
  },

  priceContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
    marginVertical: 4,
  },
  priceLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  priceValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  priceCurrency: {
    fontSize: 24,
    fontWeight: '700',
  },
  priceValue: {
    fontSize: 42,
    fontWeight: '700',
    letterSpacing: -1,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
    marginTop: 4,
  },
  trendBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  periodToggle: {
    width: '100%',
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  periodText: {
    fontSize: 13,
    fontWeight: '600',
  },

  chartCard: {
    width: '100%',
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    width: '100%',
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  statLabel: {
    fontSize: 12,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
});
