import { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { designTokens } from '@/variants/playful/design-tokens';

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  compact?: boolean;
};

export function Screen({ children, scroll = true, compact = false }: ScreenProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const contentStyle = [
    styles.content,
    compact && styles.compactContent,
    {
        paddingTop: (Platform.OS === 'web' ? Math.max(insets.top, 67) : insets.top) +
          (compact ? designTokens.spacing.md : designTokens.spacing.xl),
      paddingBottom: Platform.OS === 'web' ? 112 : insets.bottom + 104,
    },
  ];

  if (!scroll) {
    return <View style={[styles.screen, { backgroundColor: colors.background }, contentStyle]}>{children}</View>;
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={contentStyle}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      bounces
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: designTokens.spacing.lg,
    gap: designTokens.spacing.xl,
  },
  compactContent: {
    gap: 10,
  },
});