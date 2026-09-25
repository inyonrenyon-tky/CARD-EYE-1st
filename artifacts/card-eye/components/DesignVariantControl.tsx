import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useDesignVariant, type DesignVariant } from '@/hooks/DesignVariantContext';

const options: { value: DesignVariant; label: string }[] = [
  { value: 'playful', label: 'PLAYFUL（メイン）' },
  { value: 'classic', label: 'CURRENT（従来）' },
];

export function DesignVariantControl() {
  const colors = useColors();
  const { variant, setVariant } = useDesignVariant();

  return (
    <View accessibilityLabel="Design appearance" style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>デザイン</Text>
      <View style={styles.options}>
        {options.map((option) => {
          const selected = variant === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${option.label} design`}
              testID={`design-variant-${option.value}`}
              onPress={() => setVariant(option.value)}
              style={({ pressed }) => [
                styles.option,
                { backgroundColor: selected ? colors.primary : 'transparent', opacity: pressed ? 0.76 : 1 },
              ]}
            >
              <Text style={[styles.optionText, { color: selected ? colors.primaryForeground : colors.foreground }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  label: { fontSize: 11, fontWeight: '700' },
  options: { flexDirection: 'row', gap: 8 },
  option: { minHeight: 38, flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  optionText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
});