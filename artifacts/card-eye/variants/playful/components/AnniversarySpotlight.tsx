import { Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { CompactRepresentativePrice } from '@/variants/playful/components/RepresentativePrice';
import { designTokens } from '@/variants/playful/design-tokens';
import { anniversaryCards, anniversaryOfficialPage } from '@/lib/anniversaryCards';

function AnniversaryCard({ item, index, compact, width }: { item: typeof anniversaryCards[number]; index: number; compact: boolean; width: number }) {
  const colors = useColors();
  const openOfficialPage = () => {
    void Linking.openURL(anniversaryOfficialPage).catch(() => Alert.alert('公式ページを開けませんでした'));
  };
  const accent = colors[item.accent];

  return (
    <View style={[styles.card, compact && styles.compactCard, { width, backgroundColor: colors.card, borderColor: colors.foreground }]}>
      <View style={[styles.glow, { backgroundColor: accent }]} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.name}のカード詳細を見る`}
        testID={`anniversary-price-${index}`}
        onPress={() => router.push({
          pathname: '/card/[id]',
          params: { id: item.id },
        })}
        style={({ pressed }) => [styles.cardDetail, { opacity: pressed ? 0.78 : 1 }]}
      >
        <View style={styles.topRow}>
          <Text style={[styles.number, { color: colors.foreground }]}>DISCOVERY 0{index + 1}</Text>
          <Feather name="arrow-up-right" size={16} color={colors.mutedForeground} />
        </View>
        <View style={[styles.cardBody, compact && styles.compactCardBody]}>
          <Image source={{ uri: item.image }} accessibilityLabel={`${item.name}の公式掲載画像`} resizeMode="contain" style={[styles.cardArt, compact && styles.compactCardArt]} />
          <View style={styles.cardCopy}>
            <Text style={[styles.cardName, { color: colors.foreground }]}>{item.name}</Text>
            <Text style={[styles.detail, { color: colors.mutedForeground }]}>{item.detail}</Text>
          </View>
        </View>
        <CompactRepresentativePrice
          cardId={item.id}
          cardNumber={item.cardNumber}
          name={item.name}
          series={item.series}
          rarity={item.rarity}
          style={styles.price}
        />
      </Pressable>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${item.name}の30周年公式情報を見る`}
        testID={`anniversary-official-${index}`}
        hitSlop={6}
        style={styles.officialLink}
        onPress={openOfficialPage}
      >
        <Text style={[styles.source, { color: colors.foreground }]}>30周年公式情報を見る  →</Text>
      </Pressable>
    </View>
  );
}

export function AnniversarySpotlight({ compact = false }: { compact?: boolean }) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const cardWidth = Math.max(148, (width - 48) / 2);
  return (
    <View style={[styles.section, compact && styles.compactSection]}>
      <View style={styles.headingRow}>
        <View style={styles.heading}>
          <Text style={[styles.eyebrow, { color: colors.foreground }]}>30TH DISCOVERY</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>30周年の、新しい発見</Text>
        </View>
        <View style={[styles.headingMark, { backgroundColor: colors.lavender, borderColor: colors.foreground }]}>
          <Feather name="award" size={17} color={colors.foreground} />
        </View>
      </View>
      <View style={styles.headingCopy}>
        {!compact ? (
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>
            公式発表から気になるカードをピックアップ
          </Text>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {anniversaryCards.map((item, index) => <AnniversaryCard key={item.id} item={item} index={index} compact={compact} width={cardWidth} />)}
      </ScrollView>
      <Text style={[styles.note, { color: colors.mutedForeground }]}>
        {compact ? '公式画像・価格は参考情報。詳しい相場はカード詳細で確認できます。' : '公式掲載画像・価格は参考情報。成約・査定額ではありません。'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8, paddingTop: 2 },
  compactSection: { gap: 2 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { gap: 2 },
  headingCopy: { minHeight: 0 },
  headingMark: { width: 34, height: 34, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title: { fontSize: 18, fontWeight: '900' },
  caption: { fontSize: 11, lineHeight: 16 },
  scroll: { gap: 8, paddingRight: 16 },
  card: {
    width: 192, minHeight: 138, borderWidth: 2, borderRadius: designTokens.radius.card,
    padding: 9, overflow: 'hidden', justifyContent: 'space-between',
    ...designTokens.shadows.soft,
  },
  compactCard: { minHeight: 116, padding: 7 },
  cardDetail: { flex: 1, justifyContent: 'space-between' },
  glow: { position: 'absolute', width: 112, height: 112, borderRadius: 56, opacity: 0.12, right: -32, top: -48 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardBody: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 69 },
  compactCardBody: { minHeight: 54 },
  cardArt: { width: 52, height: 70 },
  compactCardArt: { width: 42, height: 56 },
  cardCopy: { flex: 1, gap: 3 },
  number: { fontSize: 9, letterSpacing: 1, fontWeight: '700' },
  cardName: { fontSize: 15, fontWeight: '800' },
  detail: { fontSize: 10, lineHeight: 14 },
  price: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  officialLink: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  source: { fontSize: 10, fontWeight: '700' },
  note: { fontSize: 10, lineHeight: 15, marginTop: -1 },
});