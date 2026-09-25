import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Defs, LinearGradient, Stop, Line, Text as SvgText, Circle } from 'react-native-svg';
import { CardThumbnail } from '@/components/CardThumbnail';
import { useColors } from '@/hooks/useColors';
import { useScan } from '@/hooks/ScanContext';
import { readPhoto } from '@/lib/readPhoto';
import { beautifulPlusReferenceRange } from '@/lib/aiReferenceRange';
import { getCollectorNumber } from '@/lib/collectorNumber';
import { RepresentativePrice, useRepresentativePrice } from '@/components/RepresentativePrice';
import { getGetCardPricesQueryKey, getGetCatalogCardAiMarketResultQueryKey, useGetCardPrices, useGetCatalogCardAiMarketResult, type GetCardPricesPeriod, useSearchCardMarketWithAi, type AiMarketSearchResponse } from '@workspace/api-client-react';

function formatEstimatedPrice(estimate: AiMarketSearchResponse['estimates']['psa10']): string {
  if (estimate.min != null && estimate.max != null) {
    return estimate.min === estimate.max
      ? `約¥${estimate.min.toLocaleString()}`
      : `¥${estimate.min.toLocaleString()}〜¥${estimate.max.toLocaleString()}`;
  }
  if (estimate.min != null) return `¥${estimate.min.toLocaleString()}〜`;
  if (estimate.max != null) return `〜¥${estimate.max.toLocaleString()}`;
  return '目安なし';
}

const unavailableEstimate: AiMarketSearchResponse['estimates']['psa10'] = {
  min: null, max: null, note: '',
};

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

function ClassicScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { uri: scanUri, scanId: activeScanId } = useScan();
  const { scanId: routeScanId, cardName, series, cardNumber, rarity, catalogCardId, representativeCardId, announcementImage } = useLocalSearchParams<{
    scanId?: string;
    cardName?: string;
    series?: string;
    cardNumber?: string;
    rarity?: string;
    catalogCardId?: string;
    representativeCardId?: string;
    announcementImage?: string;
  }>();
  const uri = routeScanId && routeScanId === activeScanId ? scanUri : undefined;
  const officialAnnouncementImage = /^https:\/\/www\.30th\.pokemon-card\.com\/images\/m6a\/cards\/[a-zA-Z0-9_-]+\.png$/.test(announcementImage ?? '')
    ? announcementImage : undefined;

  const useCatalogPricing = !!catalogCardId && !uri;
  const catalogAiQuery = useGetCatalogCardAiMarketResult(catalogCardId ?? '', {
    query: {
      queryKey: getGetCatalogCardAiMarketResultQueryKey(catalogCardId ?? ''),
      enabled: useCatalogPricing && !!cardName,
      retry: false,
      staleTime: 0,
      refetchOnMount: 'always',
    },
  });
  const [searchedResult, setSearchedResult] = useState<AiMarketSearchResponse | null>(null);
  const [searchedError, setSearchedError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const aiResult = useCatalogPricing ? (catalogAiQuery.isFetching ? null : catalogAiQuery.data ?? null) : searchedResult;
  const aiError = useCatalogPricing ? (catalogAiQuery.isError ? 'AIによる相場検索に失敗しました。' : null) : searchedError;
  const isAiLoading = useCatalogPricing ? catalogAiQuery.isPending || catalogAiQuery.isFetching : isSearching;
  const [identityExpanded, setIdentityExpanded] = useState(false);
  const [expandedEstimate, setExpandedEstimate] = useState<string | null>(null);
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const requestedAi = useRef<string | null>(null);
  const searchMarketAi = useSearchCardMarketWithAi();

  const runAiSearch = async () => {
    if (useCatalogPricing) {
      await catalogAiQuery.refetch();
      return;
    }
    if (!cardName || (!cardNumber && !series)) return;
    setIsSearching(true);
    setSearchedError(null);
    try {
      const photo = uri ? await readPhoto(uri).catch(() => null) : null;
      const res = await searchMarketAi.mutateAsync({
        data: {
          cardName,
          cardNumber: cardNumber || null,
          series: series || null,
          rarity: rarity || null,
          ...(photo ? { imageBase64: photo.imageBase64, mimeType: photo.mimeType } : {}),
        }
      });
      setSearchedResult(res);
    } catch (err) {
      setSearchedError('AIによる相場検索に失敗しました。');
    } finally {
      setIsSearching(false);
    }
  };

  const identityKey = `${cardName}|${cardNumber}|${series}|${rarity}|${catalogCardId}|${routeScanId}|${uri ?? ''}`;
  useEffect(() => {
    if (useCatalogPricing || !cardName || (!cardNumber && !series) || requestedAi.current === identityKey) return;
    requestedAi.current = identityKey;
    setSearchedResult(null);
    void runAiSearch();
  }, [identityKey, cardName, uri, useCatalogPricing]);

  const [period, setPeriod] = useState<GetCardPricesPeriod>(30);
  const printedNumber = getCollectorNumber(cardNumber);
  const cardId = catalogCardId || printedNumber;
  const representativeQuery = useRepresentativePrice(
    catalogCardId ?? representativeCardId,
    printedNumber,
    cardName,
    series,
    rarity,
  );
  const encodedId = cardId ? encodeURIComponent(cardId) : '';
  const priceQuery = { period, demo: false, name: cardName, ...(series ? { series } : {}), ...(rarity ? { rarity } : {}) };
  const { data: prices, isLoading, error, refetch } = useGetCardPrices(encodedId, priceQuery, {
    request: { cache: 'no-store' },
    query: {
      enabled: !!cardId && !!cardName?.trim(),
      queryKey: getGetCardPricesQueryKey(encodedId, priceQuery),
    },
  });
  const yahooAuctionQuotes = useMemo(
    () => (prices?.sources.transactions ?? [])
      .filter((source) => source.source === 'yahoo_auction')
      .flatMap((source) => source.history)
      .filter((quote) => Number.isFinite(quote.price) && quote.price > 0),
    [prices],
  );
  const points = useMemo(
    () => [...yahooAuctionQuotes].sort((a, b) => a.date.localeCompare(b.date)),
    [yahooAuctionQuotes],
  );
  const auctionPrices = yahooAuctionQuotes.map((quote) => quote.price).sort((a, b) => a - b);
  const auctionMedian = auctionPrices.length
    ? auctionPrices.length % 2
      ? auctionPrices[Math.floor(auctionPrices.length / 2)]
      : (auctionPrices[auctionPrices.length / 2 - 1] + auctionPrices[auctionPrices.length / 2]) / 2
    : null;
  const auctionHighest = auctionPrices.length ? auctionPrices[auctionPrices.length - 1] : null;
  const auctionLowest = auctionPrices.length ? auctionPrices[0] : null;
  const hasIdentity = !!cardId && !!cardName?.trim();
  const referenceRange = beautifulPlusReferenceRange(aiResult?.estimates);
  const buybackRange = aiResult?.buybackMin != null && aiResult.buybackMax != null
    && aiResult.buybackMin <= aiResult.buybackMax
    && (referenceRange === null || aiResult.buybackMax <= referenceRange.max)
    && (aiResult.shopMin == null || aiResult.buybackMax <= aiResult.shopMin)
    && (aiResult.shopMax == null || aiResult.buybackMax <= aiResult.shopMax)
    ? { min: aiResult.buybackMin, max: aiResult.buybackMax } : null;

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
              上段の1点価格は根拠・確信度を区別して表示します。以下のAI参考相場は状態別の推定で、確認済み成約価格や査定額ではありません。
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
              imageUrl={officialAnnouncementImage}
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

        <RepresentativePrice
          price={representativeQuery.data?.representative}
          isLoading={representativeQuery.isLoading}
          error={!!representativeQuery.error}
          detailed
        />

        <View style={styles.aiContainer}>
          <Text style={[styles.sectionHeading, { color: colors.foreground }]}>AI参考相場 · 状態別の推定</Text>
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
              {aiResult.identityNote ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="カードの特定根拠を見る"
                  accessibilityState={{ expanded: identityExpanded }}
                  onPress={() => setIdentityExpanded((expanded) => !expanded)}
                  style={{ width: '100%' }}
                >
                  <Text
                    numberOfLines={identityExpanded ? undefined : 2}
                    style={[styles.identityNote, { color: colors.mutedForeground }]}
                  >{aiResult.identityNote}</Text>
                </Pressable>
              ) : null}
              <View style={[styles.aiTable, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.aiTableRow, { backgroundColor: colors.secondary, borderBottomColor: colors.border }]}>
                  <Text style={[styles.aiTableCellLeft, { color: colors.mutedForeground }]}>指標</Text>
                  <Text style={[styles.aiTableCellRight, { color: colors.mutedForeground }]}>現在の目安</Text>
                </View>
                <View style={[styles.aiTableRow, { backgroundColor: colors.secondary, borderBottomColor: colors.border }]}>
                   <Text style={[styles.aiTableCellLeft, { color: colors.foreground, fontWeight: '700' }]}>
                     美品以上（未鑑定）参考相場
                   </Text>
                  <Text style={[styles.aiTableCellRight, { color: colors.primary, fontSize: 21 }]}>
                     {referenceRange
                       ? `¥${referenceRange.min.toLocaleString()}〜¥${referenceRange.max.toLocaleString()}`
                       : '目安なし'}
                  </Text>
                </View>
                <View style={[styles.aiTableRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.aiTableCellLeft, { color: colors.mutedForeground }]}>店舗 買取価格帯（美品以上）</Text>
                  <Text style={[styles.aiTableCellRight, { color: buybackRange ? colors.foreground : colors.mutedForeground }]}>
                    {buybackRange
                      ? buybackRange.min === buybackRange.max
                        ? `¥${buybackRange.min.toLocaleString()}`
                        : `¥${buybackRange.min.toLocaleString()} 〜 ¥${buybackRange.max.toLocaleString()}`
                      : '条件に合う掲載情報なし'}
                  </Text>
                </View>
                 <View style={[styles.aiTableRow, { backgroundColor: colors.secondary, borderBottomColor: colors.border }]}>
                   <Text style={[styles.aiSectionLabel, { color: colors.mutedForeground }]}>状態・鑑定グレード別のAI推定 · タップで根拠を見る</Text>
                 </View>
                 {([
                    ['美品（A−〜A）', aiResult.estimates?.ungradedExcellent ?? unavailableEstimate],
                    ['極美品（A〜S）', aiResult.estimates?.ungradedMint ?? unavailableEstimate],
                   ['PSA9', aiResult.estimates?.psa9 ?? unavailableEstimate],
                   ['PSA10', aiResult.estimates?.psa10 ?? unavailableEstimate],
                   ['PSA10 出品価格の目安', aiResult.estimates?.psa10Listing ?? unavailableEstimate],
                 ] as const).map(([label, estimate]) => (
                   <Pressable
                     key={label}
                     accessibilityRole="button"
                     accessibilityLabel={`${label}の参考相場と推定根拠`}
                     accessibilityState={{ expanded: expandedEstimate === label }}
                     onPress={() => setExpandedEstimate((current) => current === label ? null : label)}
                     style={[styles.estimateRow, { borderBottomColor: colors.border }]}
                   >
                     <View style={styles.estimateTop}>
                       <Text style={[styles.aiTableCellLeft, { color: colors.mutedForeground }]}>{label}</Text>
                       <Text style={[styles.estimateValue, { color: estimate.min != null || estimate.max != null ? colors.foreground : colors.mutedForeground }]}>
                         {formatEstimatedPrice(estimate)}
                       </Text>
                     </View>
                     {estimate.note ? (
                       <Text
                         numberOfLines={expandedEstimate === label ? undefined : 2}
                         style={[styles.estimateNote, { color: colors.mutedForeground }]}
                       >{estimate.note}</Text>
                     ) : null}
                   </Pressable>
                 ))}
                 {aiResult.shopMin != null || aiResult.shopMax != null ? <View style={[styles.aiTableRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.aiTableCellLeft, { color: colors.mutedForeground }]}>店舗 販売価格帯</Text>
                  <Text style={[styles.aiTableCellRight, { color: colors.foreground }]}>
                    {aiResult.shopMin != null && aiResult.shopMax != null
                      ? aiResult.shopMin === aiResult.shopMax
                        ? `¥${aiResult.shopMin.toLocaleString()}`
                        : `¥${aiResult.shopMin.toLocaleString()} 〜 ¥${aiResult.shopMax.toLocaleString()}`
                      : aiResult.shopMin != null ? `¥${aiResult.shopMin.toLocaleString()} 〜`
                      : aiResult.shopMax != null ? `〜 ¥${aiResult.shopMax.toLocaleString()}`
                       : '—'}
                  </Text>
                 </View> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="並品の価格と推定根拠"
                    accessibilityState={{ expanded: expandedEstimate === 'played' }}
                    onPress={() => setExpandedEstimate((current) => current === 'played' ? null : 'played')}
                    style={[styles.estimateRow, { borderBottomColor: colors.border }]}
                  >
                    <View style={styles.estimateTop}>
                      <Text style={[styles.aiTableCellLeft, { color: colors.mutedForeground }]}>
                        {aiResult.estimates?.ungradedPlayed?.note.includes('Bのみ') ? '並品（B）' : '並品（C〜B）'}
                      </Text>
                      <Text style={[styles.estimateValue, { color: aiResult.estimates?.ungradedPlayed?.min != null || aiResult.estimates?.ungradedPlayed?.max != null ? colors.foreground : colors.mutedForeground }]}>
                        {formatEstimatedPrice(aiResult.estimates?.ungradedPlayed ?? unavailableEstimate)}
                      </Text>
                    </View>
                    {aiResult.estimates?.ungradedPlayed?.note ? (
                      <Text numberOfLines={expandedEstimate === 'played' ? undefined : 2} style={[styles.estimateNote, { color: colors.mutedForeground }]}>
                        {aiResult.estimates.ungradedPlayed.note}
                      </Text>
                    ) : null}
                  </Pressable>
                 {aiResult.psa10Median != null ? <View style={styles.aiTableRow}>
                  <Text style={[styles.aiTableCellLeft, { color: colors.mutedForeground }]}>同カード PSA10 成約</Text>
                  <Text style={[styles.aiTableCellRight, { color: colors.foreground }]}>
                     {aiResult.psa10Median != null ? `¥${aiResult.psa10Median.toLocaleString()}` : '—'}
                  </Text>
                 </View> : null}
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
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`参照ページ${aiResult.sources.length}件を${sourcesExpanded ? '閉じる' : '開く'}`}
                    accessibilityState={{ expanded: sourcesExpanded }}
                    onPress={() => setSourcesExpanded((expanded) => !expanded)}
                    style={[styles.sourcesToggle, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <Text style={[styles.aiSourcesHeading, { color: colors.foreground }]}>参照ページ（{aiResult.sources.length}件）</Text>
                    <Feather name={sourcesExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} />
                  </Pressable>
                  {sourcesExpanded && aiResult.sources.map((src, i) => (
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
                             : src.category === 'psa9' ? 'PSA9の価格情報'
                             : src.category === 'psa10_listing' ? 'PSA10出品中'
                             : src.category === 'ungraded_listing' ? '未鑑定の出品中'
                             : src.category === 'reference' ? '参考情報'
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="過去の終了・入札ありオークション観測値を見る"
            accessibilityState={{ expanded: showHistory }}
            onPress={() => setShowHistory((visible) => !visible)}
            style={[styles.historyToggle, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Text style={[styles.sectionHeading, { color: colors.foreground, marginTop: 0, width: 'auto', flex: 1, minWidth: 0 }]}>
              終了・入札ありオークション（美品条件・成約完了は未確認）
            </Text>
            <Feather name={showHistory ? 'chevron-up' : 'chevron-down'} size={18} color={colors.mutedForeground} style={{ marginLeft: 8 }} />
          </Pressable>
          {showHistory ? (
          <>

          <View style={styles.priceContainer}>
            <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>直近{period}日のYahoo!オークション観測価格中央値</Text>
            {auctionMedian != null ? (
              <View style={styles.priceValueRow}>
                <Text style={[styles.priceCurrency, { color: colors.foreground }]}>¥</Text>
                <Text style={[styles.priceValue, { color: colors.foreground }]}>{auctionMedian.toLocaleString()}</Text>
              </View>
            ) : (
              <Text style={[styles.priceLabel, { color: error ? colors.destructive : colors.mutedForeground }]}>
                {!hasIdentity ? '価格の確認にはカード名と番号が必要です'
                  : error ? '価格の取得に失敗しました'
                  : isLoading ? '価格を算出中...' : '有効なYahoo!オークション観測価格がありません'}
              </Text>
            )}
            <Text style={[styles.warningText, { color: colors.mutedForeground }]}>
              終了・入札ありの観測価格です。落札・取引成立および美品条件は確認されていません。
            </Text>
            {prices?.summary.shopMedian != null && (
              <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>
                店舗販売価格の参考値 ¥{prices.summary.shopMedian.toLocaleString()}（成約価格には含めません）
              </Text>
            )}
            {yahooAuctionQuotes.length > 0 && (
              <View style={[styles.trendBadge, { backgroundColor: colors.positiveSoft }]}>
                <Feather name="trending-up" size={12} color={colors.positive} />
                <Text style={[styles.trendBadgeText, { color: colors.positive }]}>
                  Yahoo!観測価格 {yahooAuctionQuotes.length}件
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
              Yahoo!オークション観測価格がないため推移を表示できません
            </Text>
          )}
        </View>

        <View style={styles.statsContainer}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>最高観測価格</Text>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {auctionHighest != null ? `¥${auctionHighest.toLocaleString()}` : 'データなし'}
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>最低観測価格</Text>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {auctionLowest != null ? `¥${auctionLowest.toLocaleString()}` : 'データなし'}
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>店舗販売参考</Text>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {prices?.summary.shopMedian != null ? `¥${prices.summary.shopMedian.toLocaleString()}` : 'データなし'}
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>有効な観測価格数</Text>
            <Text style={[styles.statValue, { color: colors.foreground }]}>
              {yahooAuctionQuotes.length}件
            </Text>
          </View>
        </View>
          </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

import PlayfulScreen from '@/variants/playful/screens/market-overview';
import { useDesignVariant } from '@/hooks/DesignVariantContext';

export default function MarketOverviewRoute() {
  const { variant } = useDesignVariant();
  return variant === 'playful' ? <PlayfulScreen /> : <ClassicScreen />;
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
    borderRadius: 22,
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
    gap: 18,
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
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  aiTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  aiTableCellLeft: {
    fontSize: 13,
    fontWeight: '500',
    flexShrink: 1,
  },
  aiTableCellRight: {
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  identityNote: { width: '100%', fontSize: 12, lineHeight: 18 },
  aiSectionLabel: { fontSize: 12, fontWeight: '700' },
  estimateRow: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, gap: 5 },
  estimateTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  estimateNote: { fontSize: 11, lineHeight: 15 },
  estimateValue: { flexShrink: 1, textAlign: 'right', fontSize: 13, fontWeight: '700' },
  aiExplanation: {
    width: '100%',
    borderRadius: 18,
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
  sourcesToggle: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderRadius: 16, borderWidth: 1 },
  aiSourcesHeading: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  aiSourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 18,
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
  historyToggle: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderWidth: 1, borderRadius: 18 },

  priceContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 6,
    marginVertical: 8,
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
    borderRadius: 18,
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
    borderRadius: 24,
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
    borderRadius: 20,
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
