import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardThumbnail } from '@/components/CardThumbnail';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useScan } from '@/hooks/ScanContext';
import { useSavedCards } from '@/hooks/SavedCardsContext';
import { PhotoReadError, readPhoto } from '@/lib/readPhoto';
import { useAnalyzeCondition, type ConditionAnalysis } from '@workspace/api-client-react';
import { designTokens } from '@/constants/design-tokens';

type IconName =
  | 'maximize'
  | 'corner-up-left'
  | 'square'
  | 'sun'
  | 'droplet'
  | 'edit-2';

type ItemKey = 'surface' | 'corners' | 'edges' | 'whitening' | 'centering' | 'scratches'
  | 'dents' | 'creases' | 'peeling' | 'water_damage';
type Evaluation = {
  key: ItemKey;
  label: string;
  value: string;
  icon: IconName;
  status: ConditionAnalysis['surface']['status'];
  detail: string;
  confidence: number;
  count?: ConditionAnalysis['surface']['count'];
};

const evaluationMeta: Array<{ key: ItemKey; label: string; icon: IconName }> = [
  { key: 'surface', label: '表面', icon: 'sun' },
  { key: 'corners', label: '角', icon: 'corner-up-left' },
  { key: 'edges', label: 'エッジ', icon: 'square' },
  { key: 'whitening', label: '白かけ', icon: 'droplet' },
  { key: 'centering', label: 'センタリング', icon: 'maximize' },
  { key: 'scratches', label: '傷', icon: 'edit-2' },
  { key: 'dents', label: 'へこみ', icon: 'maximize' },
  { key: 'creases', label: '折れ・しわ', icon: 'corner-up-left' },
  { key: 'peeling', label: 'はがれ', icon: 'edit-2' },
  { key: 'water_damage', label: '水濡れ', icon: 'droplet' },
];
const statusLabels: Record<Evaluation['status'], string> = {
  good: '目立つ問題は確認できません',
  minor: '軽微な状態変化',
  moderate: '状態変化あり',
  significant: '目立つ損傷あり',
  uncertain: '判定が不確か',
  not_assessable: '画像から判定できません',
};
const qualityLabels: Record<ConditionAnalysis['imageQuality'], string> = {
  acceptable: '画像から確認できる範囲で判定',
  limited: '一部の判定が困難',
  unusable: 'この画像では判定困難',
};
const countLabels: Record<ConditionAnalysis['surface']['count'], string> = {
  none: '所見数：なし',
  one: '所見数：1件',
  few: '所見数：少数',
  many: '所見数：複数',
  unknown: '所見数：不明',
};

function buildEvaluations(condition: ConditionAnalysis): Evaluation[] {
  const report = condition as unknown as Record<string, ConditionAnalysis['surface'] | undefined>;
  return evaluationMeta.flatMap((item): Evaluation[] => {
    const finding = report[item.key];
    if (!finding || !statusLabels[finding.status] ||
        typeof finding.note !== 'string' || !Number.isFinite(finding.confidence)) return [];
    return [{
      ...item,
      value: statusLabels[finding.status],
      status: finding.status,
      detail: finding.note,
      confidence: finding.confidence,
      count: finding.count,
    }];
  });
}

