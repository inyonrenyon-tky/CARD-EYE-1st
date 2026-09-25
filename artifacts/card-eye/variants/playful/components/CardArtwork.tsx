import { Feather } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { CardRecord } from '@/constants/mock-data';
import { designTokens } from '@/variants/playful/design-tokens';

type CardArtworkProps = {
  card: Pick<CardRecord, 'name' | 'number' | 'tone'>;
  compact?: boolean;
};

export function CardArtwork({ card, compact = false }: CardArtworkProps) {
  const colors = useColors();
  const toneColors: Record<CardRecord['tone'], string> = {
    blue: colors.sky,
    violet: colors.lavender,
    orange: colors.coral,
    green: colors.mint,
  };
  const accent = toneColors[card.tone];

  return (
    <View
      accessible
      accessibilityLabel={`${card.name}のカード画像`}
      style={[styles.frame, compact && styles.compactFrame, { backgroundColor: accent, borderColor: colors.foreground }]}
    >
      <View style={styles.inner}>
        <View style={styles.topLine}>
          <Text style={[styles.miniLabel, { color: colors.primaryForeground }]}>CARD EYE</Text>
          <View style={styles.starRow}>
            <Feather name="star" size={compact ? 8 : 10} color={colors.primaryForeground} />
            <Feather name="star" size={compact ? 8 : 10} color={colors.primaryForeground} />
          </View>
        </View>
        <Image
          source={require('@/assets/images/icon.png')}
          resizeMode="contain"
          style={[styles.logo, compact && styles.compactLogo]}
        />
        <View style={styles.bottomLine}>
          <Text numberOfLines={1} style={[styles.cardName, compact && styles.compactName, { color: colors.primaryForeground }]}>
            {card.name}
          </Text>
          <Text style={[styles.cardNumber, compact && styles.compactNumber, { color: colors.primaryForeground }]}>
            {card.number}
          </Text>
        </View>
      </View>
      <View style={[styles.glow, { backgroundColor: colors.primary }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    aspectRatio: 0.72,
    borderRadius: designTokens.radius.medium,
    overflow: 'hidden',
    borderWidth: 2,
    padding: 4,
  },
  compactFrame: {
    borderRadius: designTokens.radius.small,
    padding: 3,
  },
  inner: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(48,35,79,0.34)',
    borderRadius: designTokens.radius.small,
    padding: 8,
    justifyContent: 'space-between',
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  miniLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
  },
  starRow: {
    flexDirection: 'row',
    gap: 2,
  },
  logo: {
    width: '76%',
    height: '44%',
    alignSelf: 'center',
    opacity: 0.95,
  },
  compactLogo: {
    width: '72%',
    height: '38%',
  },
  bottomLine: {
    gap: 3,
  },
  cardName: {
    fontSize: 12,
    fontWeight: '700',
  },
  compactName: {
    fontSize: 9,
  },
  cardNumber: {
    fontSize: 8,
    fontWeight: '500',
  },
  compactNumber: {
    fontSize: 7,
  },
  glow: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 64,
    opacity: 0.16,
    top: '32%',
    left: '40%',
  },
});