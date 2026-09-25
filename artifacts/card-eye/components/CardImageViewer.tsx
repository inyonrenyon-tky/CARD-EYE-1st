import { useMemo, useRef, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import {
  Image, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

const MAX_ZOOM = 4;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function touchDistance(touches: readonly { pageX: number; pageY: number }[]) {
  if (touches.length < 2) return 0;
  return Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
}

export function CardImageViewer({ name, uri, onClose }: { name: string; uri: string; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const startZoom = useRef(1);
  const startOffset = useRef({ x: 0, y: 0 });
  const startDistance = useRef(0);
  const usedPinch = useRef(false);

  const updateZoom = (value: number) => {
    const next = clamp(value, 1, MAX_ZOOM);
    zoomRef.current = next;
    setZoom(next);
    if (next === 1) {
      offsetRef.current = { x: 0, y: 0 };
      setOffset({ x: 0, y: 0 });
    }
  };

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (event) => {
      startZoom.current = zoomRef.current;
      startOffset.current = offsetRef.current;
      startDistance.current = touchDistance(event.nativeEvent.touches);
      usedPinch.current = startDistance.current > 0;
    },
    onPanResponderMove: (event, gesture) => {
      const distance = touchDistance(event.nativeEvent.touches);
      if (distance > 0) {
        if (!startDistance.current) {
          startDistance.current = distance;
          startZoom.current = zoomRef.current;
        }
        usedPinch.current = true;
        updateZoom(startZoom.current * distance / startDistance.current);
      } else if (!usedPinch.current && startZoom.current <= 1) {
        // A single upward swipe enlarges the card; pinch remains available at every zoom level.
        updateZoom(1 + Math.max(0, -gesture.dy) / 150);
      } else if (!usedPinch.current) {
        const maxX = (width - 32) * (zoomRef.current - 1) / 2;
        const maxY = (height - insets.top - insets.bottom - 140) * (zoomRef.current - 1) / 2;
        const next = {
          x: clamp(startOffset.current.x + gesture.dx, -maxX, maxX),
          y: clamp(startOffset.current.y + gesture.dy, -maxY, maxY),
        };
        offsetRef.current = next;
        setOffset(next);
      }
    },
    onPanResponderRelease: (_event, gesture) => {
      if (!usedPinch.current && startZoom.current === 1 && gesture.dy > 130 && Math.abs(gesture.dx) < 80) {
        onClose();
      }
      startDistance.current = 0;
    },
  }), [height, insets.bottom, insets.top, onClose, width]);
  const webStageStyle = Platform.OS === 'web' ? { touchAction: 'none' as const, overflow: 'hidden' as const } : undefined;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View
        style={[
          styles.screen,
          { backgroundColor: colors.background, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 },
        ]}
      >
        <View style={styles.header}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.foreground }]}>{name}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="拡大画像を閉じる"
            testID="close-card-image"
            onPress={onClose}
            hitSlop={12}
            style={styles.close}
          >
            <Feather name="x" size={24} color={colors.foreground} />
          </Pressable>
        </View>
        <View
          {...responder.panHandlers}
          testID="card-image-zoom-stage"
          accessibilityLabel={`${name}の拡大画像`}
          style={[styles.stage, webStageStyle]}
        >
          <Image
            source={{ uri }}
            resizeMode="contain"
            style={[styles.image, { transform: [{ scale: zoom }, { translateX: offset.x }, { translateY: offset.y }] }]}
          />
        </View>
        <View style={styles.footer}>
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>
            上にスワイプ・ピンチで拡大、拡大中はドラッグで移動
          </Text>
          <View style={styles.controls}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="縮小"
              onPress={() => updateZoom(zoomRef.current - 0.5)}
              style={[styles.control, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Feather name="minus" size={19} color={colors.foreground} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="元の大きさに戻す"
              onPress={() => updateZoom(1)}
              style={[styles.reset, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Text style={{ color: colors.foreground, fontWeight: '700', fontSize: 13 }}>
                {Math.round(zoom * 100)}% · リセット
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="拡大"
              onPress={() => updateZoom(zoomRef.current + 0.5)}
              style={[styles.control, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Feather name="plus" size={19} color={colors.foreground} />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16 },
  header: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  title: { fontSize: 16, fontWeight: '700', flex: 1 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stage: { flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  footer: { gap: 15, paddingTop: 12 },
  hint: { textAlign: 'center', fontSize: 11 },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  control: { width: 48, height: 44, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  reset: { height: 44, paddingHorizontal: 15, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});