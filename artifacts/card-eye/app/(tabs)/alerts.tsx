import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { PriceAlertsPanel } from '@/components/PriceAlertsPanel';
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

      <PriceAlertsPanel />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.6 },
  title: { fontSize: 29, fontWeight: '700', marginTop: 6, letterSpacing: -0.5 },
  bell: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});