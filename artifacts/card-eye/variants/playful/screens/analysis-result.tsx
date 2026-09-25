import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useEffect, useRef } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { designTokens } from '@/variants/playful/design-tokens';
import { CardThumbnail, useCardRepresentativeImage } from '@/variants/playful/components/CardThumbnail';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useAnalyzeScan, type CardAnalysis } from '@workspace/api-client-react';
import { useScan } from '@/hooks/ScanContext';
import { PhotoReadError, readPhoto } from '@/lib/readPhoto';

type CardFields = {
  cardName: string;
  series: string;
  cardNumber: string;
  rarity: string;
};

const emptyCard: CardFields = { cardName: '', series: '', cardNumber: '', rarity: '' };

export default function AnalysisResultScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { analysis: savedAnalysis, uri, scanId, setScan, clearScan } = useScan();
  const analyze = useAnalyzeScan();
  const savedForUri = savedAnalysis && uri ? savedAnalysis : null;
  const [isEditing, setIsEditing] = useState(false);
  const [card, setCard] = useState<CardFields>(() => ({
    cardName: savedForUri?.cardName ?? '', series: savedForUri?.series ?? '',
    cardNumber: savedForUri?.cardNumber ?? '', rarity: savedForUri?.rarity ?? '',
  }));
  const [draft, setDraft] = useState<CardFields>(emptyCard);
  const [analysis, setAnalysis] = useState<CardAnalysis | null>(savedForUri);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestedUri = useRef<string | undefined>(undefined);
  const imageResolution = useCardRepresentativeImage({
    name: card.cardName,
    series: card.series,
    number: card.cardNumber,
    rarity: card.rarity,
    cardId: analysis?.catalogMatch?.matchedCardId,
  }, scanId);

  useEffect(() => {
    const resolvedCardId = imageResolution.data?.cardId;
    if (!resolvedCardId || !scanId || !analysis || isEditing) return;
    const analyzedIdentity: CardFields = {
      cardName: analysis.cardName ?? '',
      series: analysis.series ?? '',
      cardNumber: analysis.cardNumber ?? '',
      rarity: analysis.rarity ?? '',
    };
    if (
      analyzedIdentity.cardName.trim() !== card.cardName.trim()
      || analyzedIdentity.series.trim() !== card.series.trim()
      || analyzedIdentity.cardNumber.trim() !== card.cardNumber.trim()
      || analyzedIdentity.rarity.trim() !== card.rarity.trim()
      || analysis.catalogMatch?.matchedCardId === resolvedCardId
    ) return;

    const resolvedAnalysis: CardAnalysis = {
      ...analysis,
      catalogMatch: {
        status: 'exact',
        matchedCardId: resolvedCardId,
        method: 'verified_card_image_identity',
        candidates: [],
      },
    };
    setAnalysis(resolvedAnalysis);
    setScan(resolvedAnalysis);
  }, [analysis, card, imageResolution.data?.cardId, isEditing, scanId, setScan]);

  const runAnalysis = async () => {
    if (!uri) { setLoadError('解析する画像がありません。撮り直してください。'); return; }
    setLoadError(null);
    try {
      const result = await analyze.mutateAsync({ data: await readPhoto(uri) });
      setAnalysis(result);
      setScan(result);
      setCard({
        cardName: result.cardName ?? '', series: result.series ?? '',
        cardNumber: result.cardNumber ?? '', rarity: result.rarity ?? '',
      });
    } catch (error) {
      setLoadError(error instanceof PhotoReadError
        ? error.message
        : error instanceof Error && error.name === 'ApiError'
          ? 'サーバーでカードを解析できませんでした。もう一度お試しください。'
          : 'サーバーに接続できませんでした。通信状態を確認して、もう一度お試しください。');
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
      setScan({ ...analysis, cardName: draft.cardName.trim() || null, series: draft.series.trim() || null, cardNumber: draft.cardNumber.trim() || null, rarity: draft.rarity.trim() || null });
    }
    setIsEditing(false);
  };

  if (analyze.isPending) {
    return <View style={[styles.screen, styles.center, { backgroundColor: colors.background }]}>
      <StatusBar style="dark" />
      <View style={[styles.loadingMark, { backgroundColor: colors.secondary }]}>
        <Feather name="eye" size={24} color={colors.primary} />
      </View>
      <Text style={[styles.heading, { color: colors.foreground }]}>カードを解析しています</Text>
      <Text style={[styles.description, { color: colors.mutedForeground }]}>写真を安全に送信して識別しています。</Text>
    </View>;
  }
  if (loadError || !analysis) {
    return <View style={[styles.screen, styles.center, { backgroundColor: colors.background }]}>
      <StatusBar style="dark" />
      <View style={[styles.loadingMark, { backgroundColor: colors.warningSoft }]}>
        <Feather name="search" size={24} color={colors.warning} />
      </View>
      <Text style={[styles.heading, { color: colors.foreground }]}>解析できませんでした</Text>
      <Text style={[styles.description, { color: colors.mutedForeground }]}>{loadError ?? '解析結果がありません。'}</Text>
      <Pressable testID="analysis-retry-button" onPress={runAnalysis} style={[styles.primaryButton, { backgroundColor: colors.primary, width: '80%' }]}>
        <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>もう一度解析</Text>
      </Pressable>
      <Pressable onPress={() => { clearScan(); router.replace('/scan'); }}><Text style={[styles.retakeText, { color: colors.mutedForeground }]}>撮り直す</Text></Pressable>
    </View>;
  }

  if (isEditing) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <StatusBar style="dark" />
        <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="カード識別結果に戻る"
            testID="edit-card-back-button"
            onPress={() => setIsEditing(false)}
            style={({ pressed }) => [
              styles.iconButton,
             { backgroundColor: colors.cardElevated, opacity: pressed ? 0.7 : 1 },
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
              { backgroundColor: colors.primary, borderColor: colors.foreground, shadowColor: colors.foreground, opacity: pressed ? 0.78 : 1 },
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
      <StatusBar style="dark" />
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="撮影画像に戻る"
          testID="analysis-back-button"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.iconButton,
             { backgroundColor: colors.cardElevated, opacity: pressed ? 0.7 : 1 },
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
           <Text style={[styles.resultBadgeText, { color: analysis.catalogMatch?.matchedCardId ? colors.positive : colors.warning }]}>
             {analysis.catalogMatch?.matchedCardId ? 'カードマスター照合済み' : analysis.identified ? 'AIによる候補' : '識別できませんでした'}
           </Text>
        </View>
         <Text style={[styles.heading, { color: colors.foreground }]}>{analysis.catalogMatch?.matchedCardId ? 'カードを照合しました' : analysis.identified ? 'カードの候補を確認' : 'カードを特定できませんでした'}</Text>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
           {analysis.catalogMatch?.matchedCardId
             ? 'AIの候補をカードマスターと照合しました。内容を確認してください。'
             : analysis.identified
               ? 'AIによる候補です。カードマスターで確定できていません。内容を確認してください。'
               : 'カード情報が空欄のため、分かる範囲で入力して続けられます。'}
        </Text>

          <View style={[styles.resultRow, { backgroundColor: colors.card, borderColor: colors.foreground }]}>
          <View style={[styles.imageWrap, { backgroundColor: colors.accent, borderColor: colors.foreground }]}>
            <CardThumbnail
              card={{
                name: card.cardName,
                series: card.series,
                number: card.cardNumber,
                rarity: card.rarity,
                cardId: analysis.catalogMatch?.matchedCardId,
              }}
              scanImageUri={uri}
              scanId={scanId}
              tone="orange"
            />
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

          <View style={[styles.confidenceCard, { backgroundColor: colors.secondary, borderColor: colors.foreground }]}>
          <View style={styles.confidenceHeader}>
            <Text style={[styles.confidenceLabel, { color: colors.mutedForeground }]}>AI解析表示</Text>
            <Text style={[styles.confidenceValue, { color: colors.foreground }]}>
              {analysis.identified ? '識別結果あり' : '識別結果なし'}
            </Text>
          </View>
          <Text style={[styles.aiDisclaimer, { color: colors.mutedForeground }]}>
            数値の信頼度ではなく、写真からの推定結果です。内容を確認してください。
          </Text>
           <Text style={[styles.aiDisclaimer, { color: colors.mutedForeground }]}>
             カードマスター: {analysis.catalogMatch?.status === 'unavailable' ? '未接続'
               : analysis.catalogMatch?.status === 'ambiguous' ? '候補が複数・要確認'
               : analysis.catalogMatch?.status === 'unmatched' ? '一致なし'
               : analysis.catalogMatch?.matchedCardId ? '一致' : '未照合'}
           </Text>
        </View>

        <View style={styles.actionGroup}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="AI相場チェックへ進む"
            testID="analysis-market-button"
            onPress={() =>
              router.push({
                pathname: '/market-overview',
                params: {
                  scanId: scanId ?? '',
                  cardName: card.cardName,
                  series: card.series,
                  cardNumber: card.cardNumber,
                  rarity: card.rarity,
                  catalogCardId: analysis.catalogMatch?.matchedCardId ?? '',
                },
              })
            }
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 },
            ]}
          >
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>AI相場チェックへ</Text>
            <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="状態チェックへ進む"
            testID="analysis-next-button"
            onPress={() =>
              router.push({
                pathname: '/condition-check',
                params: {
                  scanId: scanId ?? '',
                  cardName: card.cardName,
                  series: card.series,
                  cardNumber: card.cardNumber,
                  rarity: card.rarity,
                },
              })
            }
            style={({ pressed }) => [
              styles.secondaryButton,
               { backgroundColor: colors.card, borderColor: colors.foreground, opacity: pressed ? 0.72 : 1 },
            ]}
          >
            <Feather name="check-circle" size={18} color={colors.foreground} />
            <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>状態チェックへ</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="カード情報を修正"
            testID="edit-card-button"
            onPress={startEditing}
            style={({ pressed }) => [
              styles.secondaryButton,
               { backgroundColor: colors.card, borderColor: colors.foreground, opacity: pressed ? 0.72 : 1 },
            ]}
          >
            <Feather name="edit-3" size={18} color={colors.foreground} />
            <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>
              カード情報を修正
            </Text>
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
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  loadingMark: { width: 64, height: 64, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  topBar: { minHeight: 72, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 44, height: 44, borderRadius: 15, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', shadowColor: designTokens.colors.light.foreground, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 2, height: 2 }, elevation: 2 },
  title: { fontSize: 16, fontWeight: '700' },
  topSpacer: { width: 42, height: 42 },
  resultContent: { paddingHorizontal: 20, alignItems: 'center', gap: 16 },
  formContent: { paddingHorizontal: 20, gap: 17 },
  resultBadge: { borderRadius: 11, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 6 },
  resultBadgeText: { fontSize: 12, fontWeight: '700' },
  heading: { fontSize: 24, lineHeight: 30, fontWeight: '800', textAlign: 'center', letterSpacing: -0.5 },
  description: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  resultRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 15, marginTop: 4, padding: 12, borderWidth: 2, borderRadius: 19, shadowColor: designTokens.colors.light.foreground, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 3, height: 3 }, elevation: 3 },
  imageWrap: { width: 112, height: 158, borderWidth: 2, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  cardInfo: { flex: 1, gap: 7 },
  cardName: { fontSize: 19, lineHeight: 24, fontWeight: '700' },
  setName: { fontSize: 12, lineHeight: 17 },
  number: { fontSize: 12 },
  rarityPill: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, marginTop: 2 },
  rarity: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  confidenceCard: { width: '100%', borderWidth: 2, borderRadius: 18, padding: 16, gap: 11, marginTop: 1 },
  confidenceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  confidenceLabel: { fontSize: 12 },
  confidenceValue: { fontSize: 18, fontWeight: '700' },
  aiDisclaimer: { fontSize: 11, lineHeight: 17 },
  actionGroup: { width: '100%', gap: 10, marginTop: 2 },
  secondaryButton: { minHeight: 56, borderRadius: 15, borderWidth: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  secondaryButtonText: { fontSize: 15, fontWeight: '700' },
  primaryButton: { minHeight: 56, borderRadius: 15, borderWidth: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, shadowOpacity: 1, shadowRadius: 0, shadowOffset: { width: 3, height: 3 }, elevation: 3 },
  primaryButtonText: { fontSize: 15, fontWeight: '700' },
  retakeButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  retakeText: { fontSize: 13, fontWeight: '600' },
  editNotice: { borderRadius: 15, borderWidth: 1.5, borderColor: designTokens.colors.light.foreground, padding: 15, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  editNoticeText: { flex: 1, fontSize: 12, lineHeight: 18 },
  field: { gap: 8 },
  fieldLabel: { fontSize: 13, fontWeight: '700' },
  input: { minHeight: 54, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 15, fontSize: 15 },
  cancelButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 13, fontWeight: '600' },
});