function rankLabel(rank: ConditionAnalysis['overall_rank']): string {
  return rank === 'unassessable' ? '評価できません' : rank;
}
function ClassicScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { analysis: savedAnalysis, uri: scanUri, scanId: activeScanId } = useScan();
  const { saveCard, isLoaded, loadError: storageError } = useSavedCards();
  const { scanId: routeScanId, cardName, series, cardNumber, rarity } = useLocalSearchParams<{
    scanId?: string;
    cardName?: string;
    series?: string;
    cardNumber?: string;
    rarity?: string;
  }>();
  const analyzeCondition = useAnalyzeCondition();
  const [condition, setCondition] = useState<ConditionAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [conditionError, setConditionError] = useState<string | null>(null);
  const requestedUri = useRef<string | null>(null);
  const requestId = useRef(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const isCurrentScan = !!routeScanId && routeScanId === activeScanId;
  const analysis = isCurrentScan ? savedAnalysis : null;
  const displayUri = isCurrentScan ? scanUri : undefined;
  const evaluations = condition ? buildEvaluations(condition) : [];
  const hasRank = !!condition
    && ['S', 'A', 'A-', 'B', 'C', 'D', 'unassessable'].includes(condition.overall_rank)
    && typeof condition.rank_reason === 'string'
    && Number.isFinite(condition.rank_confidence);
  const name = (cardName || analysis?.cardName || '').trim();
  const number = (cardNumber || analysis?.cardNumber || '').trim();
  const canSave = isLoaded && !storageError && !!name && !!number && !isSaving
    && !isAnalyzing && (!!condition || !!conditionError || !displayUri);

  const runCondition = async (photoUri: string) => {
    const currentId = ++requestId.current;
    setCondition(null);
    setConditionError(null);
    setIsAnalyzing(true);
    try {
      const photo = await readPhoto(photoUri);
      const result = await analyzeCondition.mutateAsync({ data: { images: [{ ...photo, view: 'front' }] } });
      if (currentId === requestId.current) setCondition(result);
    } catch (error) {
      if (currentId === requestId.current) {
        setConditionError(error instanceof PhotoReadError
          ? error.message
          : 'サーバーで状態を解析できませんでした。通信状態を確認し、再試行してください。');
      }
    } finally {
      if (currentId === requestId.current) setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (!displayUri || requestedUri.current === displayUri) return;
    requestedUri.current = displayUri;
    setCondition(null);
    void runCondition(displayUri);
  }, [displayUri]);

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await saveCard({
        name,
        number,
        series: analysis?.series || '',
        rarity: rarity || analysis?.rarity || '',
        catalogCardId: analysis?.catalogMatch?.matchedCardId
          && name === analysis.cardName?.trim()
          && number === analysis.cardNumber?.trim()
          && (rarity || analysis.rarity || '') === (analysis.rarity || '')
          ? analysis.catalogMatch.matchedCardId : null,
        conditionSummary: null,
        observations: null,
        conditionAnalysis: condition,
      });
      router.replace('/collection');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'カードを保存できませんでした。');
    } finally {
      setIsSaving(false);
    }
  };

  const statusColor = (status: Evaluation['status']) =>
    status === 'good' ? colors.positive
      : status === 'minor' || status === 'moderate' ? colors.warning
      : status === 'significant' ? colors.destructive : colors.mutedForeground;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="カード識別結果に戻る"
          testID="condition-back-button"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.foreground }]}>状態チェック</Text>
        <View style={styles.topSpacer} />
      </View>

      <KeyboardAwareScrollViewCompat
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.imageWrap, { backgroundColor: colors.cardElevated }]}>
          {displayUri ? (
            <Image source={{ uri: displayUri }} resizeMode="contain" style={styles.image} />
          ) : (
            <CardThumbnail
              card={{
                name: cardName ?? analysis?.cardName ?? 'カード情報未確認',
                number: cardNumber ?? analysis?.cardNumber ?? '',
                series: series ?? analysis?.series ?? '',
                rarity: rarity ?? analysis?.rarity ?? '',
                cardId: analysis?.catalogMatch?.matchedCardId ?? null,
              }}
              compact
            />
          )}
        </View>

        <View style={styles.headingBlock}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>CONDITION CHECK</Text>
          <Text style={[styles.heading, { color: colors.foreground }]}>カード状態チェック</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            撮影した1枚の写真から、見える部分だけを確認します。裏面や写っていない部分は判定できません。
          </Text>
        </View>

        {isAnalyzing ? (
          <View style={[styles.overallCard, styles.loadingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.overallValue, { color: colors.foreground }]}>画像の状態とカードを確認中...</Text>
          </View>
        ) : null}
        {!displayUri || conditionError ? (
          <View style={[styles.overallCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.description, { color: colors.mutedForeground }]}>
              {conditionError || '解析する写真がありません。もう一度撮影してください。'}
            </Text>
            {displayUri ? (
              <Pressable
                accessibilityRole="button"
                testID="condition-retry-button"
                onPress={() => void runCondition(displayUri)}
                style={[styles.inlineButton, { backgroundColor: colors.secondary }]}
              >
                <Feather name="rotate-cw" size={16} color={colors.foreground} />
                <Text style={{ color: colors.foreground }}>もう一度解析する</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {condition && !hasRank ? (
          <View style={[styles.overallCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.description, { color: colors.mutedForeground }]}>
              この解析結果には状態ランクが含まれていません。もう一度解析してください。
            </Text>
            {displayUri ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void runCondition(displayUri)}
                style={[styles.inlineButton, { backgroundColor: colors.secondary }]}
              >
                <Text style={{ color: colors.foreground }}>もう一度解析する</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {condition && hasRank ? (
          <View
            testID="condition-overall-rank"
            accessibilityLabel={`CARD EYE状態ランク ${rankLabel(condition.overall_rank)}`}
            style={[
              styles.rankCard,
              {
                backgroundColor: condition.overall_rank === 'unassessable' ? colors.warningSoft : colors.card,
                borderColor: condition.overall_rank === 'unassessable' ? colors.warning : colors.primary,
              },
            ]}
          >
            <View style={styles.rankHeader}>
              <View style={styles.rankCopy}>
                <Text style={[styles.rankTitle, { color: colors.foreground }]}>CARD EYE状態ランク</Text>
                <Text style={[styles.rankValue, { color: condition.overall_rank === 'unassessable' ? colors.warning : colors.primary }]}>
                  {rankLabel(condition.overall_rank)}
                </Text>
              </View>
              <View style={[styles.aiPill, { backgroundColor: colors.accent }]}>
                <Text style={[styles.aiPillText, { color: colors.primary }]}>独自評価</Text>
              </View>
            </View>
            <Text style={[styles.rankReason, { color: colors.foreground }]}>{condition.rank_reason}</Text>
            <Text style={[styles.qualityDetail, { color: colors.mutedForeground }]}>
              ランク判定の確信度 {Math.round(condition.rank_confidence * 100)}%
            </Text>
            {condition.overall_rank === 'unassessable' ? (
              <>
                <Text style={[styles.rankGuidance, { color: colors.warning }]}>
                  ランクを確認するには、明るい場所でカード全体にピントを合わせて撮り直してください。
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="ランク判定のために写真を撮り直す"
                  testID="condition-rank-retake-button"
                  onPress={() => router.replace('/scan')}
                  style={[styles.inlineButton, { backgroundColor: colors.warningSoft }]}
                >
                  <Feather name="camera" size={16} color={colors.warning} />
                  <Text style={{ color: colors.foreground }}>撮影し直す</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        ) : null}

        {condition ? (
          <View style={[styles.overallCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.overallHeader}>
              <View style={[styles.overallIcon, { backgroundColor: condition.retakeRecommended ? colors.warningSoft : colors.positiveSoft }]}>
                <Feather name={condition.retakeRecommended ? 'alert-triangle' : 'eye'} size={22} color={condition.retakeRecommended ? colors.warning : colors.positive} />
              </View>
              <View style={styles.overallCopy}>
                <Text style={[styles.overallLabel, { color: colors.mutedForeground }]}>画像品質</Text>
                <Text style={[styles.overallValue, { color: colors.foreground }]}>
                  {qualityLabels[condition.imageQuality]}
                </Text>
              </View>
              <View style={[styles.aiPill, { backgroundColor: colors.accent }]}>
                <Text style={[styles.aiPillText, { color: colors.primary }]}>AI推定</Text>
              </View>
            </View>
            <Text style={[styles.qualityDetail, { color: colors.mutedForeground }]}>
              判定への確信度 {Math.round(condition.overallConfidence * 100)}%（画質の点数ではありません）
            </Text>
            {condition.imageQuality === 'unusable' ? (
              <Text style={[styles.qualityDetail, { color: colors.warning }]}>
                状態を正確に確認できません。もう一度撮影してください。
              </Text>
            ) : null}
            {condition.limitations.map((reason, index) => (
              <Text key={`${index}-${reason}`} style={[styles.qualityDetail, { color: colors.mutedForeground }]}>・{reason}</Text>
            ))}
            {condition.retakeRecommended ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="写真を撮り直す"
                testID="condition-retake-button"
                onPress={() => router.replace('/scan')}
                style={[styles.inlineButton, { backgroundColor: colors.warningSoft }]}
              >
                <Feather name="camera" size={16} color={colors.warning} />
                <Text style={{ color: colors.foreground }}>明るい場所でカード全体を撮り直す</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {condition ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>画像からの観察結果</Text>
              <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>{evaluations.length}項目</Text>
            </View>

            <View style={styles.evaluationList}>
              {evaluations.map((item) => (
                <View
                  key={item.key}
                  testID={`condition-item-${item.key}`}
                  style={[styles.evaluationCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={styles.evaluationRow}>
                    <View style={[styles.evaluationIcon, { backgroundColor: colors.secondary }]}>
                      <Feather name={item.icon} size={18} color={statusColor(item.status)} />
                    </View>
                    <View style={styles.evaluationCopy}>
                      <Text style={[styles.evaluationLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
                      <Text style={[styles.evaluationValue, { color: statusColor(item.status) }]}>{item.value}</Text>
                    </View>
                  </View>
                  <View style={[styles.detailBox, { borderTopColor: colors.border }]}>
                    <Text style={[styles.detailDescription, { color: colors.foreground }]}>
                      {item.detail}
                    </Text>
                    <Text style={[styles.confidenceText, { color: colors.mutedForeground }]}>
                      {item.count ? countLabels[item.count] : '所見数：未記録'}
                    </Text>
                    <Text style={[styles.confidenceText, { color: colors.mutedForeground }]}>
                      判定への確信度 {Math.round(item.confidence * 100)}%
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        ) : null}

        <View style={[styles.warning, { backgroundColor: colors.secondary }]}>
          <Feather name="alert-circle" size={18} color={colors.primary} />
          <Text style={[styles.warningText, { color: colors.mutedForeground }]}>
            CARD EYE状態ランクは撮影画像から確認できる範囲を独自基準で評価したもので、PSA等の専門鑑定機関による鑑定結果を示すものではありません。
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="カードをコレクションに保存"
          testID="condition-save-button"
          disabled={!canSave}
          onPress={handleSave}
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: colors.secondary, borderColor: colors.border, opacity: !canSave ? 0.5 : pressed ? 0.78 : 1 },
          ]}
        >
          <Feather name="bookmark" size={18} color={colors.foreground} />
          <Text style={[styles.saveButtonText, { color: colors.foreground }]}>
            {isSaving ? '保存中...' : isAnalyzing ? '状態の解析中...' : condition ? 'コレクションに保存' : 'カード情報のみ保存'}
          </Text>
        </Pressable>
        {!name || !number ? (
          <Text style={[styles.saveHint, { color: colors.mutedForeground }]}>
            保存にはカード名とカード番号が必要です。前の画面で情報を修正してください。
          </Text>
        ) : null}
        {!condition ? (
          <Text style={[styles.saveHint, { color: colors.mutedForeground }]}>
            状態判定がない場合、カード情報のみ保存されます。解析中は完了するまでお待ちください。
          </Text>
        ) : null}
        {storageError || saveError ? (
          <Text style={[styles.saveHint, { color: colors.destructive }]}>{storageError || saveError}</Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="価格の推移を見る"
          testID="condition-price-button"
          onPress={() =>
            router.push({
              pathname: '/market-overview',
              params: {
                scanId: isCurrentScan ? activeScanId ?? '' : '',
                cardName: cardName ?? analysis?.cardName ?? '',
                series: series ?? analysis?.series ?? '',
                cardNumber: cardNumber ?? analysis?.cardNumber ?? '',
                rarity: rarity ?? analysis?.rarity ?? '',
                catalogCardId: analysis?.catalogMatch?.matchedCardId ?? '',
              },
            })
          }
          style={({ pressed }) => [
            styles.priceButton,
            { backgroundColor: colors.primary, opacity: pressed ? 0.78 : 1 },
          ]}
        >
          <Text style={[styles.priceButtonText, { color: colors.primaryForeground }]}>
            価格の推移を見る
          </Text>
          <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
        </Pressable>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

import PlayfulScreen from '@/variants/playful/screens/condition-check';
import { useDesignVariant } from '@/hooks/DesignVariantContext';

export default function ConditionCheckRoute() {
  const { variant } = useDesignVariant();
  return variant === 'playful' ? <PlayfulScreen /> : <ClassicScreen />;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    minHeight: 72,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: { fontSize: 16, fontWeight: '700' },
  topSpacer: { width: 42, height: 42 },
  content: { paddingHorizontal: 20, alignItems: 'center', gap: 19 },
  imageWrap: {
    width: 132,
    height: 184,
    borderRadius: designTokens.radius.card,
    overflow: 'hidden',
    padding: 5,
    shadowColor: designTokens.shadows.soft.shadowColor,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  image: { width: '100%', height: '100%' },
  headingBlock: { width: '100%', gap: 6 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.6 },
  heading: { fontSize: 25, fontWeight: '700', letterSpacing: -0.5 },
  description: { fontSize: 14, lineHeight: 21 },
  overallCard: { width: '100%', borderWidth: 1, borderRadius: designTokens.radius.card, padding: 17, shadowColor: designTokens.shadows.soft.shadowColor, shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 1 },
  rankCard: { width: '100%', borderWidth: 1, borderRadius: designTokens.radius.card, padding: 19, gap: 9 },
  rankHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rankCopy: { flex: 1, gap: 4 },
  rankTitle: { fontSize: 13, fontWeight: '700' },
  rankValue: { fontSize: 36, fontWeight: '800', letterSpacing: -0.6 },
  rankReason: { fontSize: 14, lineHeight: 21 },
  rankGuidance: { fontSize: 12, fontWeight: '600', lineHeight: 18, marginTop: 3 },
  loadingCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  overallHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  overallIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  overallCopy: { flex: 1, gap: 4 },
  overallLabel: { fontSize: 11 },
  overallValue: { fontSize: 17, fontWeight: '700' },
  qualityDetail: { fontSize: 12, lineHeight: 19, marginTop: 10 },
  inlineButton: { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  aiPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  aiPillText: { fontSize: 10, fontWeight: '700' },
  sectionHeader: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 19, fontWeight: '700' },
  sectionCaption: { fontSize: 12 },
  evaluationList: { width: '100%', gap: 9 },
  evaluationCard: { borderWidth: 1, borderRadius: designTokens.radius.medium, overflow: 'hidden', shadowColor: designTokens.shadows.soft.shadowColor, shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 1 },
  evaluationRow: { minHeight: 82, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  evaluationIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  evaluationCopy: { flex: 1, gap: 4 },
  evaluationLabel: { fontSize: 12 },
  evaluationValue: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  detailBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 13 },
  detailDescription: { fontSize: 13, lineHeight: 20 },
  confidenceText: { fontSize: 12, marginTop: 6 },
  warning: { width: '100%', borderRadius: designTokens.radius.small, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  warningText: { flex: 1, fontSize: 12, lineHeight: 18 },
  saveButton: { width: '100%', minHeight: 56, borderRadius: designTokens.radius.medium, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  saveButtonText: { fontSize: 15, fontWeight: '700' },
  saveHint: { width: '100%', fontSize: 12, lineHeight: 18 },
  priceButton: { width: '100%', minHeight: 54, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  priceButtonText: { fontSize: 15, fontWeight: '700' },
});