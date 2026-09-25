import { useRef, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Animated, Image, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { getGetFeaturedCardsQueryKey, useGetFeaturedCards } from '@workspace/api-client-react';
import { CardThumbnail } from '@/components/CardThumbnail';
import { CompactRepresentativePrice } from '@/components/RepresentativePrice';
import { AnniversarySpotlight } from '@/components/AnniversarySpotlight';
import { DiscoveryCatalog } from '@/components/DiscoveryCatalog';
import { Screen } from '@/components/Screen';
import { useColors } from '@/hooks/useColors';
import { designTokens } from '@/constants/design-tokens';

function isUsableFeaturedCard(card: { id: string; imageUrl: string }): boolean {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(card.id)) return false;
  try {
    const imageUrl = new URL(card.imageUrl);
    return imageUrl.protocol === 'https:' && !imageUrl.username && !imageUrl.password;
  } catch {
    return false;
  }
}

function ClassicScreen() {
  const colors = useColors();
  const { height } = useWindowDimensions();
  const shortScreen = height < 780;
  const tinyScreen = height < 690;
  const [visibleCount, setVisibleCount] = useState(4);
  const [featuredExpanded, setFeaturedExpanded] = useState(false);
  const scanScale = useRef(new Animated.Value(1)).current;
  const animateScan = (toValue: number) => {
    Animated.spring(scanScale, {
      toValue,
      speed: 28,
      bounciness: 1,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };
  const { data, isLoading, error, refetch } = useGetFeaturedCards({
    query: {
      queryKey: getGetFeaturedCardsQueryKey(),
      enabled: featuredExpanded,
      staleTime: 5 * 60 * 1000,
      retry: false,
      refetchInterval: (query) => query.state.data?.cards.some((card) => card.referenceStatus === 'researching') ? 10_000 : false,
    },
  });
  const usableCards = (data?.cards ?? []).filter(isUsableFeaturedCard);
  const featuredCards = usableCards;

  return (
    <Screen compact>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}>
          <Image source={require('@/assets/images/classic-icon.png')} style={styles.brandIcon} />
        </View>
        <View>
          <Text style={[styles.brandName, { color: colors.foreground }]}>CARD EYE</Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            カードの価値を、もっと身近に。
          </Text>
        </View>
      </View>

      <View style={[styles.hero, shortScreen && styles.shortHero, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.heroGlow, { backgroundColor: colors.mint }]} />
        <View style={[styles.heroGlowSmall, { backgroundColor: colors.lavender }]} />
        <View style={[styles.heroCopy, shortScreen && styles.shortHeroCopy]}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>CARD VALUE, CLEARER</Text>
          <Text style={[styles.heroTitle, shortScreen && styles.shortHeroTitle, { color: colors.foreground }]}>
            {shortScreen ? 'カードの価値を知る。' : <>あなたのカードを{'\n'}正しく知る。</>}
          </Text>
          {!tinyScreen ? (
            <Text style={[styles.heroBody, { color: colors.mutedForeground }]}>
              {shortScreen ? 'スキャンして価値と状態をチェック' : <>まずはカードをスキャンして、{'\n'}価値と状態をチェックしましょう。</>}
            </Text>
          ) : null}
        </View>
        <Animated.View style={{ transform: [{ scale: scanScale }] }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="カードをスキャン"
            testID="scan-card-button"
            onPressIn={() => animateScan(0.985)}
            onPressOut={() => animateScan(1)}
            onPress={() => router.push({ pathname: '/scan' })}
            style={({ pressed }) => [
               styles.scanButton,
               shortScreen && styles.shortScanButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 },
            ]}
          >
            <Feather name="camera" size={20} color={colors.primaryForeground} />
            <Text style={[styles.scanButtonText, { color: colors.primaryForeground }]}>
              カードをスキャン
            </Text>
            <Feather name="arrow-up-right" size={18} color={colors.primaryForeground} />
          </Pressable>
        </Animated.View>
      </View>

      <AnniversarySpotlight compact={shortScreen} />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="いま注目のカードを開閉"
        accessibilityState={{ expanded: featuredExpanded }}
        aria-expanded={featuredExpanded}
        testID="featured-toggle"
        onPress={() => setFeaturedExpanded((current) => !current)}
        style={({ pressed }) => [
          styles.sectionHeader,
          shortScreen && styles.shortSectionHeader,
          { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.86 : 1 },
        ]}
      >
        <View style={[styles.sectionIcon, { backgroundColor: colors.lavender + '24' }]}>
          <Feather name="trending-up" size={18} color={colors.lavender} />
        </View>
        <View style={styles.sectionHeading}>
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>いま注目のカード</Text>
            <Text style={[styles.sectionAction, { color: colors.lavender }]}>
              {featuredExpanded ? '閉じる' : '見る'}
            </Text>
          </View>
          {featuredExpanded ? (
            <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>
              実観測・AI推定の根拠と確信度を添えた参考価格。詳しい情報はカード詳細へ
            </Text>
          ) : (
            <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>価格の動きを見る</Text>
          )}
        </View>
        <Feather name={featuredExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mutedForeground} />
      </Pressable>

      {featuredExpanded ? isLoading ? (
        <Text style={[styles.emptyMessage, { color: colors.mutedForeground }]}>カードを読み込み中...</Text>
      ) : error ? (
        <Pressable accessibilityRole="button" onPress={() => void refetch()}>
          <Text style={[styles.emptyMessage, { color: colors.destructive }]}>注目カードを取得できませんでした。タップして再試行</Text>
        </Pressable>
      ) : featuredCards.length === 0 ? (
        <Text style={[styles.emptyMessage, { color: colors.mutedForeground }]}>現在表示できる注目カードはありません。</Text>
      ) : (
        <View style={styles.scanList}>
          {featuredCards.slice(0, visibleCount).map((card) => (
          <View
            key={card.id}
            style={[
              styles.scanRow,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={[styles.thumb, { backgroundColor: colors.cardElevated }]}>
              <CardThumbnail
                card={{
                  name: card.name,
                  number: card.number,
                  rarity: card.rarity,
                  series: card.series,
                  cardId: card.id,
                }}
                imageUrl={card.imageUrl}
                compact
              />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${card.name}の詳細`}
              testID={`featured-card-${card.id}`}
              onPress={() =>
                router.push({ pathname: '/card/[id]', params: { id: card.id } })
              }
              style={({ pressed }) => [styles.scanDetail, { opacity: pressed ? 0.78 : 1 }]}
            >
              <View style={styles.scanInfo}>
                <View style={styles.scanTitleRow}>
                  <Text numberOfLines={1} style={[styles.cardName, { color: colors.foreground }]}>
                    {card.name}
                  </Text>
                  <Text style={[styles.rarity, { color: colors.lavender, backgroundColor: colors.lavender + '24' }]}>{card.rarity}</Text>
                </View>
                <Text style={[styles.cardNumber, { color: colors.mutedForeground }]}>
                  {card.number}
                </Text>
                <View style={styles.scanMeta}>
                  <CompactRepresentativePrice
                    cardId={card.id}
                    cardNumber={card.number}
                    name={card.name}
                    series={card.series}
                    rarity={card.rarity}
                    style={styles.price}
                  />
                </View>
                <View style={styles.discoveryMeta}>
                  <Text style={[styles.discoveryReason, { color: card.selectionReason === 'discovery' ? colors.lavender : colors.mint }]}>
                    {card.selectionReason === 'scanned' ? '最近見つかった' : '今日の発見'}
                  </Text>
                </View>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>
          ))}
          {visibleCount < featuredCards.length ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setVisibleCount((count) => count + 4)}
              style={({ pressed }) => [
                styles.moreButton,
                { backgroundColor: colors.secondary, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <Feather name="compass" size={18} color={colors.primary} />
              <Text style={[styles.moreText, { color: colors.primary }]}>もっとカードを発見</Text>
              <Feather name="arrow-down" size={17} color={colors.primary} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {featuredExpanded ? (
        <Text style={[styles.priceCaption, { color: colors.mutedForeground }]}>
          確認済み成約以外は参考価格として表示します。価格データがないカードもあります。
        </Text>
      ) : null}
      <DiscoveryCatalog compact={shortScreen} />
    </Screen>
  );
}

import PlayfulScreen from '@/variants/playful/screens/(tabs)/index';
import { useDesignVariant } from '@/hooks/DesignVariantContext';

export default function HomeRoute() {
  const { variant } = useDesignVariant();
  return variant === 'playful' ? <PlayfulScreen /> : <ClassicScreen />;
}
const styles = StyleSheet.create({
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  brandMark: {
    width: 46,
    height: 46,
    borderRadius: 15,
    overflow: 'hidden',
  },
  brandIcon: { width: 46, height: 46 },
  brandName: { fontSize: 20, fontWeight: '700', letterSpacing: 2.2 },
  tagline: { fontSize: 11, marginTop: 3, letterSpacing: 0.2 },
  hero: {
    borderWidth: 1,
    borderRadius: designTokens.radius.hero,
    padding: 16,
    overflow: 'hidden',
    gap: 10,
    shadowColor: designTokens.shadows.soft.shadowColor,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  shortHero: { padding: 12, gap: 6 },
  heroGlow: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 190,
    opacity: 0.18,
    right: -92,
    top: -76,
  },
  heroGlowSmall: {
    position: 'absolute',
    width: 92,
    height: 92,
    borderRadius: 92,
    opacity: 0.12,
    left: -40,
    bottom: -36,
  },
  heroCopy: { gap: 6 },
  shortHeroCopy: { gap: 4 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.6 },
  heroTitle: { fontSize: 26, fontWeight: '700', letterSpacing: -0.7, lineHeight: 31 },
  shortHeroTitle: { fontSize: 22, lineHeight: 26 },
  heroBody: { fontSize: 12, lineHeight: 18 },
  scanButton: {
    minHeight: 49,
    borderRadius: designTokens.radius.medium,
    paddingHorizontal: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shortScanButton: { minHeight: 46 },
  scanButtonText: { flex: 1, fontSize: 15, fontWeight: '700' },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', minHeight: 58, paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderRadius: designTokens.radius.medium, gap: 10,
  },
  shortSectionHeader: { minHeight: 50, paddingVertical: 6 },
  sectionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sectionHeading: { flex: 1, gap: 2 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { flex: 1, fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  sectionAction: { fontSize: 11, fontWeight: '700' },
  sectionHint: { fontSize: 11, lineHeight: 15 },
  sectionCaption: { fontSize: 12, marginTop: 4 },
  seeAll: { fontSize: 12, fontWeight: '700' },
  scanList: { gap: 12 },
  scanRow: {
    minHeight: 94,
    borderWidth: 1,
    borderRadius: designTokens.radius.card,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumb: { width: 62, height: 82, borderRadius: 12, overflow: 'hidden' },
  scanDetail: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanInfo: { flex: 1, gap: 5 },
  scanTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardName: { flex: 1, fontSize: 14, fontWeight: '700', letterSpacing: -0.1 },
  rarity: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: designTokens.radius.pill },
  cardNumber: { fontSize: 11 },
  scanMeta: { marginTop: 4 },
  price: { fontSize: 14, fontWeight: '700' },
  discoveryMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  discoveryReason: { fontSize: 12, fontWeight: '700' },
  moreButton: { borderRadius: designTokens.radius.medium, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  moreText: { fontSize: 13, fontWeight: '700' },
  emptyMessage: { fontSize: 13, lineHeight: 20, paddingVertical: 12 },
  priceCaption: { fontSize: 10, lineHeight: 16 },
});
