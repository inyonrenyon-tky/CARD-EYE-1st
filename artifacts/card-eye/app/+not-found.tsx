import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { designTokens } from '@/constants/design-tokens';
import { Feather } from '@expo/vector-icons';

function ClassicScreen() {
  const colors = useColors();

  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.icon, { backgroundColor: colors.accent }]}>
          <Feather name="map" size={24} color={colors.primary} />
        </View>
        <Text style={[styles.kicker, { color: colors.tint }]}>CARD EYE / FIELD NOTES</Text>
        <Text style={[styles.title, { color: colors.foreground }]}>このページは見つかりません</Text>
        <Text style={[styles.body, { color: colors.mutedForeground }]}>お探しのカードページは、別の場所へ移動したようです。</Text>

        <Link href="/" style={[styles.link, { backgroundColor: colors.primary }]}>
          <Text style={[styles.linkText, { color: colors.primaryForeground }]}>
            ホームへ戻る
          </Text>
        </Link>
      </View>
    </>
  );
}

import PlayfulScreen from '@/variants/playful/screens/+not-found';
import { useDesignVariant } from '@/hooks/DesignVariantContext';

export default function NotFoundRoute() {
  const { variant } = useDesignVariant();
  return variant === 'playful' ? <PlayfulScreen /> : <ClassicScreen />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  title: {
    fontSize: 24,
    lineHeight: 31,
    fontWeight: '700',
    textAlign: 'center',
  },
  icon: {
    width: 62,
    height: 62,
    borderRadius: designTokens.radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.3,
  },
  body: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    maxWidth: 290,
  },
  link: {
    marginTop: 10,
    paddingVertical: 13,
    paddingHorizontal: 22,
    borderRadius: designTokens.radius.pill,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
