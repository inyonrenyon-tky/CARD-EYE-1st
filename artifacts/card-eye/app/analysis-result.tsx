import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useEffect, useRef } from 'react';
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardArtwork } from '@/components/CardArtwork';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useAnalyzeScan, type CardAnalysis } from '@workspace/api-client-react';
import { useScan } from '@/hooks/ScanContext';
import { Platform } from 'react-native';
import { File } from 'expo-file-system';

type CardFields = {
  cardName: string;
  series: string;
  cardNumber: string;
  rarity: string;
};

const emptyCard: CardFields = { cardName: '', series: '', cardNumber: '', rarity: '' };

async function readPhoto(uri: string) {
  const path = uri.toLowerCase().split('?')[0];
  if (/\.(heic|heif)$/.test(path)) {
    throw new Error('HEIC画像には対応していません。JPEGまたはPNGで撮り直してください。');
  }
  if (Platform.OS !== 'web') {
    const file = new File(uri);
    if (!file.exists) throw new Error('画像を読み込めませんでした');
    if (file.size > 5 * 1024 * 1024) throw new Error('画像が5MBを超えています。小さい画像で撮り直してください。');
    const base64 = await file.base64();
    const mimeType = path.endsWith('.png') ? 'image/png' as const : 'image/jpeg' as const;
    return { imageBase64: base64, mimeType };
  }
  const response = await fetch(uri);
  if (!response.ok) throw new Error('画像を読み込めませんでした');
  const blob = await response.blob();
  if (blob.size > 5 * 1024 * 1024) throw new Error('画像が5MBを超えています。小さい画像で撮り直してください。');
  const mimeType = blob.type === 'image/png' || uri.toLowerCase().split('?')[0].endsWith('.png')
    ? 'image/png' as const
    : 'image/jpeg' as const;
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      if (comma < 0) reject(new Error('画像データを変換できませんでした'));
      else resolve(result.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error('画像データを変換できませんでした'));
    reader.readAsDataURL(blob);
  });
  return { imageBase64: base64, mimeType };
}

