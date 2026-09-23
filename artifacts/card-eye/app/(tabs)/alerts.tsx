import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { useColors } from '@/hooks/useColors';

export default function AlertsScreen() {
  const colors = useColors();

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>WATCH LIST</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>アラート</Text>
        </View>
        <View style={[styles.bell, { backgroundColor: colors.secondary }]}>
          <Feather name="bell" size={21} color={colors.primary} />
        </View>
      </View>

      <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.accent }]}>
          <Feather name="bell" size={22} color={colors.primary} />
        </View>
        <Text style={[styles.infoTitle, { color: colors.foreground }]}>価格の変化を見逃さない</Text>
        <Text style={[styles.infoBody, { color: colors.mutedForeground }]}>
          気になるカードを登録すると、価格の変化をお知らせします。
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="アラートを作成"
          testID="create-alert-button"
          onPress={() => undefined}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Feather name="plus" size={17} color={colors.primaryForeground} />
          <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
            アラートを作成
          </Text>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>登録中のアラート</Text>
        <Text style={[styles.count, { color: colors.mutedForeground }]}>0件</Text>
      </View>
      <View style={[styles.empty, { borderColor: colors.border }]}>
        <Feather name="sliders" size={24} color={colors.mutedForeground} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>まだアラートはありません</Text>
        <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
          カードの価格を定期的にチェックしたいときに便利です。
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.6 },
  title: { fontSize: 29, fontWeight: '700', marginTop: 6, letterSpacing: -0.5 },
  bell: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  infoCard: { borderWidth: 1, borderRadius: 21, padding: 20, alignItems: 'center', gap: 10 },
  iconCircle: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  infoTitle: { fontSize: 18, fontWeight: '700' },
  infoBody: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  primaryButton: { width: '100%', minHeight: 50, borderRadius: 15, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 7 },
  primaryButtonText: { fontSize: 14, fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  count: { fontSize: 12 },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 20, padding: 28, minHeight: 190, alignItems: 'center', justifyContent: 'center', gap: 9 },
  emptyTitle: { fontSize: 15, fontWeight: '700', marginTop: 3 },
  emptyBody: { fontSize: 12, lineHeight: 19, textAlign: 'center' },
});