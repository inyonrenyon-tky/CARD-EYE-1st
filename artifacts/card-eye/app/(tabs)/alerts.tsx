import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { PriceAlertsPanel } from '@/components/PriceAlertsPanel';
import { useColors } from '@/hooks/useColors';
import { designTokens } from '@/constants/design-tokens';

function ClassicScreen() {
  const colors = useColors();

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>WATCH LIST</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>アラート</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>気になるカードの動きを、静かに見守る</Text>
        </View>
        <View style={[styles.bell, { backgroundColor: colors.accent, borderColor: colors.border }]}>
          <Feather name="bell" size={21} color={colors.primary} />
        </View>
      </View>

      <PriceAlertsPanel />
    </Screen>
  );
}

import PlayfulScreen from '@/variants/playful/screens/(tabs)/alerts';
import { useDesignVariant } from '@/hooks/DesignVariantContext';

export default function AlertsRoute() {
  const { variant } = useDesignVariant();
  return variant === 'playful' ? <PlayfulScreen /> : <ClassicScreen />;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: designTokens.spacing.sm },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.6 },
  title: { fontSize: 29, fontWeight: '700', marginTop: 6, letterSpacing: -0.5 },
  subtitle: { fontSize: 12, marginTop: 7 },
  bell: { width: 46, height: 46, borderRadius: designTokens.radius.medium, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});