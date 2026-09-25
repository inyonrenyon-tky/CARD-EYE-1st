import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CardThumbnail } from '@/variants/playful/components/CardThumbnail';
import { Screen } from '@/variants/playful/components/Screen';
import { useColors } from '@/hooks/useColors';
import { useSavedCards } from '@/hooks/SavedCardsContext';
import { designTokens } from '@/variants/playful/design-tokens';

export default function CollectionScreen() {
  const colors = useColors();
  const { cards, isLoaded, loadError } = useSavedCards();

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>YOUR CARD BOOK</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>コレクション</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="カードを追加"
          testID="add-card-button"
          onPress={() => router.push('/scan')}
          style={({ pressed }) => [
            styles.addButton,
             { backgroundColor: colors.primary, borderColor: colors.foreground, opacity: pressed ? 0.78 : 1 },
          ]}
        >
          <Feather name="plus" size={22} color={colors.primaryForeground} />
        </Pressable>
      </View>

        <View style={[styles.valueCard, { backgroundColor: colors.accent, borderColor: colors.foreground }]}>
        <View style={[styles.valueOrb, { backgroundColor: colors.mint }]} />
        <Text style={[styles.valueLabel, { color: colors.mutedForeground }]}>保存したカード</Text>
        <Text style={[styles.totalValue, { color: colors.foreground }]}>
          {isLoaded && !loadError ? `${cards.length}枚` : '—'}
        </Text>
        <Text style={[styles.valueNote, { color: colors.mutedForeground }]}>
          写真は保存していません。1点価格と詳しい相場は各カードの詳細で確認できます。
        </Text>
      </View>

      {!isLoaded ? (
        <Text style={{ color: colors.mutedForeground }}>コレクションを読み込み中...</Text>
      ) : loadError ? (
        <Text style={{ color: colors.destructive }}>{loadError}</Text>
      ) : cards.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.foreground }]}>
          <Feather name="layers" size={27} color={colors.primary} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>保存したカードはありません</Text>
          <Text style={[styles.valueNote, { color: colors.mutedForeground }]}>
            写真を解析したあと、状態チェック画面から保存できます。
          </Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/scan')}>
            <Text style={[styles.emptyAction, { color: colors.primary }]}>カードをスキャンする →</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.grid}>
          {cards.map((card) => (
             <View
              key={card.id}
              style={styles.gridItem}
            >
              <CardThumbnail
                card={{
                  name: card.name,
                  series: card.series,
                  number: card.number,
                  rarity: card.rarity,
                  cardId: card.catalogCardId,
                }}
                tone="blue"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${card.name}のコレクション詳細`}
                testID={`collection-card-${card.id}`}
                onPress={() => router.push({ pathname: '/card/[id]', params: { id: card.id } })}
                style={({ pressed }) => [
                  styles.cardMeta,
                   { backgroundColor: colors.card, borderColor: colors.foreground, opacity: pressed ? 0.78 : 1 },
                ]}
              >
                <Text numberOfLines={1} style={[styles.cardName, { color: colors.foreground }]}>
                  {card.name}
                </Text>
                <Text numberOfLines={1} style={[styles.cardPrice, { color: colors.mutedForeground }]}>
                  {card.number}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.6 },
  title: { fontSize: 29, fontWeight: '700', marginTop: 6, letterSpacing: -0.5 },
  addButton: {
    width: 46,
    height: 46,
    borderRadius: designTokens.radius.medium,
    borderWidth: 2,
    borderColor: designTokens.colors.light.foreground,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: designTokens.shadows.soft.shadowColor,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 },
    elevation: 3,
  },
  valueCard: {
    borderWidth: 2,
    borderRadius: 22,
    padding: 20,
    gap: 8,
    overflow: 'hidden',
    shadowColor: designTokens.shadows.soft.shadowColor,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 4, height: 4 },
    elevation: 4,
  },
  valueOrb: { position: 'absolute', width: 150, height: 150, borderRadius: 150, right: -70, top: -78, opacity: 0.14 },
  valueLabel: { fontSize: 12, fontWeight: '600' },
  totalValue: { fontSize: 32, fontWeight: '700', letterSpacing: -1 },
  valueNote: { fontSize: 11 },
  emptyState: { borderWidth: 2, borderRadius: 18, padding: 24, alignItems: 'center', gap: 12, shadowColor: designTokens.shadows.soft.shadowColor, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 3, height: 3 }, elevation: 3 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptyAction: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 20 },
  gridItem: { width: '47.5%', borderRadius: 14, overflow: 'hidden' },
  cardMeta: { paddingTop: 9, paddingBottom: 10, paddingHorizontal: 9, gap: 3, borderWidth: 2, borderTopWidth: 0, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  cardName: { fontSize: 13, fontWeight: '800' },
  cardPrice: { fontSize: 12 },
});