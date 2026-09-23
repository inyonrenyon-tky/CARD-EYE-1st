import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardArtwork } from '@/components/CardArtwork';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import { useScan } from '@/hooks/ScanContext';
import { useSavedCards } from '@/hooks/SavedCardsContext';
import type { CardAnalysis } from '@workspace/api-client-react';

type IconName =
  | 'maximize'
  | 'corner-up-left'
  | 'square'
  | 'sun'
  | 'droplet'
  | 'more-horizontal';

type Evaluation = {
  key: string;
  label: string;
  value: string;
  icon: IconName;
  status: 'positive' | 'caution' | 'neutral';
  detail: string;
};

const evaluationMeta: Array<{ key: keyof CardAnalysis['observations']; label: string; icon: IconName }> = [
  { key: 'centering', label: 'センタリング', icon: 'maximize' },
  { key: 'corners', label: '角', icon: 'corner-up-left' },
  { key: 'edges', label: 'エッジ', icon: 'square' },
  { key: 'surface', label: '表面', icon: 'sun' },
  { key: 'dirt', label: '白かけ', icon: 'droplet' },
  { key: 'other', label: 'その他', icon: 'more-horizontal' },
];
/*
 * Observation text is intentionally displayed verbatim: the API is the source
 * of truth and a single photograph cannot establish a professional grade.
 */