export default function AnalysisResultScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { uri } = useLocalSearchParams<{ uri?: string }>();
  const { analysis: savedAnalysis, uri: savedUri, setScan } = useScan();
  const analyze = useAnalyzeScan();
  const savedForUri = savedAnalysis && uri && savedUri === uri ? savedAnalysis : null;
  const [isEditing, setIsEditing] = useState(false);
  const [card, setCard] = useState<CardFields>(() => ({
    cardName: savedForUri?.cardName ?? '', series: savedForUri?.series ?? '',
    cardNumber: savedForUri?.cardNumber ?? '', rarity: savedForUri?.rarity ?? '',
  }));
  const [draft, setDraft] = useState<CardFields>(emptyCard);
  const [analysis, setAnalysis] = useState<CardAnalysis | null>(savedForUri);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestedUri = useRef<string | undefined>(undefined);

  const runAnalysis = async () => {
    if (!uri) { setLoadError('解析する画像がありません。撮り直してください。'); return; }
    setLoadError(null);
    try {
      const result = await analyze.mutateAsync({ data: await readPhoto(uri) });
      setAnalysis(result);
      setScan({ uri, analysis: result });
      setCard({
        cardName: result.cardName ?? '', series: result.series ?? '',
        cardNumber: result.cardNumber ?? '', rarity: result.rarity ?? '',
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '解析に失敗しました。通信状態を確認して、もう一度お試しください。');
    }
  };

  useEffect(() => {
    if (requestedUri.current && requestedUri.current !== uri) {
      requestedUri.current = undefined;
      setAnalysis(savedForUri);
      setLoadError(null);
    }
    if (!uri || analysis || loadError || requestedUri.current === uri) return;
    requestedUri.current = uri;
    void runAnalysis();
  }, [uri, analysis, loadError, savedForUri]);

  const startEditing = () => {
    setDraft(card);
    setIsEditing(true);
  };

  const saveChanges = () => {
    setCard({
      cardName: draft.cardName.trim(), series: draft.series.trim(),
      cardNumber: draft.cardNumber.trim(), rarity: draft.rarity.trim(),
    });
    if (analysis && uri) {
      setScan({ uri, analysis: { ...analysis, cardName: draft.cardName.trim() || null, series: draft.series.trim() || null, cardNumber: draft.cardNumber.trim() || null, rarity: draft.rarity.trim() || null } });
    }
    setIsEditing(false);
  };

  if (analyze.isPending) {
    return <View style={[styles.screen, styles.center, { backgroundColor: colors.background }]}>
      <Feather name="loader" size={30} color={colors.primary} />
      <Text style={[styles.heading, { color: colors.foreground }]}>カードを解析しています</Text>
      <Text style={[styles.description, { color: colors.mutedForeground }]}>写真を安全に送信して識別しています。</Text>
    </View>;
  }
  if (loadError || !analysis) {
    return <View style={[styles.screen, styles.center, { backgroundColor: colors.background }]}>
      <Feather name="wifi-off" size={30} color={colors.warning} />
      <Text style={[styles.heading, { color: colors.foreground }]}>解析できませんでした</Text>
      <Text style={[styles.description, { color: colors.mutedForeground }]}>{loadError ?? '解析結果がありません。'}</Text>
      <Pressable testID="analysis-retry-button" onPress={runAnalysis} style={[styles.primaryButton, { backgroundColor: colors.primary, width: '80%' }]}>
        <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>もう一度解析</Text>
      </Pressable>
      <Pressable onPress={() => router.replace('/scan')}><Text style={[styles.retakeText, { color: colors.mutedForeground }]}>撮り直す</Text></Pressable>
    </View>;
  }

  if (isEditing) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="カード識別結果に戻る"
            testID="edit-card-back-button"
            onPress={() => setIsEditing(false)}
            style={({ pressed }) => [
              styles.iconButton,
              { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>カード情報を修正</Text>
          <View style={styles.topSpacer} />
        </View>

        <KeyboardAwareScrollViewCompat
          contentContainerStyle={[
            styles.formContent,
            { paddingBottom: insets.bottom + 34 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.editNotice, { backgroundColor: colors.secondary }]}>
            <Feather name="edit-3" size={17} color={colors.primary} />
            <Text style={[styles.editNoticeText, { color: colors.mutedForeground }]}>
              解析結果が異なる場合は、正しいカード情報に修正してください。
            </Text>
          </View>

          <CardField
            label="カード名"
            value={draft.cardName}
            placeholder="例：リザードンex"
            onChangeText={(value) => setDraft((current) => ({ ...current, cardName: value }))}
            colors={colors}
            testID="edit-card-name"
          />
          <CardField
            label="シリーズ"
            value={draft.series}
            placeholder="例：ポケモンカード151"
            onChangeText={(value) => setDraft((current) => ({ ...current, series: value }))}
            colors={colors}
            testID="edit-card-series"
          />
          <CardField
            label="カード番号"
            value={draft.cardNumber}
            placeholder="例：SV2a 201/165"
            onChangeText={(value) => setDraft((current) => ({ ...current, cardNumber: value }))}
            colors={colors}
            testID="edit-card-number"
          />
          <CardField
            label="レアリティ"
            value={draft.rarity}
            placeholder="例：SAR"
            onChangeText={(value) => setDraft((current) => ({ ...current, rarity: value }))}
            colors={colors}
            testID="edit-card-rarity"
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="変更を保存"
            testID="save-card-changes-button"
            onPress={saveChanges}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 },
            ]}
          >
            <Feather name="check" size={18} color={colors.primaryForeground} />
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
              変更を保存
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="変更を破棄"
            testID="cancel-card-changes-button"
            onPress={() => setIsEditing(false)}
            style={({ pressed }) => [styles.cancelButton, { opacity: pressed ? 0.65 : 1 }]}
          >
            <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>キャンセル</Text>
          </Pressable>
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="撮影画像に戻る"
          testID="analysis-back-button"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>カード識別結果</Text>
        <View style={styles.topSpacer} />
      </View>

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.resultContent,
          { paddingBottom: insets.bottom + 30 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.resultBadge, { backgroundColor: colors.positiveSoft }]}>
          <Feather name="check-circle" size={16} color={colors.positive} />
          <Text style={[styles.resultBadgeText, { color: analysis.identified ? colors.positive : colors.warning }]}>{analysis.identified ? '識別完了' : '識別できませんでした'}</Text>
        </View>
        <Text style={[styles.heading, { color: colors.foreground }]}>{analysis.identified ? 'カードを識別しました' : 'カードを特定できませんでした'}</Text>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          {analysis.identified ? 'AIによる推定結果です。内容を確認して次へ進んでください。' : 'カード情報が空欄のため、分かる範囲で入力して続けられます。'}
        </Text>

        <View style={styles.resultRow}>
          <View style={[styles.imageWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {uri ? (
              <Image source={{ uri }} resizeMode="contain" style={styles.image} />
            ) : (
              <CardArtwork card={{ name: card.cardName, number: card.cardNumber, tone: 'orange' }} />
            )}
          </View>
          <View style={styles.cardInfo}>
            <Text style={[styles.cardName, { color: colors.foreground }]}>{card.cardName}</Text>
            <Text style={[styles.setName, { color: colors.mutedForeground }]}>{card.series}</Text>
            <Text style={[styles.number, { color: colors.mutedForeground }]}>{card.cardNumber}</Text>
            <View style={[styles.rarityPill, { backgroundColor: colors.accent }]}>
              <Text style={[styles.rarity, { color: colors.primary }]}>{card.rarity}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.confidenceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.confidenceHeader}>
            <Text style={[styles.confidenceLabel, { color: colors.mutedForeground }]}>AI解析表示</Text>
            <Text style={[styles.confidenceValue, { color: colors.foreground }]}>
              {analysis.identified ? '識別結果あり' : '識別結果なし'}
            </Text>
          </View>
          <Text style={[styles.aiDisclaimer, { color: colors.mutedForeground }]}>
            数値の信頼度ではなく、写真からの推定結果です。内容を確認してください。
          </Text>
        </View>

        <View style={styles.actionGroup}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="カード情報を修正"
            testID="edit-card-button"
            onPress={startEditing}
            style={({ pressed }) => [
              styles.secondaryButton,
              { backgroundColor: colors.secondary, borderColor: colors.border, opacity: pressed ? 0.72 : 1 },
            ]}
          >
            <Feather name="edit-3" size={18} color={colors.foreground} />
            <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>
              カード情報を修正
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="状態チェックへ進む"
            testID="analysis-next-button"
            onPress={() =>
              router.push({
                pathname: '/condition-check',
                params: {
                  uri: uri ?? '',
                  cardName: card.cardName,
                  cardNumber: card.cardNumber,
                  rarity: card.rarity,
                },
              })
            }
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 },
            ]}
          >
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>状態チェックへ</Text>
            <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="撮影し直す"
            testID="analysis-retake-button"
            onPress={() => router.replace('/scan')}
            style={({ pressed }) => [styles.retakeButton, { opacity: pressed ? 0.65 : 1 }]}
          >
            <Feather name="camera" size={17} color={colors.mutedForeground} />
            <Text style={[styles.retakeText, { color: colors.mutedForeground }]}>撮影し直す</Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

