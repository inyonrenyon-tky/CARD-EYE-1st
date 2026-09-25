import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { designTokens } from '@/variants/playful/design-tokens';
import { Feather } from '@expo/vector-icons';

export default function NotFoundScreen() {
  const colors = useColors();

  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.icon, { backgroundColor: colors.coral, borderColor: colors.foreground }]}>
          <Feather name="map" size={24} color={colors.primaryForeground} />
        </View>
        <Text style={[styles.kicker, { color: colors.tint }]}>CARD EYE / FIELD NOTES</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>このページは見つかりません</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>お探しのカードページは、別の場所へ移動したようです。</Text>

        <Link href="/" style={[styles.link, { backgroundColor: colors.primary, borderColor: colors.foreground }]}>
          <Text style={[styles.linkText, { color: colors.primaryForeground }]}>
            ホームへ戻る
          </Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 10,
  },
  title: {
    fontSize: 24,
    lineHeight: 31,
    fontWeight: '700',
    textAlign: 'center',
  },
  icon: {
    width: 66,
    height: 66,
    borderWidth: 2,
    borderRadius: designTokens.radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  body: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 290,
  },
  link: {
    marginTop: 14,
    paddingVertical: 13,
    paddingHorizontal: 22,
    borderRadius: designTokens.radius.pill,
    borderWidth: 2,
    ...designTokens.shadows.soft,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '900',
  },
});