function buildEvaluations(observations: CardAnalysis['observations'] | undefined): Evaluation[] {
  return evaluationMeta.map((item) => ({
    ...item,
    value: observations?.[item.key] ?? '画像からは判断できません',
    status: observations?.[item.key] ? 'neutral' : 'neutral',
    detail: observations?.[item.key] ?? 'この項目は写真から確認できませんでした。',
  }));
}
export default function ConditionCheckScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { analysis: savedAnalysis, uri: scanUri } = useScan();
  const { saveCard, isLoaded, loadError: storageError } = useSavedCards();
  const { uri, cardName, cardNumber, rarity } = useLocalSearchParams<{
    uri?: string;
    cardName?: string;
    cardNumber?: string;
    rarity?: string;
  }>();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const analysis = scanUri && (!uri || uri === scanUri) ? savedAnalysis : null;
  const evaluations = buildEvaluations(analysis?.observations);
  const displayUri = uri || scanUri;
  const name = (cardName || analysis?.cardName || '').trim();
  const number = (cardNumber || analysis?.cardNumber || '').trim();
  const canSave = isLoaded && !storageError && !!name && !!number && !isSaving;

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
        conditionSummary: analysis?.conditionSummary ?? null,
        observations: analysis?.observations ?? null,
      });
      router.replace('/collection');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'カードを保存できませんでした。');
    } finally {
      setIsSaving(false);
    }
  };

  const statusColor = (status: Evaluation['status']) => {
    if (status === 'positive') return colors.positive;
    if (status === 'caution') return colors.warning;
    return colors.mutedForeground;
  };

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
        <View style={styles.imageWrap}>
          {displayUri ? (
            <Image source={{ uri: displayUri }} resizeMode="contain" style={styles.image} />
          ) : (
            <CardArtwork card={{ name: cardName || 'カード情報未確認', number: cardNumber || '番号未確認', tone: 'orange' }} />
          )}
        </View>

        <View style={styles.headingBlock}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>CONDITION CHECK</Text>
          <Text style={[styles.heading, { color: colors.foreground }]}>カードの状態を確認</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            {analysis
              ? '撮影画像から読み取れる範囲で状態を推定しています。単一写真のため、実物の状態や鑑定結果は保証できません。'
              : 'カードを解析すると、撮影画像から読み取れる観察結果を表示します。'}
          </Text>
        </View>

        <View style={[styles.overallCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.overallHeader}>
            <View style={[styles.overallIcon, { backgroundColor: colors.positiveSoft }]}>
              <Feather name="shield" size={22} color={colors.positive} />
            </View>
            <View style={styles.overallCopy}>
              <Text style={[styles.overallLabel, { color: colors.mutedForeground }]}>NM相当の可能性</Text>
              <Text style={[styles.overallValue, { color: colors.foreground }]}>
                {analysis?.conditionSummary ?? '写真からは判断できません'}
              </Text>
            </View>
            <View style={[styles.aiPill, { backgroundColor: colors.accent }]}>
              <Text style={[styles.aiPillText, { color: colors.primary }]}>AI推定</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>評価項目</Text>
          <Text style={[styles.sectionCaption, { color: colors.mutedForeground }]}>6項目</Text>
        </View>

        <View style={styles.evaluationList}>
          {evaluations.map((item) => {
            const isExpanded = expandedKey === item.key;
            const accent = statusColor(item.status);

            return (
              <View
                key={item.key}
                style={[styles.evaluationCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label}の詳細を見る`}
                  accessibilityState={{ expanded: isExpanded }}
                  aria-expanded={isExpanded}
                  testID={`condition-item-${item.key}`}
                  onPress={() => setExpandedKey(isExpanded ? null : item.key)}
                  style={({ pressed }) => [styles.evaluationRow, { opacity: pressed ? 0.72 : 1 }]}
                >
                  <View style={[styles.evaluationIcon, { backgroundColor: colors.secondary }]}>
                    <Feather name={item.icon} size={18} color={accent} />
                  </View>
                  <View style={styles.evaluationCopy}>
                    <Text style={[styles.evaluationLabel, { color: colors.mutedForeground }]}>
                      {item.label}
                    </Text>
                    <Text style={[styles.evaluationValue, { color: colors.foreground }]}>
                      {item.value}
                    </Text>
                  </View>
                  <View style={styles.detailAction}>
                    <Text style={[styles.detailText, { color: colors.primary }]}>
                      {isExpanded ? '閉じる' : '詳細を見る'}
                    </Text>
                    <Feather
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={15}
                      color={colors.primary}
                    />
                  </View>
                </Pressable>
                {isExpanded ? (
                  <View style={[styles.detailBox, { borderTopColor: colors.border }]}>
                    <Text style={[styles.detailDescription, { color: colors.mutedForeground }]}>
                      {item.detail}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        <View style={[styles.warning, { backgroundColor: colors.secondary }]}>
          <Feather name="alert-circle" size={18} color={colors.primary} />
          <Text style={[styles.warningText, { color: colors.mutedForeground }]}>
            AIによる画像上の推定です。実物の状態や専門鑑定機関による鑑定結果を保証するものではありません。
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
            {isSaving ? '保存中...' : 'コレクションに保存'}
          </Text>
        </Pressable>
        {!name || !number ? (
          <Text style={[styles.saveHint, { color: colors.mutedForeground }]}>
            保存にはカード名とカード番号が必要です。前の画面で情報を修正してください。
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
                uri: displayUri ?? '',
                cardName: cardName ?? analysis?.cardName ?? '',
                cardNumber: cardNumber ?? analysis?.cardNumber ?? '',
                rarity: rarity ?? analysis?.rarity ?? '',
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
  content: { paddingHorizontal: 20, alignItems: 'center', gap: 17 },
  imageWrap: {
    width: 116,
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  headingBlock: { width: '100%', gap: 6 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.6 },
  heading: { fontSize: 25, fontWeight: '700', letterSpacing: -0.5 },
  description: { fontSize: 13, lineHeight: 20 },
  overallCard: { width: '100%', borderWidth: 1, borderRadius: 20, padding: 16 },
  overallHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  overallIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  overallCopy: { flex: 1, gap: 4 },
  overallLabel: { fontSize: 11 },
  overallValue: { fontSize: 17, fontWeight: '700' },
  aiPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6 },
  aiPillText: { fontSize: 10, fontWeight: '700' },
  sectionHeader: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  sectionCaption: { fontSize: 12 },
  evaluationList: { width: '100%', gap: 9 },
  evaluationCard: { borderWidth: 1, borderRadius: 17, overflow: 'hidden' },
  evaluationRow: { minHeight: 76, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11 },
  evaluationIcon: { width: 37, height: 37, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  evaluationCopy: { flex: 1, gap: 4 },
  evaluationLabel: { fontSize: 11 },
  evaluationValue: { fontSize: 13, fontWeight: '700' },
  detailAction: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  detailText: { fontSize: 10, fontWeight: '700' },
  detailBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 13, paddingVertical: 12 },
  detailDescription: { fontSize: 12, lineHeight: 18 },
  warning: { width: '100%', borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  warningText: { flex: 1, fontSize: 11, lineHeight: 17 },
  saveButton: { width: '100%', minHeight: 54, borderRadius: 17, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  saveButtonText: { fontSize: 15, fontWeight: '700' },
  saveHint: { width: '100%', fontSize: 12, lineHeight: 18 },
  priceButton: { width: '100%', minHeight: 54, borderRadius: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  priceButtonText: { fontSize: 15, fontWeight: '700' },
});