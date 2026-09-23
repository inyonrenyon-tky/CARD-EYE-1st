import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { useColors } from '@/hooks/useColors';
import { useDeviceProfile } from '@/hooks/DeviceProfileContext';
import { useSavedCards } from '@/hooks/SavedCardsContext';

const menuItems = [
  { icon: 'grid' as const, label: '保存したカード', description: 'コレクションを見る', href: '/collection' as const },
  { icon: 'camera' as const, label: 'カードをスキャン', description: '写真からカードを確認', href: '/scan' as const },
  { icon: 'help-circle' as const, label: '使い方とデータについて', description: '保存と推定結果の注意点', href: '/help' as const },
];

export default function ProfileScreen() {
  const colors = useColors();
  const { displayName, isLoaded, loadError } = useDeviceProfile();
  const { cards, isLoaded: cardsLoaded, loadError: cardsError } = useSavedCards();

  return (
    <Screen>
      <View>
        <Text style={[styles.eyebrow, { color: colors.primary }]}>MY PAGE</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>マイページ</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="表示名を設定"
        testID="profile-settings-link"
        onPress={() => router.push('/profile-settings')}
        style={({ pressed }) => [
          styles.profileCard,
          { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
        ]}
      >
        <View style={[styles.avatar, { backgroundColor: colors.accent }]}>
          <Feather name="user" size={26} color={colors.primary} />
        </View>
        <View style={styles.profileText}>
          <Text style={[styles.userName, { color: colors.foreground }]}>
            {!isLoaded ? '読み込み中...' : loadError ? '表示名を読み込めません' : displayName}
          </Text>
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>この端末の表示名を設定</Text>
        </View>
        <Feather name="chevron-right" size={19} color={colors.mutedForeground} />
      </Pressable>

      <View style={[styles.collectionCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
        <View>
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>保存したカード</Text>
          <Text style={[styles.count, { color: colors.foreground }]}>
            {!cardsLoaded ? '読み込み中' : cardsError ? '読み込みエラー' : `${cards.length}枚`}
          </Text>
        </View>
        <Feather name="layers" size={23} color={colors.primary} />
      </View>

      <View style={styles.menuSection}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>メニュー</Text>
        <View style={styles.menu}>
          {menuItems.map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              testID={`profile-menu-${item.href.slice(1)}`}
              onPress={() => router.push(item.href)}
              style={({ pressed }) => [
                styles.menuRow,
                { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={[styles.menuIcon, { backgroundColor: colors.secondary }]}>
                <Feather name={item.icon} size={18} color={colors.primary} />
              </View>
              <View style={styles.menuCopy}>
                <Text style={[styles.menuLabel, { color: colors.foreground }]}>{item.label}</Text>
                <Text style={[styles.menuDescription, { color: colors.mutedForeground }]}>{item.description}</Text>
              </View>
              <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
            </Pressable>
          ))}
        </View>
      </View>

      <Text style={[styles.footer, { color: colors.mutedForeground }]}>
        ログイン不要。表示名と保存したカードは、この端末内で管理されます。
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.6 },
  title: { fontSize: 29, fontWeight: '700', marginTop: 6, letterSpacing: -0.5 },
  profileCard: { minHeight: 90, borderWidth: 1, borderRadius: 21, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  profileText: { flex: 1, gap: 5 },
  userName: { fontSize: 16, fontWeight: '700' },
  caption: { fontSize: 12 },
  collectionCard: { borderWidth: 1, borderRadius: 18, padding: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { fontSize: 23, fontWeight: '700', marginTop: 7 },
  menuSection: { gap: 6 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  menu: { gap: 0 },
  menuRow: { minHeight: 68, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  menuCopy: { flex: 1, gap: 4 },
  menuLabel: { fontSize: 14, fontWeight: '600' },
  menuDescription: { fontSize: 11 },
  footer: { fontSize: 11, lineHeight: 18, textAlign: 'center' },
});