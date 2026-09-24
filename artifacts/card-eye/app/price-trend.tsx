import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, LayoutAnimation } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardArtwork } from '@/components/CardArtwork';
import { useColors } from '@/hooks/useColors';
import { useGetCardPrices, getGetCardPricesQueryKey, GetCardPricesPeriod, PriceTransactionSummary, PriceListing, PriceBuyback } from '@workspace/api-client-react';
import { PriceChart } from '@/components/PriceChart';

type TabId = 'sales' | 'transactions' | 'buybacks';

export default function PriceTrendScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { uri, cardName, cardNumber, rarity, id: paramId, demo: demoParam } = useLocalSearchParams<{
    uri?: string;
    cardName?: string;
    cardNumber?: string;
    rarity?: string;
    id?: string;
    demo?: string;
  }>();

  // Orval interpolates path parameters without escaping them; card numbers
  // commonly contain "/" and must remain one URL segment.
  const rawId = paramId || cardNumber;
  const id = rawId ? encodeURIComponent(rawId) : undefined;
  
  const [period, setPeriod] = useState<GetCardPricesPeriod>(30);
  const [demo, setDemo] = useState(demoParam === 'true');
  const [activeTab, setActiveTab] = useState<TabId>('transactions');
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<ScrollView>(null);
  const chartY = useRef(0);
  const sourcesY = useRef(0);

  const priceQuery = { period, demo, name: cardName };
  const { data: prices, isLoading, error, refetch } = useGetCardPrices(id ?? '', priceQuery, {
    request: { cache: 'no-store' },
    query: { enabled: !!id, queryKey: getGetCardPricesQueryKey(id ?? '', priceQuery) }
  });

  const toggleSourceDetails = (source: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedSources(prev => ({ ...prev, [source]: !prev[source] }));
  };

  const hasData = prices && prices.marketPrice != null;
  const isMissingIdentity = !id;

  const handleScrollToChart = () => {
    scrollRef.current?.scrollTo({ y: chartY.current, animated: true });
  };

  const chartSources = useMemo(() => {
    if (!prices?.sources) return [];
    const sales = (prices.sources.sales || []).filter(s => s.history && s.history.length > 0).map(s => ({
      ...s,
      type: 'sale' as const
    }));
    const txs = (prices.sources.transactions || []).filter(s => s.history && s.history.length > 0).map(s => ({
      ...s,
      type: 'transaction' as const
    }));
    return [...txs, ...sales];
  }, [prices]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="戻る"
          testID="price-back-button"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.foreground }]}>価格相場</Text>
        <Pressable
          onPress={() => setDemo(!demo)}
          style={[styles.demoToggle, { backgroundColor: demo ? colors.accent : colors.secondary }]}
        >
          <Text style={[styles.demoToggleText, { color: demo ? colors.primary : colors.foreground }]}>
            {demo ? '通常表示' : 'サンプル表示'}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 34 }]}
        showsVerticalScrollIndicator={false}
      >
        {demo && (
          <View style={[styles.demoNotice, { backgroundColor: colors.destructive + '20', borderColor: colors.destructive }]}>
            <Feather name="alert-triangle" size={16} color={colors.destructive} />
            <Text style={[styles.demoNoticeText, { color: colors.destructive }]}>
              デモ・実際の価格ではありません
            </Text>
          </View>
        )}

        <View style={[styles.cardIdentity, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.artworkWrap}>
            {uri ? (
              <Image source={{ uri }} resizeMode="contain" style={styles.artworkImage} />
            ) : (
              <CardArtwork
                compact
                card={{ name: cardName ?? 'カード', number: cardNumber ?? '番号未確認', tone: 'orange' }}
              />
            )}
          </View>
          <View style={styles.identityText}>
            <Text style={[styles.cardName, { color: colors.foreground }]} numberOfLines={2}>
              {cardName || 'カード名未確認'}
            </Text>
            <Text style={[styles.cardNumber, { color: colors.mutedForeground }]}>
              {cardNumber || 'カード番号未確認'}
            </Text>
            <View style={[styles.rarityPill, { backgroundColor: colors.accent }]}>
                <Text style={[styles.rarity, { color: colors.primary }]}>{rarity || '不明'}</Text>
            </View>
          </View>
        </View>

        {isMissingIdentity ? (
          <View style={[styles.marketCard, { backgroundColor: colors.card, borderColor: colors.border, paddingVertical: 40 }]}>
            <Feather name="search" size={32} color={colors.mutedForeground} style={{ marginBottom: 10 }} />
            <Text style={[styles.marketPrice, { color: colors.mutedForeground, fontSize: 20 }]}>
              カード情報が不足しています
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 8 }}>
              価格を確認するにはカードをスキャンしてください。
            </Text>
          </View>
        ) : error ? (
          <View style={[styles.marketCard, { backgroundColor: colors.card, borderColor: colors.border, paddingVertical: 40 }]}>
            <Feather name="alert-circle" size={32} color={colors.destructive} style={{ marginBottom: 10 }} />
            <Text style={[styles.marketPrice, { color: colors.destructive, fontSize: 20 }]}>
              データの取得に失敗しました
            </Text>
            <Pressable accessibilityRole="button" onPress={() => { void refetch(); }} style={{ marginTop: 16, padding: 10 }}>
              <Text style={{ color: colors.primary, fontWeight: '700' }}>再試行</Text>
            </Pressable>
          </View>
        ) : isLoading ? (
          <View style={[styles.marketCard, { backgroundColor: colors.card, borderColor: colors.border, paddingVertical: 40 }]}>
            <Text style={[styles.marketPrice, { color: colors.mutedForeground, fontSize: 20 }]}>
              読み込み中...
            </Text>
          </View>
        ) : (
          <>
            {/* CARD EYE MARKET */}
            <View style={[styles.marketCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.marketTitle, { color: colors.primary }]}>CARD EYE MARKET</Text>
              
              <View style={styles.marketPriceRow}>
                {hasData ? (
                  <>
                    <Text style={[styles.marketPrice, { color: colors.foreground }]}>
                      ¥{prices.marketPrice?.toLocaleString()}
                    </Text>
                    {prices.summary.changePercent != null && (
                      <View style={[
                        styles.changePill, 
                        { backgroundColor: prices.summary.changePercent >= 0 ? colors.positiveSoft : colors.destructive + '20' }
                      ]}>
                        <Text style={[
                          styles.changeText, 
                          { color: prices.summary.changePercent >= 0 ? colors.positive : colors.destructive }
                        ]}>
                          {prices.summary.changePercent > 0 ? '+' : ''}{prices.summary.changePercent.toFixed(1)}%
                        </Text>
                      </View>
                    )}
                  </>
                ) : (
                  <Text style={[styles.marketPrice, { color: colors.mutedForeground, fontSize: 24 }]}>
                    成約データなし
                  </Text>
                )}
              </View>

              {hasData && (
                <View style={styles.marketStatsRow}>
                  <View style={[styles.statBox, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>価格信頼度</Text>
                     <Text style={[styles.statValue, { color: colors.foreground }]}>{prices.summary.confidenceScore == null ? '未評価' : `${prices.summary.confidenceScore} / 100`}</Text>
                    {demo && (
                       <Text style={{ color: colors.mutedForeground, fontSize: 10, marginTop: 4 }}>※サンプル推測値</Text>
                    )}
                  </View>
                  <View style={[styles.statBox, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>データ期間</Text>
                    <Text style={[styles.statValue, { color: colors.foreground }]}>{period === 365 ? '1年' : `${period}日間`}</Text>
                  </View>
                </View>
              )}

              {hasData && (
                <Text style={[styles.marketExplanation, { color: colors.mutedForeground }]}>
                  {prices.summary.transactionCount}件の成約データから算出
                </Text>
              )}
              {prices?.summary.shopMedian != null && (
                <Text style={[styles.marketExplanation, { color: colors.mutedForeground }]}>
                  店舗販売価格の参考値 ¥{prices.summary.shopMedian.toLocaleString()}（成約中央値には含めません）
                </Text>
              )}
              <Text style={[styles.marketExplanation, { color: colors.mutedForeground }]}>
                {prices?.methodology}
              </Text>
              {hasData && (
                <Pressable accessibilityRole="button" onPress={() => {
                  setActiveTab('transactions');
                  scrollRef.current?.scrollTo({ y: sourcesY.current, animated: true });
                }}>
                  <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700' }}>算出根拠を見る →</Text>
                </Pressable>
              )}
            </View>

            {/* Period Selector */}
            <View style={styles.periodSelector}>
              {([7, 30, 90, 365] as const).map(p => (
                <Pressable
                  key={p}
                  onPress={() => setPeriod(p)}
                  style={[
                    styles.periodBtn,
                    period === p && { backgroundColor: colors.foreground }
                  ]}
                >
                  <Text style={[
                    styles.periodText,
                    { color: period === p ? colors.background : colors.mutedForeground }
                  ]}>
                    {p === 365 ? '1年' : `${p}日`}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Comparison Chart */}
            {chartSources.length > 0 && (
              <View onLayout={event => { chartY.current = event.nativeEvent.layout.y; }} style={[styles.chartSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>サイト比較・価格推移 ({period === 365 ? '1年' : `${period}日`})</Text>
                <PriceChart sources={chartSources} periodDays={period} />
              </View>
            )}

            {/* Tabs */}
            <View onLayout={event => { sourcesY.current = event.nativeEvent.layout.y; }} style={{ gap: 10 }}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>サイト別価格</Text>
            <View style={styles.tabsContainer}>
              {(['sales', 'transactions', 'buybacks'] as const).map(tab => {
                const labels = { sales: '販売価格', transactions: '成約価格', buybacks: '買取価格' };
                const isActive = activeTab === tab;
                return (
                  <Pressable
                    key={tab}
                    onPress={() => setActiveTab(tab)}
                    style={[
                      styles.tabBtn,
                      { borderBottomColor: isActive ? colors.primary : 'transparent' }
                    ]}
                  >
                    <Text style={[
                      styles.tabText,
                      { color: isActive ? colors.primary : colors.mutedForeground, fontWeight: isActive ? '700' : '500' }
                    ]}>
                      {labels[tab]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            </View>

            {/* Source List */}
            <View style={[styles.sourcesContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {activeTab === 'sales' && (
                <SourceListSales 
                  sources={prices?.sources?.sales || []} 
                  expanded={expandedSources}
                  onToggle={toggleSourceDetails}
                  median={prices?.summary?.shopMedian}
                  period={period}
                  onShowChart={handleScrollToChart}
                />
              )}
              {activeTab === 'transactions' && (
                <SourceListTransactions 
                  sources={prices?.sources?.transactions || []} 
                  expanded={expandedSources}
                  onToggle={toggleSourceDetails}
                  median={prices?.summary?.transactionMedian}
                  totalCount={prices?.summary?.transactionCount}
                  marketPrice={prices?.marketPrice}
                  period={period}
                  onShowChart={handleScrollToChart}
                />
              )}
              {activeTab === 'buybacks' && (
                <SourceListBuybacks 
                  sources={prices?.sources?.buybacks || []} 
                  expanded={expandedSources}
                  onToggle={toggleSourceDetails}
                  median={prices?.summary?.buybackMedian}
                  marketPrice={prices?.marketPrice}
                />
              )}
              {prices?.mode === 'live' && prices.sourceAvailability
                ?.filter(item => item.priceType === ({ sales: 'LISTING', transactions: 'SALE', buybacks: 'BUYBACK' } as const)[activeTab] && item.status !== 'available')
                .map(item => (
                  <View key={`${item.source}-${item.priceType}`} style={{ padding: 14, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 }}>
                    <Text style={{ color: colors.foreground, fontWeight: '600' }}>
                      {prices.sourceConfigs.find(config => config.source === item.source)?.displayName ?? item.source}
                      {'  ·  '}{item.status === 'no_data' ? '該当データなし' : '未取得'}
                    </Text>
                    {item.reason && <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{item.reason}</Text>}
                  </View>
                ))}
            </View>
          </>
        )}

      </ScrollView>
    </View>
  );
}

function SourceListSales({ sources, expanded, onToggle, median, period, onShowChart }: { sources: PriceListing[], expanded: Record<string, boolean>, onToggle: (s:string)=>void, median?: number | null, period: number, onShowChart: () => void }) {
  const colors = useColors();
  if (sources.length === 0) return <NoDataMessage />;
  
  return (
    <View style={styles.sourceListInner}>
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>中央値</Text>
        <Text style={[styles.summaryValue, { color: colors.foreground }]}>{median ? `¥${median.toLocaleString()}` : 'データなし'}</Text>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      
      {sources.map(src => {
        const isExp = expanded[src.source];
        return (
          <Pressable key={src.source} onPress={() => onToggle(src.source)} style={styles.sourceRowWrapper}>
            <View style={styles.sourceRowHeader}>
              <View style={styles.sourceRowLeft}>
                <Text style={[styles.sourceName, { color: colors.foreground }]}>{src.displayName}</Text>
                {src.isReference && (
                  <View style={[styles.refBadge, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.refBadgeText, { color: colors.background }]}>基準</Text>
                  </View>
                )}
                {isOldData(src.lastUpdated) && (
                  <View style={[styles.refBadge, { backgroundColor: colors.destructive + '40' }]}>
                    <Text style={[styles.refBadgeText, { color: colors.destructive }]}>古いデータ</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.sourcePrice, { color: colors.foreground }]}>¥{src.price.toLocaleString()}</Text>
            </View>
            
            {isExp && (
              <View style={[styles.sourceDetails, { backgroundColor: colors.secondary }]}>
                {src.condition && <DetailRow label="状態" value={src.condition} />}
                {src.stockStatus && <DetailRow label="在庫" value={src.stockStatus} />}
                 <DetailRow label="最新の終了日" value={formatDateStr(src.lastUpdated)} />
                {src.history && src.history.length > 0 && (
                  <Pressable onPress={onShowChart} style={styles.showChartBtn}>
                    <Feather name="bar-chart-2" size={14} color={colors.primary} />
                    <Text style={[styles.showChartText, { color: colors.primary }]}>価格推移を見る</Text>
                  </Pressable>
                )}
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function SourceListTransactions({ sources, expanded, onToggle, median, totalCount, marketPrice, period, onShowChart }: { sources: PriceTransactionSummary[], expanded: Record<string, boolean>, onToggle: (s:string)=>void, median?: number | null, totalCount?: number, marketPrice?: number | null, period: number, onShowChart: () => void }) {
  const colors = useColors();
  if (sources.length === 0) return <NoDataMessage />;

  return (
    <View style={styles.sourceListInner}>
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>統合中央値</Text>
        <Text style={[styles.summaryValue, { color: colors.foreground }]}>{marketPrice ? `¥${marketPrice.toLocaleString()}` : 'データなし'}</Text>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      
      {sources.map(src => {
        const isExp = expanded[src.source];
        return (
          <Pressable key={src.source} onPress={() => onToggle(src.source)} style={styles.sourceRowWrapper}>
            <View style={styles.sourceRowHeader}>
              <View style={styles.sourceRowLeft}>
                <Text style={[styles.sourceName, { color: colors.foreground }]}>{src.displayName}</Text>
                {isOldData(src.lastUpdated) && (
                  <View style={[styles.refBadge, { backgroundColor: colors.destructive + '40' }]}>
                    <Text style={[styles.refBadgeText, { color: colors.destructive }]}>古いデータ</Text>
                  </View>
                )}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.sourcePrice, { color: colors.foreground }]}>
                  {src.medianPrice ? `¥${src.medianPrice.toLocaleString()}` : 'データなし'}
                </Text>
                <Text style={[styles.sourceSub, { color: colors.mutedForeground, textAlign: 'right' }]}>{src.transactionCount}件</Text>
              </View>
            </View>
            
            {isExp && (
              <View style={[styles.sourceDetails, { backgroundColor: colors.secondary }]}>
                <DetailRow label="データ期間" value={period === 365 ? '直近1年' : `直近${period}日`} />
                {src.highestPrice != null && <DetailRow label="最高成約" value={`¥${src.highestPrice.toLocaleString()}`} />}
                {src.lowestPrice != null && <DetailRow label="最低成約" value={`¥${src.lowestPrice.toLocaleString()}`} />}
                <DetailRow label="確認日時" value={formatDateStr(src.lastUpdated)} />
                {src.history && src.history.length > 0 && (
                  <Pressable onPress={onShowChart} style={styles.showChartBtn}>
                    <Feather name="bar-chart-2" size={14} color={colors.primary} />
                    <Text style={[styles.showChartText, { color: colors.primary }]}>価格推移を見る</Text>
                  </Pressable>
                )}
              </View>
            )}
          </Pressable>
        );
      })}
      
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>合計件数</Text>
        <Text style={[styles.summaryValue, { color: colors.foreground }]}>{totalCount || 0}件</Text>
      </View>
    </View>
  );
}

function SourceListBuybacks({ sources, expanded, onToggle, median, marketPrice }: { sources: PriceBuyback[], expanded: Record<string, boolean>, onToggle: (s:string)=>void, median?: number | null, marketPrice?: number | null }) {
  const colors = useColors();
  if (sources.length === 0) return <NoDataMessage />;

  return (
    <View style={styles.sourceListInner}>
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>中央値</Text>
        <Text style={[styles.summaryValue, { color: colors.foreground }]}>{median ? `¥${median.toLocaleString()}` : 'データなし'}</Text>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      
      {sources.map(src => {
        const isExp = expanded[src.source];
        const ratio = marketPrice && src.price ? (src.price / marketPrice * 100).toFixed(1) : null;
        return (
          <Pressable key={src.source} onPress={() => onToggle(src.source)} style={styles.sourceRowWrapper}>
            <View style={styles.sourceRowHeader}>
              <View style={styles.sourceRowLeft}>
                <Text style={[styles.sourceName, { color: colors.foreground }]}>{src.displayName}</Text>
                {isOldData(src.lastUpdated) && (
                  <View style={[styles.refBadge, { backgroundColor: colors.destructive + '40' }]}>
                    <Text style={[styles.refBadgeText, { color: colors.destructive }]}>古いデータ</Text>
                  </View>
                )}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.sourcePrice, { color: colors.foreground }]}>¥{src.price.toLocaleString()}</Text>
                {ratio && <Text style={[styles.sourceSub, { color: colors.mutedForeground, textAlign: 'right' }]}>市場比 {ratio}%</Text>}
              </View>
            </View>
            
            {isExp && (
              <View style={[styles.sourceDetails, { backgroundColor: colors.secondary }]}>
                <DetailRow label="確認日時" value={formatDateStr(src.lastUpdated)} />
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

function DetailRow({ label, value }: { label: string, value: string }) {
  const colors = useColors();
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

function NoDataMessage() {
  const colors = useColors();
  return (
    <View style={styles.noData}>
      <Feather name="inbox" size={24} color={colors.mutedForeground} style={{ marginBottom: 8 }} />
      <Text style={{ color: colors.mutedForeground, fontSize: 14 }}>データなし</Text>
    </View>
  );
}

function isOldData(iso?: string | null) {
  if (!iso) return false;
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffHours = (now.getTime() - d.getTime()) / (1000 * 60 * 60);
    return diffHours > 48; // 48時間以上
  } catch {
    return false;
  }
}

function formatDateStr(iso?: string | null) {
  if (!iso) return '不明';
  try {
    const d = new Date(iso);
    return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
  } catch {
    return '不明';
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { minHeight: 72, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 16, fontWeight: '700' },
  demoToggle: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  demoToggleText: { fontSize: 12, fontWeight: '700' },
  content: { paddingHorizontal: 20, paddingTop: 10, gap: 20 },
  demoNotice: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  demoNoticeText: { fontSize: 13, fontWeight: '700' },
  
  cardIdentity: { flexDirection: 'row', alignItems: 'center', gap: 17, borderWidth: 1, borderRadius: 19, padding: 14 },
  artworkWrap: { width: 78, height: 108, borderRadius: 10, overflow: 'hidden' },
  artworkImage: { width: '100%', height: '100%' },
  identityText: { flex: 1, gap: 6 },
  cardName: { fontSize: 19, fontWeight: '700' },
  cardNumber: { fontSize: 12 },
  rarityPill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  rarity: { fontSize: 11, fontWeight: '700' },
  
  marketCard: { borderWidth: 1, borderRadius: 20, padding: 20, gap: 14, alignItems: 'center' },
  marketTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  marketPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  marketPrice: { fontSize: 36, fontWeight: '700', letterSpacing: -1 },
  changePill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  changeText: { fontSize: 13, fontWeight: '700' },
  marketStatsRow: { flexDirection: 'row', gap: 12, width: '100%' },
  statBox: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center', gap: 4 },
  statLabel: { fontSize: 11 },
  statValue: { fontSize: 14, fontWeight: '700' },
  marketExplanation: { fontSize: 11, marginTop: 4 },
  
  periodSelector: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  periodBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  periodText: { fontSize: 13, fontWeight: '600' },
  
  chartSection: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  
  tabsContainer: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#333' },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2 },
  tabText: { fontSize: 13 },
  
  sourcesContainer: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  sourceListInner: { padding: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  summaryLabel: { fontSize: 13, fontWeight: '600' },
  summaryValue: { fontSize: 16, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
  
  sourceRowWrapper: { paddingVertical: 12 },
  sourceRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sourceRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sourceName: { fontSize: 15, fontWeight: '600' },
  refBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  refBadgeText: { fontSize: 10, fontWeight: '800' },
  sourcePrice: { fontSize: 15, fontWeight: '700' },
  sourceSub: { fontSize: 11, marginTop: 2 },
  
  sourceDetails: { marginTop: 12, borderRadius: 12, padding: 12, gap: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { fontSize: 12 },
  detailValue: { fontSize: 12, fontWeight: '600' },
  showChartBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#333', borderRadius: 8 },
  showChartText: { fontSize: 13, fontWeight: '700' },
  
  noData: { padding: 40, alignItems: 'center', justifyContent: 'center' },
});