type CardFieldProps = {
  label: string;
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  colors: ReturnType<typeof useColors>;
  testID: string;
};

function CardField({ label, value, placeholder, onChangeText, colors, testID }: CardFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        testID={testID}
        value={value}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        onChangeText={onChangeText}
        style={[
          styles.input,
          { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border },
        ]}
        selectionColor={colors.primary}
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 14 },
  topBar: { minHeight: 72, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700' },
  topSpacer: { width: 42, height: 42 },
  resultContent: { paddingHorizontal: 20, alignItems: 'center', gap: 16 },
  formContent: { paddingHorizontal: 20, gap: 17 },
  resultBadge: { borderRadius: 20, paddingHorizontal: 11, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 6 },
  resultBadgeText: { fontSize: 12, fontWeight: '700' },
  heading: { fontSize: 25, fontWeight: '700', textAlign: 'center', letterSpacing: -0.4 },
  description: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
  resultRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 15, marginTop: 4 },
  imageWrap: { width: 118, height: 164, borderWidth: 1, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  cardInfo: { flex: 1, gap: 6 },
  cardName: { fontSize: 19, fontWeight: '700' },
  setName: { fontSize: 12, lineHeight: 17 },
  number: { fontSize: 12 },
  rarityPill: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, marginTop: 2 },
  rarity: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  confidenceCard: { width: '100%', borderWidth: 1, borderRadius: 18, padding: 15, gap: 11, marginTop: 1 },
  confidenceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  confidenceLabel: { fontSize: 12 },
  confidenceValue: { fontSize: 18, fontWeight: '700' },
  aiDisclaimer: { fontSize: 11, lineHeight: 17 },
  actionGroup: { width: '100%', gap: 10, marginTop: 2 },
  secondaryButton: { minHeight: 54, borderRadius: 17, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  secondaryButtonText: { fontSize: 15, fontWeight: '700' },
  primaryButton: { minHeight: 54, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  primaryButtonText: { fontSize: 15, fontWeight: '700' },
  retakeButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  retakeText: { fontSize: 13, fontWeight: '600' },
  editNotice: { borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  editNoticeText: { flex: 1, fontSize: 12, lineHeight: 18 },
  field: { gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '700' },
  input: { minHeight: 52, borderWidth: 1, borderRadius: 15, paddingHorizontal: 15, fontSize: 15 },
  cancelButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 13, fontWeight: '600' },
});