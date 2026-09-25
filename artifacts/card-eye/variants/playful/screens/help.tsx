import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/variants/playful/components/Screen';
import { designTokens } from '@/variants/playful/design-tokens';
import { useColors } from '@/hooks/useColors';

const steps = [
  { title: '1. カードを撮影', description: 'ホームからスキャンを開き、カードの写真を撮影または選択します。' },
  { title: '2. 推定結果を確認', description: 'カード情報と状態チェックの結果を確認します。読み取れない項目は「判断できません」と表示されます。' },
  { title: '3. コレクションに保存', description: '状態チェック画面から保存すると、カード情報と状態メモを後から確認できます。写真自体は保存されません。' },
];

export default function HelpScreen() {
  const colors = useColors();

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="マイページに戻る"
          onPress={() => router.replace('/profile')}
          style={styles.back}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View>
          <Text style={[styles.kicker, { color: colors.tint }]}>FIELD NOTES / GUIDE</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>使い方</Text>
        </View>
      </View>

      <View style={[styles.intro, { backgroundColor: colors.softYellow, borderColor: colors.foreground }]}>
        <View style={[styles.introIcon, { backgroundColor: colors.coral, borderColor: colors.foreground }]}>
          <Feather name="compass" size={20} color={colors.primary} />
        </View>
        <View style={styles.introCopy}>
          <Text style={[styles.introTitle, { color: colors.foreground }]}>カードを見つける3ステップ</Text>
          <Text style={[styles.introBody, { color: colors.mutedForeground }]}>撮影からコレクションまで、ゆっくり確認できます。</Text>
        </View>
      </View>
      <View style={styles.steps}>
        {steps.map((step, index) => (
          <View key={step.title} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.foreground }]}>
            <View style={[styles.stepNumber, { backgroundColor: index === 0 ? colors.softYellow : index === 1 ? colors.lavender : colors.mint, borderColor: colors.foreground }]}>
              <Text style={[styles.stepNumberText, { color: colors.primaryForeground }]}>{index + 1}</Text>
            </View>
            <View style={styles.cardCopy}>
              <Text style={[styles.stepTitle, { color: colors.foreground }]}>{step.title.replace(`${index + 1}. `, '')}</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>{step.description}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={[styles.note, { backgroundColor: colors.mint, borderColor: colors.foreground }]}>
        <Feather name="alert-circle" size={18} color={colors.primary} />
        <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
          状態はAIによる画像上の推定です。実物の状態や専門鑑定機関による鑑定結果を保証するものではありません。実際の相場データはまだ取得できません。
        </Text>
      </View>
      <Text style={[styles.footer, { color: colors.mutedForeground }]}>
        保存したカードと表示名は、この端末内に保存されます。ログインしてもカードと表示名のクラウド同期はありません。
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { minWidth: 42, minHeight: 42, justifyContent: 'center' },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginBottom: 3 },
  title: { fontSize: 25, fontWeight: '900', letterSpacing: -0.4 },
  intro: { borderWidth: 2, borderRadius: designTokens.radius.card, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, ...designTokens.shadows.soft },
  introIcon: { width: 42, height: 42, borderWidth: 1.5, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  introCopy: { flex: 1, gap: 3 },
  introTitle: { fontSize: 15, fontWeight: '900' },
  introBody: { fontSize: 12, lineHeight: 18 },
  steps: { gap: 10 },
  card: { borderWidth: 2, borderRadius: designTokens.radius.card, padding: 15, flexDirection: 'row', gap: 12, ...designTokens.shadows.soft },
  stepNumber: { width: 30, height: 30, borderWidth: 1.5, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: 13, fontWeight: '700' },
  cardCopy: { flex: 1, gap: 5 },
  stepTitle: { fontSize: 15, fontWeight: '800' },
  body: { fontSize: 12, lineHeight: 19 },
  note: { borderWidth: 1.5, borderRadius: designTokens.radius.medium, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 19 },
  footer: { fontSize: 11, lineHeight: 18, textAlign: 'center' },
});