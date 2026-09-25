import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CardThumbnail } from '@/components/CardThumbnail';
import { Screen } from '@/components/Screen';
import { useColors } from '@/hooks/useColors';
import { useSavedCards } from '@/hooks/SavedCardsContext';

export default function CollectionScreen() {
  const colors = useColors();
  const { cards, isLoaded, loadError } = useSavedCards();

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>MY CARDS</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>コレクション</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="カードを追加"
          testID="add-card-button"
          onPress={() => router.push('/scan')}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Feather name="plus" size={22} color={colors.primaryForeground} />
        </Pressable>
      </View>

      <View style={[styles.valueCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.valueLabel, { color: colors.mutedForeground }]}>保存したカード</Text>
        <Text style={[styles.totalValue, { color: colors.foreground }]}>
          {isLoaded && !loadError ? `${cards.length}枚` : '—'}
        </Text>
        <Text style={[styles.valueNote, { color: colors.mutedForeground }]}>
          写真は保存していません。市場価格はまだ取得できません。
        </Text>
      </View>

      {!isLoaded ? (
        <Text style={{ color: colors.mutedForeground }}>コレクションを読み込み中...</Text>
      ) : loadError ? (
        <Text style={{ color: colors.destructive }}>{loadError}</Text>
      ) : cards.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
            <Pressable
              key={card.id}
              accessibilityRole="button"
              accessibilityLabel={`${card.name}のコレクション詳細`}
              testID={`collection-card-${card.id}`}
              onPress={() => router.push({ pathname: '/card/[id]', params: { id: card.id } })}
              style={({ pressed }) => [{ width: '31.5%', opacity: pressed ? 0.75 : 1 }]}
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
              <Text numberOfLines={1} style={[styles.cardName, { color: colors.foreground }]}>
                {card.name}
              </Text>
              <Text numberOfLines={1} style={[styles.cardPrice, { color: colors.mutedForeground }]}>
                {card.number}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.6 },
  title: { fontSize: 29, fontWeight: '700', marginTop: 6, letterSpacing: -0.5 },
  addButton: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueCard: { borderWidth: 1, borderRadius: 21, padding: 18, gap: 8 },
  valueLabel: { fontSize: 12, fontWeight: '600' },
  totalValue: { fontSize: 32, fontWeight: '700', letterSpacing: -1 },
  valueNote: { fontSize: 11 },
  emptyState: { borderWidth: 1, borderRadius: 18, padding: 22, alignItems: 'center', gap: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptyAction: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  cardName: { fontSize: 12, fontWeight: '700', marginTop: 8 },
  cardPrice: { fontSize: 11, marginTop: 3 },
});