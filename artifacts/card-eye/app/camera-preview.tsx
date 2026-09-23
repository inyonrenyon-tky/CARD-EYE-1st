import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

export default function CameraPreviewScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { uri } = useLocalSearchParams<{ uri?: string }>();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="撮影画面に戻る"
          testID="preview-retake-top-button"
          onPress={() => router.replace('/camera')}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>撮影画像を確認</Text>
        <View style={styles.topSpacer} />
      </View>

      <View style={styles.content}>
        <View style={[styles.previewFrame, { borderColor: colors.border }]}>
          {uri ? (
            <Image source={{ uri }} resizeMode="contain" style={styles.previewImage} />
          ) : (
            <View style={[styles.noImage, { backgroundColor: colors.card }]}>
              <Feather name="image" size={30} color={colors.mutedForeground} />
              <Text style={[styles.noImageText, { color: colors.mutedForeground }]}>
                画像を読み込めませんでした
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.helper, { color: colors.mutedForeground }]}>
          カードがはっきり写っているか確認してください
        </Text>
      </View>

      <View style={[styles.actions, { paddingBottom: insets.bottom + 20 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="撮り直す"
          testID="preview-retake-button"
          onPress={() => router.replace('/camera')}
          style={({ pressed }) => [
            styles.secondaryButton,
            { backgroundColor: colors.secondary, borderColor: colors.border, opacity: pressed ? 0.72 : 1 },
          ]}
        >
          <Feather name="refresh-cw" size={18} color={colors.foreground} />
          <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>撮り直す</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="この写真を解析"
          testID="analyze-photo-button"
          disabled={!uri}
          onPress={() =>
            router.push({ pathname: '/analysis-result', params: { uri: uri ?? '' } })
          }
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.primary, opacity: !uri ? 0.45 : pressed ? 0.78 : 1 },
          ]}
        >
          <Feather name="maximize" size={18} color={colors.primaryForeground} />
          <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
            この写真を解析
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: { minHeight: 72, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700' },
  topSpacer: { width: 42, height: 42 },
  content: { flex: 1, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', gap: 16 },
  previewFrame: { width: '100%', maxWidth: 360, aspectRatio: 0.75, borderWidth: 1, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  previewImage: { width: '100%', height: '100%' },
  noImage: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', gap: 10 },
  noImageText: { fontSize: 13 },
  helper: { fontSize: 13, textAlign: 'center' },
  actions: { paddingHorizontal: 20, paddingTop: 16, gap: 10 },
  secondaryButton: { minHeight: 54, borderRadius: 17, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  secondaryButtonText: { fontSize: 15, fontWeight: '700' },
  primaryButton: { minHeight: 54, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  primaryButtonText: { fontSize: 15, fontWeight: '700' },
});