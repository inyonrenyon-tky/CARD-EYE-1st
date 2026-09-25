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
import { useScan } from '@/hooks/ScanContext';
import { holdPhoto, PhotoReadError } from '@/lib/readPhoto';

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
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        flash={flash}
        mode="picture"
        onCameraReady={() => setIsCameraReady(true)}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={[styles.topBar, { paddingTop: insets.top + 10, backgroundColor: colors.background }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="カメラを閉じる"
            testID="camera-back-button"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.iconButton,
              { backgroundColor: colors.background, opacity: pressed ? 0.7 : 0.9 },
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
                backgroundColor: flash === 'on' ? colors.primary : colors.background,
                opacity: pressed ? 0.7 : 0.9,
              },
            ]}
          >
            <Feather
              name={flash === 'on' ? 'zap' : 'zap-off'}
              size={19}
              color={colors.primaryForeground}
            />
          </Pressable>
        </View>

        <View style={styles.guideArea}>
          <View style={styles.guideFrame}>
            <View style={[styles.corner, styles.cornerTopLeft, { borderColor: colors.primaryForeground }]} />
            <View style={[styles.corner, styles.cornerTopRight, { borderColor: colors.primaryForeground }]} />
            <View style={[styles.corner, styles.cornerBottomLeft, { borderColor: colors.primaryForeground }]} />
            <View style={[styles.corner, styles.cornerBottomRight, { borderColor: colors.primaryForeground }]} />
          </View>
          <Text style={[styles.guideText, { color: colors.primaryForeground }]}>
            カード全体が枠内に入るように撮影してください
          </Text>
        </View>

        <View style={[styles.bottomPanel, { paddingBottom: insets.bottom + 20, backgroundColor: colors.background }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="写真ライブラリから選択"
            testID="camera-library-button"
            onPress={chooseFromLibrary}
            style={({ pressed }) => [styles.galleryButton, { opacity: pressed ? 0.65 : 1 }]}
          >
            <Feather name="image" size={22} color={colors.primaryForeground} />
            <Text style={[styles.galleryLabel, { color: colors.primaryForeground }]}>ライブラリ</Text>
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
                borderColor: colors.primaryForeground,
                opacity: !isCameraReady || isBusy ? 0.45 : pressed ? 0.72 : 1,
              },
            ]}
          >
            <View style={[styles.captureInner, { backgroundColor: colors.primary }]} />
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
    paddingHorizontal: 20,
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topTitle: { fontSize: 16, fontWeight: '700' },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideArea: { alignItems: 'center', gap: 18, marginTop: -48 },
  guideFrame: { width: 286, height: 382, position: 'relative' },
  corner: { width: 34, height: 34, position: 'absolute', borderWidth: 3 },
  cornerTopLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 8 },
  cornerTopRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 8 },
  cornerBottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 8 },
  cornerBottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 8 },
  guideText: { fontSize: 13, fontWeight: '600', textAlign: 'center', paddingHorizontal: 24 },
  bottomPanel: {
    minHeight: 144,
    paddingHorizontal: 32,
    paddingTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  galleryButton: { width: 76, alignItems: 'center', gap: 7 },
  galleryLabel: { fontSize: 10, fontWeight: '600' },
  captureButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInner: { width: 60, height: 60, borderRadius: 30 },
  bottomPlaceholder: { width: 76 },
  permissionScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 15 },
  permissionBack: { position: 'absolute', top: 62, left: 20, width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  permissionIcon: { width: 76, height: 76, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  permissionTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  permissionDescription: { fontSize: 14, lineHeight: 21, textAlign: 'center', maxWidth: 300 },
  permissionButton: { width: '100%', maxWidth: 320, minHeight: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  permissionButtonText: { fontSize: 15, fontWeight: '700' },
});