import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/variants/playful/components/Screen';
import { PriceAlertsPanel } from '@/variants/playful/components/PriceAlertsPanel';
import { useColors } from '@/hooks/useColors';
import { designTokens } from '@/variants/playful/design-tokens';

export default function AlertsScreen() {
  const colors = useColors();

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>WATCH LIST</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>アラート</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>気になるカードの動きを、静かに見守る</Text>
        </View>
        <View style={[styles.bell, { backgroundColor: colors.mint, borderColor: colors.foreground }]}>
          <Feather name="bell" size={21} color={colors.primary} />
        </View>
      </View>

      <PriceAlertsPanel />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: designTokens.spacing.sm, paddingBottom: 10 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  title: { fontSize: 30, fontWeight: '900', marginTop: 6, letterSpacing: -0.8 },
  subtitle: { fontSize: 12, marginTop: 7 },
  bell: { width: 46, height: 46, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '5deg' }], ...designTokens.shadows.soft },
});