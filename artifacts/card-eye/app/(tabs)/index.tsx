import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { CardArtwork } from '@/components/CardArtwork';
import { Screen } from '@/components/Screen';
import { recentScans } from '@/constants/mock-data';
import { useColors } from '@/hooks/useColors';

export default function HomeScreen() {
  const colors = useColors();

  return (
    <Screen>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}>
          <Image source={require('@/assets/images/icon.png')} style={styles.brandIcon} />
        </View>
        <View>
          <Text style={[styles.brandName, { color: colors.foreground }]}>CARD EYE</Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            カードの価値を、もっと身近に。
          </Text>
        </View>
      </View>

      <View style={[styles.hero, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.heroGlow, { backgroundColor: colors.primary }]} />
        <View style={styles.heroCopy}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>CARD VALUE, CLEARER</Text>
          <Text style={[styles.heroTitle, { color: colors.foreground }]}>
            あなたのカードを{'\n'}正しく知る。
          </Text>
          <Text style={[styles.heroBody, { color: colors.mutedForeground }]}>
            まずはカードをスキャンして、{'\n'}価値と状態をチェックしましょう。
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="カードをスキャン"
          testID="scan-card-button"
          onPress={() => router.push({ pathname: '/scan' })}
          style={({ pressed }) => [
            styles.scanButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 },
          ]}
        >
          <Feather name="camera" size={20} color={colors.primaryForeground} />
          <Text style={[styles.scanButtonText, { color: colors.primaryForeground }]}>
            カードをスキャン
          </Text>
          <Feather name="arrow-up-right" size={18} color={colors.primaryForeground} />
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>サンプルカード</Text>
          <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>
            カード情報はサンプルです。価格は詳細画面で実データの有無を確認できます
          </Text>
        </View>
        <Pressable accessibilityRole="button" testID="see-all-scans-button">
          <Text style={[styles.seeAll, { color: colors.primary }]}>すべて見る</Text>
        </Pressable>
      </View>

      <View style={styles.scanList}>
        {recentScans.map((card) => (
          <Pressable
            key={card.id}
            accessibilityRole="button"
            accessibilityLabel={`${card.name}の詳細`}
            testID={`recent-scan-${card.id}`}
            onPress={() =>
              router.push({ pathname: '/card/[id]', params: { id: card.id } })
            }
            style={({ pressed }) => [
              styles.scanRow,
              { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.76 : 1 },
            ]}
          >
            <View style={styles.thumb}>
              <CardArtwork card={card} compact />
            </View>
            <View style={styles.scanInfo}>
              <View style={styles.scanTitleRow}>
                <Text numberOfLines={1} style={[styles.cardName, { color: colors.foreground }]}>
                  {card.name}
                </Text>
                <Text style={[styles.rarity, { color: colors.primary }]}>{card.rarity}</Text>
              </View>
              <Text style={[styles.cardNumber, { color: colors.mutedForeground }]}>
                {card.number}
              </Text>
              <View style={styles.scanMeta}>
                <Text style={[styles.price, { color: colors.mutedForeground }]}>価格は詳細で確認</Text>
                <Text style={[styles.time, { color: colors.mutedForeground }]}>デモ</Text>
              </View>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
    borderRadius: 24,
    padding: 20,
    overflow: 'hidden',
    gap: 22,
  },
  heroGlow: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 190,
    opacity: 0.14,
    right: -92,
    top: -76,
  },
  heroCopy: { gap: 9 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.6 },
  heroTitle: { fontSize: 29, fontWeight: '700', letterSpacing: -0.7, lineHeight: 36 },
  heroBody: { fontSize: 13, lineHeight: 21 },
  scanButton: {
    minHeight: 56,
    borderRadius: 17,
    paddingHorizontal: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scanButtonText: { flex: 1, fontSize: 15, fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 19, fontWeight: '700' },
  sectionCaption: { fontSize: 12, marginTop: 4 },
  seeAll: { fontSize: 12, fontWeight: '700' },
  scanList: { gap: 10 },
  scanRow: {
    minHeight: 94,
    borderWidth: 1,
    borderRadius: 18,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumb: { width: 54, height: 70 },
  scanInfo: { flex: 1, gap: 4 },
  scanTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  cardName: { flex: 1, fontSize: 14, fontWeight: '700' },
  rarity: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  cardNumber: { fontSize: 11 },
  scanMeta: { flexDirection: 'row', alignItems: 'baseline', gap: 9, marginTop: 4 },
  price: { fontSize: 14, fontWeight: '700' },
  time: { fontSize: 10 },
});
