import { Feather } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { CardRecord } from '@/constants/mock-data';

const toneColors: Record<CardRecord['tone'], string> = {
  blue: '#2563eb',
  violet: '#7c3aed',
  orange: '#ea580c',
  green: '#059669',
};

type CardArtworkProps = {
  card: Pick<CardRecord, 'name' | 'number' | 'tone'>;
  compact?: boolean;
};

export function CardArtwork({ card, compact = false }: CardArtworkProps) {
  const colors = useColors();
  const accent = toneColors[card.tone];

  return (
    <View
      accessible
      accessibilityLabel={`${card.name}のカード画像`}
      style={[styles.frame, compact && styles.compactFrame, { backgroundColor: accent }]}
    >
      <View style={styles.inner}>
        <View style={styles.topLine}>
          <Text style={styles.miniLabel}>POKÉMON</Text>
          <View style={styles.starRow}>
            <Feather name="star" size={compact ? 8 : 10} color="#fff" />
            <Feather name="star" size={compact ? 8 : 10} color="#fff" />
          </View>
        </View>
        <Image
          source={require('@/assets/images/icon.png')}
          resizeMode="contain"
          style={[styles.logo, compact && styles.compactLogo]}
        />
        <View style={styles.bottomLine}>
          <Text numberOfLines={1} style={[styles.cardName, compact && styles.compactName]}>
            {card.name}
          </Text>
          <Text style={[styles.cardNumber, compact && styles.compactNumber]}>
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
    borderRadius: 14,
    overflow: 'hidden',
    padding: 4,
  },
  compactFrame: {
    borderRadius: 10,
    padding: 3,
  },
  inner: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    borderRadius: 11,
    padding: 8,
    justifyContent: 'space-between',
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  miniLabel: {
    color: 'rgba(255,255,255,0.78)',
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
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  compactName: {
    fontSize: 9,
  },
  cardNumber: {
    color: 'rgba(255,255,255,0.74)',
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