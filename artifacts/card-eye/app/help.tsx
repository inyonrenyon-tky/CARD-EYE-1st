import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
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
        <Text style={[styles.title, { color: colors.foreground }]}>使い方</Text>
      </View>

      <View style={styles.steps}>
        {steps.map((step) => (
          <View key={step.title} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>{step.title}</Text>
            <Text style={[styles.body, { color: colors.mutedForeground }]}>{step.description}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.note, { backgroundColor: colors.secondary }]}>
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
  title: { fontSize: 22, fontWeight: '700' },
  steps: { gap: 10 },
  card: { borderWidth: 1, borderRadius: 17, padding: 16, gap: 7 },
  stepTitle: { fontSize: 15, fontWeight: '700' },
  body: { fontSize: 12, lineHeight: 19 },
  note: { borderRadius: 15, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 19 },
  footer: { fontSize: 11, lineHeight: 18, textAlign: 'center' },
});