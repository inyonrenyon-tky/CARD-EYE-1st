import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type FlashMode } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useScan } from '@/hooks/ScanContext';

type ScanPhoto = {
  uri: string;
  width?: number;
  height?: number;
};

function ScanIconButton({
  accessibilityLabel,
  color,
  icon,
  onPress,
  testID,
}: {
  accessibilityLabel: string;
  color: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.65 : 1 }]}
    >
      <Feather name={icon} size={22} color={color} />
    </Pressable>
  );
}

export default function ScanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { clearScan } = useScan();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [flash, setFlash] = useState<FlashMode>('off');
  const [photo, setPhoto] = useState<ScanPhoto | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const chooseFromLibrary = async () => {
    setErrorMessage(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.9,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        clearScan();
        setPhoto({ uri: asset.uri, width: asset.width, height: asset.height });
      }
    } catch {
      setErrorMessage('写真を選択できませんでした。もう一度お試しください。');
    }
  };

  const takePhoto = async () => {
    if (!cameraRef.current || isCapturing) return;

    setIsCapturing(true);
    setErrorMessage(null);
    try {
      const capturedPhoto = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (capturedPhoto?.uri) {
        clearScan();
        setPhoto({
          uri: capturedPhoto.uri,
          width: capturedPhoto.width,
          height: capturedPhoto.height,
        });
      }
    } catch {
      setErrorMessage('撮影できませんでした。カードを枠内に合わせて、もう一度お試しください。');
    } finally {
      setIsCapturing(false);
    }
  };

  const openSettings = () => {
    if (Platform.OS !== 'web') {
      void Linking.openSettings();
    }
  };

  if (photo) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <StatusBar style="light" />
        <Image source={{ uri: photo.uri }} style={styles.previewImage} resizeMode="contain" />
        <View
          style={[
            styles.previewTopBar,
            { paddingTop: insets.top + 12, backgroundColor: colors.background },
          ]}
        >
          <ScanIconButton
            accessibilityLabel="撮影を閉じる"
            color={colors.foreground}
            icon="x"
            onPress={() => router.back()}
            testID="close-scan-preview-button"
          />
          <Text style={[styles.topBarTitle, { color: colors.foreground }]}>撮影プレビュー</Text>
          <View style={styles.topBarSpacer} />
        </View>
        <View
          style={[
            styles.previewBottomBar,
            {
              paddingBottom: Math.max(insets.bottom, 16),
              backgroundColor: colors.background,
            },
          ]}
        >
          <Text style={[styles.previewHint, { color: colors.mutedForeground }]}>
            この写真でカードを解析します
          </Text>
          <View style={styles.previewActions}>
            <Pressable
              accessibilityLabel="撮り直す"
              accessibilityRole="button"
              testID="retake-card-button"
              onPress={() => {
                setPhoto(null);
                setErrorMessage(null);
              }}
              style={({ pressed }) => [
                styles.secondaryAction,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="rotate-ccw" size={18} color={colors.foreground} />
              <Text style={[styles.secondaryActionText, { color: colors.foreground }]}>
                撮り直す
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="カードを解析する"
              accessibilityRole="button"
              testID="analyze-card-button"
              onPress={() =>
                router.push({ pathname: '/analysis-result', params: { uri: photo.uri } })
              }
              style={({ pressed }) => [
                styles.primaryAction,
                { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 },
              ]}
            >
              <Text style={[styles.primaryActionText, { color: colors.primaryForeground }]}>
                解析を開始
              </Text>
              <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (!permission) {
    return (
      <View style={[styles.centeredScreen, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    const permanentlyDenied = permission.status === 'denied' && !permission.canAskAgain;

    return (
      <View
        style={[
          styles.centeredScreen,
          { backgroundColor: colors.background, paddingTop: insets.top },
        ]}
      >
        <StatusBar style="light" />
        <View style={[styles.permissionIcon, { backgroundColor: colors.secondary }]}>
          <Feather name="camera-off" size={28} color={colors.primary} />
        </View>
        <Text style={[styles.permissionTitle, { color: colors.foreground }]}>
          カメラの使用を許可してください
        </Text>
        <Text style={[styles.permissionBody, { color: colors.mutedForeground }]}>
          カードを撮影して価値を調べるには、カメラへのアクセスが必要です。
        </Text>
        {errorMessage ? (
          <Text style={[styles.captureError, { color: colors.destructive }]}>{errorMessage}</Text>
        ) : null}
        {permanentlyDenied ? (
          <Pressable
            accessibilityLabel="設定を開く"
            accessibilityRole="button"
            testID="open-camera-settings-button"
            onPress={openSettings}
            style={({ pressed }) => [
              styles.primaryAction,
              { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 },
            ]}
          >
            <Feather name="settings" size={18} color={colors.primaryForeground} />
            <Text style={[styles.primaryActionText, { color: colors.primaryForeground }]}>
              設定を開く
            </Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityLabel="カメラの使用を許可する"
            accessibilityRole="button"
            testID="request-camera-permission-button"
            onPress={() => void requestPermission()}
            style={({ pressed }) => [
              styles.primaryAction,
              { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 },
            ]}
          >
            <Feather name="camera" size={18} color={colors.primaryForeground} />
            <Text style={[styles.primaryActionText, { color: colors.primaryForeground }]}>
              カメラを許可する
            </Text>
          </Pressable>
        )}
        <Pressable
          accessibilityLabel="写真ライブラリから選ぶ"
          accessibilityRole="button"
          testID="choose-library-from-permission-button"
          onPress={() => void chooseFromLibrary()}
          style={({ pressed }) => [styles.libraryAction, { opacity: pressed ? 0.65 : 1 }]}
        >
          <Feather name="image" size={17} color={colors.primary} />
          <Text style={[styles.libraryActionText, { color: colors.primary }]}>
            写真ライブラリから選ぶ
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel="撮影画面を閉じる"
          accessibilityRole="button"
          testID="close-permission-screen-button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backTextButton, { opacity: pressed ? 0.65 : 1 }]}
        >
          <Text style={[styles.backText, { color: colors.mutedForeground }]}>あとで</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.cameraScreen}>
      <StatusBar style="light" />
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        flash={flash}
      />
      <View pointerEvents="none" style={styles.cameraShade} />
      <View style={[styles.cameraContent, { paddingTop: insets.top + 12 }]}>
        <View style={styles.cameraTopBar}>
          <ScanIconButton
            accessibilityLabel="撮影を閉じる"
            color={colors.primaryForeground}
            icon="x"
            onPress={() => router.back()}
            testID="close-camera-button"
          />
          <View style={styles.cameraTitleWrap}>
            <Text style={[styles.cameraTitle, { color: colors.primaryForeground }]}>
              カードを撮影
            </Text>
            <Text style={[styles.cameraSubtitle, { color: colors.primaryForeground }]}>
              カード全体を枠内に合わせてください
            </Text>
          </View>
          <ScanIconButton
            accessibilityLabel={flash === 'on' ? 'フラッシュをオフにする' : 'フラッシュをオンにする'}
            color={flash === 'on' ? colors.primary : colors.primaryForeground}
            icon="zap"
            onPress={() => setFlash((current) => (current === 'on' ? 'off' : 'on'))}
            testID="toggle-flash-button"
          />
        </View>

        <View style={styles.frameArea}>
          <View style={styles.cardFrame}>
            <View style={[styles.corner, styles.cornerTopLeft, { borderColor: colors.primary }]} />
            <View style={[styles.corner, styles.cornerTopRight, { borderColor: colors.primary }]} />
            <View
              style={[styles.corner, styles.cornerBottomLeft, { borderColor: colors.primary }]}
            />
            <View
              style={[styles.corner, styles.cornerBottomRight, { borderColor: colors.primary }]}
            />
          </View>
          <Text style={[styles.frameHint, { color: colors.primaryForeground }]}>
            明るい場所で、カードを平らに置いてください
          </Text>
        </View>

        <View style={[styles.cameraBottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {errorMessage ? (
            <Text style={[styles.captureError, { color: colors.primaryForeground }]}>
              {errorMessage}
            </Text>
          ) : null}
          <View style={styles.captureControls}>
            <ScanIconButton
              accessibilityLabel="写真ライブラリから選ぶ"
              color={colors.primaryForeground}
              icon="image"
              onPress={() => void chooseFromLibrary()}
              testID="choose-library-button"
            />
            <Pressable
              accessibilityLabel="カードを撮影する"
              accessibilityRole="button"
              disabled={isCapturing}
              testID="take-card-photo-button"
              onPress={() => void takePhoto()}
              style={({ pressed }) => [
                styles.shutterOuter,
                { borderColor: colors.primaryForeground, opacity: pressed || isCapturing ? 0.7 : 1 },
              ]}
            >
              {isCapturing ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <View style={[styles.shutterInner, { backgroundColor: colors.primaryForeground }]} />
              )}
            </Pressable>
            <View style={styles.controlSpacer} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centeredScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 16,
  },
  permissionIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  permissionTitle: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  permissionBody: { maxWidth: 320, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  primaryAction: {
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  primaryActionText: { fontSize: 14, fontWeight: '700' },
  libraryAction: {
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  libraryActionText: { fontSize: 13, fontWeight: '700' },
  backTextButton: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 12 },
  backText: { fontSize: 13 },
  previewImage: { ...StyleSheet.absoluteFill, width: undefined, height: undefined },
  previewTopBar: {
    minHeight: 68,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarTitle: { fontSize: 16, fontWeight: '700' },
  topBarSpacer: { width: 42, height: 42 },
  previewBottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, gap: 14 },
  previewHint: { fontSize: 12, textAlign: 'center' },
  previewActions: { flexDirection: 'row', gap: 10 },
  secondaryAction: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryActionText: { fontSize: 13, fontWeight: '700' },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraScreen: { flex: 1 },
  cameraShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.24)',
  },
  cameraContent: { flex: 1, paddingHorizontal: 20, justifyContent: 'space-between' },
  cameraTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cameraTitleWrap: { alignItems: 'center', gap: 4 },
  cameraTitle: { fontSize: 16, fontWeight: '700' },
  cameraSubtitle: { fontSize: 11, opacity: 0.82 },
  frameArea: { alignItems: 'center', gap: 18 },
  cardFrame: { width: '82%', aspectRatio: 0.68, maxHeight: 430, position: 'relative' },
  corner: { position: 'absolute', width: 28, height: 28, borderWidth: 3 },
  cornerTopLeft: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTopRight: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBottomLeft: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBottomRight: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  frameHint: { fontSize: 12, textAlign: 'center' },
  cameraBottomBar: { gap: 16 },
  captureError: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  captureControls: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  shutterOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29 },
  controlSpacer: { width: 42, height: 42 },
});