import { Feather } from '@expo/vector-icons';
import { CameraView, type FlashMode, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { designTokens } from '@/variants/playful/design-tokens';
import { useScan } from '@/hooks/ScanContext';
import { holdPhoto, PhotoReadError } from '@/lib/readPhoto';
import { StatusBar } from 'expo-status-bar';

export default function CameraScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setPhotoUri } = useScan();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState<FlashMode>('off');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const openPreview = async (uri: string) => {
    setPhotoUri(await holdPhoto(uri));
    router.push('/camera-preview');
  };

  const takePhoto = async () => {
    if (!cameraRef.current || !isCameraReady || isBusy) return;

    setIsBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        shutterSound: true,
      });
      if (photo?.uri) {
        await openPreview(photo.uri);
      }
    } catch (error) {
      Alert.alert('撮影できませんでした', error instanceof PhotoReadError ? error.message : 'もう一度お試しください。');
    } finally {
      setIsBusy(false);
    }
  };

  const chooseFromLibrary = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        await openPreview(result.assets[0].uri);
      }
    } catch (error) {
      Alert.alert('写真を選択できませんでした', error instanceof PhotoReadError ? error.message : 'もう一度お試しください。');
    } finally {
      setIsBusy(false);
    }
  };

  const openSettings = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('カメラ権限が必要です', 'ブラウザのアドレスバーからカメラを許可してください。');
      return;
    }

    try {
      await Linking.openSettings();
    } catch {
      Alert.alert('設定を開けませんでした', '端末の設定からカメラの権限を変更してください。');
    }
  };

  if (!permission) {
    return <PermissionState title="カメラを準備しています..." colors={colors} />;
  }

  if (!permission.granted) {
    const permanentlyDenied = permission.status === 'denied' && !permission.canAskAgain;

    return (
      <PermissionState
        title="カメラへのアクセスが必要です"
        description="カードを撮影するため、カメラの使用を許可してください。"
        colors={colors}
        actionLabel={permanentlyDenied ? '設定を開く' : 'カメラを許可する'}
        onAction={
          permanentlyDenied
            ? openSettings
            : async () => {
                await requestPermission();
              }
        }
        onBack={() => router.back()}
      />
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        flash={flash}
        mode="picture"
        onCameraReady={() => setIsCameraReady(true)}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="カメラを閉じる"
            testID="camera-back-button"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.iconButton,
               { backgroundColor: colors.background, borderColor: colors.foreground, opacity: pressed ? 0.7 : 0.92 },
            ]}
          >
            <Feather name="x" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.topTitle, { color: colors.primaryForeground }]}>カードを撮影</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={flash === 'on' ? 'フラッシュをオフ' : 'フラッシュをオン'}
            testID="camera-flash-button"
            onPress={() => setFlash((current) => (current === 'on' ? 'off' : 'on'))}
            style={({ pressed }) => [
              styles.iconButton,
              {
                 backgroundColor: flash === 'on' ? colors.accent : colors.background,
                 borderColor: colors.foreground,
                opacity: pressed ? 0.7 : 0.9,
              },
            ]}
          >
            <Feather
              name={flash === 'on' ? 'zap' : 'zap-off'}
              size={19}
              color={colors.foreground}
            />
          </Pressable>
        </View>

        <View style={styles.guideArea}>
           <View style={[styles.guideFrame, { borderColor: colors.primaryForeground }]}>
            <View style={[styles.corner, styles.cornerTopLeft, { borderColor: colors.primary }]} />
            <View style={[styles.corner, styles.cornerTopRight, { borderColor: colors.primary }]} />
            <View style={[styles.corner, styles.cornerBottomLeft, { borderColor: colors.primary }]} />
            <View style={[styles.corner, styles.cornerBottomRight, { borderColor: colors.primary }]} />
          </View>
            <View style={[styles.guidePill, { backgroundColor: colors.foreground }]}>
             <Feather name="eye" size={14} color={colors.primaryForeground} />
             <Text style={[styles.guideText, { color: colors.primaryForeground }]}>
               カード全体が枠内に入るように撮影してください
             </Text>
           </View>
        </View>

          <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + 20, backgroundColor: colors.background, borderColor: colors.foreground }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="写真ライブラリから選択"
            testID="camera-library-button"
            onPress={chooseFromLibrary}
            style={({ pressed }) => [styles.galleryButton, { opacity: pressed ? 0.65 : 1 }]}
          >
            <Feather name="image" size={22} color={colors.foreground} />
            <Text style={[styles.galleryLabel, { color: colors.foreground }]}>ライブラリ</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="写真を撮影"
            testID="camera-capture-button"
            onPress={takePhoto}
            disabled={!isCameraReady || isBusy}
            style={({ pressed }) => [
              styles.captureButton,
              {
                borderColor: colors.foreground,
                opacity: !isCameraReady || isBusy ? 0.45 : pressed ? 0.72 : 1,
              },
            ]}
          >
            <View style={[styles.captureInner, { backgroundColor: colors.primary, borderColor: colors.foreground }]} />
          </Pressable>
          <View style={styles.bottomPlaceholder} />
        </View>
      </View>
    </View>
  );
}

type PermissionStateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  onBack?: () => void;
  colors: ReturnType<typeof useColors>;
};

function PermissionState({
  title,
  description,
  actionLabel,
  onAction,
  onBack,
  colors,
}: PermissionStateProps) {
  return (
    <View style={[styles.permissionScreen, { backgroundColor: colors.background }]}>
      <StatusBar style="dark" />
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="前の画面に戻る"
          testID="permission-back-button"
          onPress={onBack}
          style={({ pressed }) => [
            styles.permissionBack,
            { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
      ) : null}
      <View style={[styles.permissionIcon, { backgroundColor: colors.accent }]}>
        <Feather name="camera" size={32} color={colors.primary} />
      </View>
      <Text style={[styles.permissionTitle, { color: colors.foreground }]}>{title}</Text>
      {description ? (
        <Text style={[styles.permissionDescription, { color: colors.mutedForeground }]}>
          {description}
        </Text>
      ) : null}
      {onAction && actionLabel ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          testID="camera-permission-action"
          onPress={onAction}
          style={({ pressed }) => [
            styles.permissionButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 },
          ]}
        >
          <Text style={[styles.permissionButtonText, { color: colors.primaryForeground }]}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'space-between' },
  topBar: {
    paddingHorizontal: 18,
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: designTokens.colors.light.foreground,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 2, height: 2 },
    elevation: 2,
  },
  guideArea: { alignItems: 'center', gap: 18, marginTop: -36 },
  guideFrame: { width: '78%', maxWidth: 292, aspectRatio: 0.74, position: 'relative', borderRadius: 18, borderWidth: 1, opacity: 0.88 },
  corner: { width: 38, height: 38, position: 'absolute', borderWidth: 4, borderRadius: 7 },
  cornerTopLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 8 },
  cornerTopRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 8 },
  cornerBottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 8 },
  cornerBottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 8 },
  guidePill: { minHeight: 38, borderRadius: 13, borderWidth: 1.5, borderColor: designTokens.colors.light.foreground, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7, marginHorizontal: 20 },
  guideText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  bottomPanel: {
    minHeight: 154,
    paddingHorizontal: 32,
    paddingTop: 24,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  galleryButton: { width: 76, alignItems: 'center', gap: 7 },
  galleryLabel: { fontSize: 10, fontWeight: '600' },
  captureButton: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: designTokens.colors.light.foreground,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 3, height: 3 },
    elevation: 3,
  },
  captureInner: { width: 64, height: 64, borderRadius: 18, borderWidth: 2 },
  bottomPlaceholder: { width: 76 },
  permissionScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 15 },
  permissionBack: { position: 'absolute', top: 62, left: 20, width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  permissionIcon: { width: 76, height: 76, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 5, shadowColor: designTokens.colors.light.foreground, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 3, height: 3 }, elevation: 3 },
  permissionTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center', letterSpacing: -0.4 },
  permissionDescription: { fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 300 },
  permissionButton: { width: '100%', maxWidth: 320, minHeight: 54, borderWidth: 2, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 6, shadowColor: designTokens.colors.light.foreground, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 3, height: 3 }, elevation: 3 },
  permissionButtonText: { fontSize: 15, fontWeight: '700' },
});