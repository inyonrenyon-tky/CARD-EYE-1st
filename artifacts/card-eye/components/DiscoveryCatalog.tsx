import { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getListDiscoverCardsQueryKey, useListDiscoverCards } from '@workspace/api-client-react';
import { CardThumbnail } from '@/components/CardThumbnail';
import { useColors } from '@/hooks/useColors';
import { designTokens } from '@/constants/design-tokens';

const PAGE_SIZE = 24;

export function DiscoveryCatalog({ compact = false }: { compact?: boolean }) {
  const colors = useColors();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(0);
      setQuery(input.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [input]);

  const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE, query: query || undefined };
  const { data, isLoading, error, refetch } = useListDiscoverCards(params, {
    query: { queryKey: getListDiscoverCardsQueryKey(params), enabled: expanded, staleTime: 5 * 60 * 1000, retry: false },
  });
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  return (
    <View style={styles.section}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="カードを発見するを開閉"
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        testID="discovery-toggle"
        onPress={() => {
          if (expanded) Keyboard.dismiss();
          setExpanded((current) => !current);
        }}
        style={({ pressed }) => [
          styles.heading,
          compact && styles.compactHeading,
          { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.86 : 1 },
        ]}
      >
        <View style={styles.titleRow}>
          <View style={[styles.headingIcon, { backgroundColor: colors.mint + '24' }]}>
            <Feather name="search" size={17} color={colors.mint} />
          </View>
          <View style={styles.headingText}>
            <Text style={[styles.eyebrow, { color: colors.mint }]}>EXPLORE THE BOOK</Text>
            <Text style={[styles.title, compact && styles.compactTitle, { color: colors.foreground }]}>カードを発見する</Text>
          </View>
          {expanded && data ? <Text style={[styles.total, { color: colors.primary }]}>{data.total}種類</Text> : null}
          {!expanded ? <Text style={[styles.action, { color: colors.mint }]}>探す</Text> : null}
          <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.mutedForeground} />
        </View>
        {expanded ? (
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>
            新しいシリーズから探す。価格情報は各カードの詳細で確認できます。
          </Text>
        ) : null}
      </Pressable>
      {expanded ? (
        <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            accessibilityLabel="カード名・番号・シリーズを検索"
            placeholder="カード名・番号・シリーズで探す"
            placeholderTextColor={colors.mutedForeground}
            value={input}
            onChangeText={setInput}
            maxLength={60}
            style={[styles.searchInput, { color: colors.foreground }]}
          />
        </View>
      ) : null}
      {expanded ? isLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.loading} />
      ) : error ? (
        <Pressable accessibilityRole="button" onPress={() => void refetch()}>
          <Text style={[styles.message, { color: colors.destructive }]}>カードを取得できませんでした。タップして再試行</Text>
        </Pressable>
      ) : data?.cards.length ? (
        <>
          <View style={styles.grid}>
            {data.cards.map((card) => (
              <View
                key={card.id}
                style={[
                  styles.tile,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={styles.image}>
                  <CardThumbnail
                    card={{ name: card.name, number: card.number, series: card.series, rarity: card.rarity, cardId: card.id }}
                    imageUrl={card.imageUrl}
                    compact
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${card.name} ${card.series} ${card.number} の詳細`}
                  onPress={() => router.push({ pathname: '/card/[id]', params: { id: card.id } })}
                  style={({ pressed }) => [styles.tileText, { opacity: pressed ? 0.75 : 1 }]}
                >
                  <Text numberOfLines={2} style={[styles.cardName, { color: colors.foreground }]}>{card.name}</Text>
                  <Text numberOfLines={1} style={[styles.cardNumber, { color: colors.mutedForeground }]}>
                    {card.series} · {card.number}
                  </Text>
                  <Text style={[styles.signal, { color: card.signal === 'new_release' ? colors.mint : colors.lavender }]}>
                    {card.signal === 'recently_scanned' ? '最近見つかった' : card.signal === 'new_release' ? '新しいシリーズ' : 'カード図鑑'}
                    {card.rarity ? ` · ${card.rarity}` : ''}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
          <View style={styles.pager}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="前のカードを見る"
              accessibilityState={{ disabled: page === 0 }}
              disabled={page === 0}
              onPress={() => setPage((current) => current - 1)}
              style={[styles.pageButton, { backgroundColor: colors.secondary, opacity: page === 0 ? 0.4 : 1 }]}
            >
              <Feather name="arrow-left" size={18} color={colors.primary} />
              <Text style={[styles.pageLabel, { color: colors.primary }]}>前へ</Text>
            </Pressable>
            <Text style={[styles.pageCount, { color: colors.mutedForeground }]}>{page + 1} / {totalPages}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="次のカードを見る"
              accessibilityState={{ disabled: page + 1 >= totalPages }}
              disabled={page + 1 >= totalPages}
              onPress={() => setPage((current) => current + 1)}
              style={[styles.pageButton, { backgroundColor: colors.secondary, opacity: page + 1 >= totalPages ? 0.4 : 1 }]}
            >
              <Text style={[styles.pageLabel, { color: colors.primary }]}>次へ</Text>
              <Feather name="arrow-right" size={18} color={colors.primary} />
            </Pressable>
          </View>
        </>
      ) : (
        <Text style={[styles.message, { color: colors.mutedForeground }]}>
          {query ? '一致するカードはまだありません。別の名前でも探してみてください。' : '紹介できるカードはまだありません。'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, paddingBottom: 20 },
  heading: { gap: 5, minHeight: 58, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderRadius: designTokens.radius.medium, justifyContent: 'center' },
  compactHeading: { minHeight: 50, paddingVertical: 6 },
  headingText: { flex: 1, minWidth: 0 },
  headingIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  title: { fontSize: 20, fontWeight: '700', marginTop: 3 },
  compactTitle: { fontSize: 18 },
  action: { fontSize: 11, fontWeight: '700' },
  total: { fontSize: 14, fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 18 },
  search: {
    minHeight: 48, borderWidth: 1, borderRadius: designTokens.radius.medium,
    paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  searchInput: { flex: 1, height: 46, fontSize: 14 },
  loading: { paddingVertical: 30 },
  message: { fontSize: 13, lineHeight: 21, paddingVertical: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '48%', minHeight: 116, borderWidth: 1, borderRadius: designTokens.radius.medium,
    padding: 10, flexDirection: 'row', alignItems: 'center', gap: 9,
  },
  image: { width: 49, height: 69, borderRadius: 6 },
  tileText: { flex: 1, gap: 4 },
  cardName: { fontSize: 12, fontWeight: '700', lineHeight: 17 },
  cardNumber: { fontSize: 10 },
  signal: { fontSize: 10, fontWeight: '600', lineHeight: 14 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  pageButton: { minHeight: 44, borderRadius: designTokens.radius.medium, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 7 },
  pageLabel: { fontSize: 13, fontWeight: '700' },
  pageCount: { fontSize: 12, fontWeight: '600' },
});