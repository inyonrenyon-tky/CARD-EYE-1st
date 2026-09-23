import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Defs, LinearGradient, Stop, Line, Text as SvgText, Circle } from 'react-native-svg';
import { CardArtwork } from '@/components/CardArtwork';
import { useColors } from '@/hooks/useColors';
import { getSamplePriceOverview, type PricePeriod } from '@/constants/sample-price-history';

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
  const { uri, cardName, cardNumber, rarity } = useLocalSearchParams<{
    uri?: string;
    cardName?: string;
    cardNumber?: string;
    rarity?: string;
  }>();

  const [period, setPeriod] = useState<PricePeriod>(30);
  const data = useMemo(() => getSamplePriceOverview(period), [period]);

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
        <Text style={[styles.topTitle, { color: colors.foreground }]}>市場相場（サンプル）</Text>
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
              ここに表示されているすべての価格や取引数などの数値は架空のサンプルデータです。実際の取引履歴、見積もり、査定額、または価値を保証するものではありません。
            </Text>
          </View>
        </View>

        <View style={styles.cardInfoRow}>
          <View style={[styles.cardImageWrap, { backgroundColor: colors.secondary }]}>
            {uri ? (
              <Image source={{ uri }} resizeMode="contain" style={styles.cardImage} />
            ) : (
              <CardArtwork card={{ name: cardName || '不明', number: cardNumber || '不明', tone: 'orange' }} compact />
            )}
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

        <View style={styles.priceContainer}>
          <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>現在の参考価格（サンプル）</Text>
          <View style={styles.priceValueRow}>
            <Text style={[styles.priceCurrency, { color: colors.foreground }]}>¥</Text>
            <Text style={[styles.priceValue, { color: colors.foreground }]}>{data.currentPrice.toLocaleString()}</Text>
          </View>
          <View style={[styles.trendBadge, { backgroundColor: colors.positiveSoft }]}>
            <Feather name="trending-up" size={12} color={colors.positive} />
            <Text style={[styles.trendBadgeText, { color: colors.positive }]}>データ推移例</Text>
          </View>
        </View>

        <View style={[styles.periodToggle, { backgroundColor: colors.secondary }]}>
          {([7, 30, 90, 180] as PricePeriod[]).map((p) => (
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
          <PriceChart points={data.points} width={chartWidth} strokeColor={colors.primary} />
        </View>

        <View style={styles.statsContainer}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
             <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>サンプル最高値</Text>
             <Text style={[styles.statValue, { color: colors.foreground }]}>¥{data.highestPrice.toLocaleString()}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
             <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>サンプル最安値</Text>
             <Text style={[styles.statValue, { color: colors.foreground }]}>¥{data.lowestPrice.toLocaleString()}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
             <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>サンプル平均値</Text>
             <Text style={[styles.statValue, { color: colors.foreground }]}>¥{data.averagePrice.toLocaleString()}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
             <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>サンプル取引数</Text>
             <Text style={[styles.statValue, { color: colors.foreground }]}>{data.transactionCount.toLocaleString()}件</Text>
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
  cardImage: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
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
