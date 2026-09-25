import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardThumbnail } from '@/components/CardThumbnail';
import { useColors } from '@/hooks/useColors';
import { useSavedCards, type SavedCardEdits } from '@/hooks/SavedCardsContext';
import { useScan } from '@/hooks/ScanContext';
import {
  customFetch,
  getGetCardPricesQueryKey,
  useGetCardPrices,
  type CardObservations,
  type ConditionAnalysis,
} from '@workspace/api-client-react';

type CatalogCard = {
  id: string;
  name: string;
  number: string;
  series: string;
  rarity: string;
  imageUrl: string | null;
};

const isCatalogUuid = (value: string | undefined): value is string =>
  !!value && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);

function safeLegacyText(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  if (/(?:PSA|BGS|CGC|ARS)|(?:本物|偽物|正規品|偽造品)\s*(?:です|だと|である|と判断|と判定|と断定|の可能性)/i.test(value)) {
    return '過去のメモに鑑定や真贋の推定が含まれるため表示できません。';
  }
  return value;
}

const observationItems: Array<{ key: keyof CardObservations; label: string }> = [
  { key: 'centering', label: 'センタリング' },
  { key: 'corners', label: '角' },
  { key: 'edges', label: 'エッジ' },
  { key: 'surface', label: '表面' },
  { key: 'dirt', label: '白かけ' },
  { key: 'other', label: 'その他' },
];

const conditionItems: Array<{ key: keyof Pick<ConditionAnalysis, 'surface' | 'corners' | 'edges' | 'whitening' | 'centering' | 'scratches' | 'dents' | 'creases' | 'peeling' | 'water_damage'>; label: string }> = [
  { key: 'surface', label: '表面' },
  { key: 'corners', label: '角' },
  { key: 'edges', label: 'エッジ' },
  { key: 'whitening', label: '白かけ' },
  { key: 'centering', label: 'センタリング' },
  { key: 'scratches', label: '傷' },
  { key: 'dents', label: 'へこみ' },
  { key: 'creases', label: '折れ・しわ' },
  { key: 'peeling', label: 'はがれ' },
  { key: 'water_damage', label: '水濡れ' },
];

function conditionStatusLabel(status: ConditionAnalysis['surface']['status']) {
  switch (status) {
    case 'good': return '目立つ所見なし';
    case 'minor': return '軽微';
    case 'moderate': return '中程度';
    case 'significant': return '目立つ所見';
    case 'uncertain': return '判断困難';
    case 'not_assessable': return '評価できません';
  }
}

function conditionCountLabel(count: unknown): string {
  switch (count) {
    case 'none': return '所見数：なし';
    case 'one': return '所見数：1件';
    case 'few': return '所見数：少数';
    case 'many': return '所見数：複数';
    case 'unknown': return '所見数：不明';
    default: return '所見数：未記録';
  }
}

export default function CardDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id, scanId: routeScanId } = useLocalSearchParams<{ id?: string; scanId?: string }>();
  const { cards, isLoaded, loadError, updateCard, deleteCard } = useSavedCards();
  const { uri: scanUri, scanId: activeScanId, analysis: activeAnalysis } = useScan();
  const [modal, setModal] = useState<'edit' | 'delete' | null>(null);
  const [draft, setDraft] = useState<SavedCardEdits>({ name: '', series: '', number: '', rarity: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const savedCard = cards.find((item) => item.id === id);
  const catalogId = isCatalogUuid(id) ? id : savedCard?.catalogCardId ?? null;
  const catalogQuery = useQuery({
    queryKey: ['catalog-card', catalogId],
    queryFn: () => customFetch<{ card: CatalogCard }>(`/api/cards/catalog/${encodeURIComponent(catalogId!)}`),
    enabled: !!catalogId,
    retry: false,
    staleTime: 10 * 60 * 1000,
  });
  const catalogCard = catalogQuery.data?.card;
  const card = savedCard
    ? {
        id: savedCard.id,
        name: savedCard.name,
        number: savedCard.number,
        series: savedCard.series,
        rarity: savedCard.rarity || '不明',
        scannedAt: new Date(savedCard.savedAt).toLocaleString('ja-JP'),
        tone: 'blue' as const,
      }
    : catalogCard
      ? {
          id: catalogCard.id,
          name: catalogCard.name,
          number: catalogCard.number,
          series: catalogCard.series,
          rarity: catalogCard.rarity || '不明',
          scannedAt: 'カードマスター',
          tone: 'blue' as const,
        }
      : null;

  const isCatalogCard = !savedCard && !!catalogCard;
  const priceId = catalogId
    ?? (savedCard?.number ?? '').match(/(?:^|\s)(\d{1,4}\/[\w-]{2,25})$/i)?.[1]
    ?? '';
  const priceQuery = { period: 90 as const, demo: false, name: card?.name };
  const { data: prices, isLoading, error, refetch } = useGetCardPrices(
    encodeURIComponent(priceId),
    priceQuery,
    { request: { cache: 'no-store' }, query: {
      enabled: isLoaded && !loadError && !!priceId && (!!savedCard || !!catalogCard),
      queryKey: getGetCardPricesQueryKey(encodeURIComponent(priceId), priceQuery),
    } },
  );

  const hasData = prices?.marketPrice != null
    && prices.marketPriceBasis === 'confirmed_ungraded_sales'
    && prices.summary.transactionCount >= 3;

  const navigateToTrend = () => {
    if (!card) return;
    router.push({
      pathname: '/price-trend',
      params: { 
        id: priceId,
        cardName: card.name,
        cardNumber: card.number,
        series: card.series,
        rarity: card.rarity,
        demo: 'false',
      }
    });
  };

  const closeModal = () => {
    if (isSubmitting) return;
    setModal(null);
    setActionError(null);
  };

  const openEdit = () => {
    if (!savedCard) return;
    setDraft({
      name: savedCard.name,
      series: savedCard.series,
      number: savedCard.number,
      rarity: savedCard.rarity,
    });
    setActionError(null);
    setModal('edit');
  };

  const saveChanges = async () => {
    if (!savedCard || isSubmitting) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await updateCard(savedCard.id, draft);
      setModal(null);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '変更を保存できませんでした。元の情報は残っています。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!savedCard || isSubmitting) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await deleteCard(savedCard.id);
      setModal(null);
      router.replace('/collection');
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : '削除できませんでした。元のカードは残っています。');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isLoaded || loadError || (!card && (catalogQuery.isLoading || catalogQuery.isFetching)) || (!card && catalogQuery.error)) {
    return (
      <View style={[styles.screen, styles.unavailable, { backgroundColor: colors.background }]}>
        <Text style={[styles.cardName, { color: colors.foreground }]}>
          {!isLoaded ? 'カードを読み込み中...' : loadError || (catalogQuery.isLoading ? 'カードを読み込み中...' : 'カードが見つかりません')}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={{ color: colors.primary }}>戻る</Text>
        </Pressable>
      </View>
    );
  }
  if (!card) {
    return (
      <View style={[styles.screen, styles.unavailable, { backgroundColor: colors.background }]}>
        <Text style={[styles.cardName, { color: colors.foreground }]}>カードが見つかりません</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={{ color: colors.primary }}>戻る</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="前の画面に戻る"
          testID="card-detail-back-button"
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: colors.secondary, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.topBarTitle, { color: colors.foreground }]}>カード詳細</Text>
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.artworkWrap}>
          <CardThumbnail
            card={{
              name: card.name,
              number: card.number,
              series: card.series,
              rarity: card.rarity,
              cardId: catalogId,
            }}
            imageUrl={catalogCard?.imageUrl}
            scanImageUri={routeScanId && routeScanId === activeScanId
              && activeAnalysis?.catalogMatch?.matchedCardId === catalogId ? scanUri : null}
            scanId={routeScanId && routeScanId === activeScanId
              && activeAnalysis?.catalogMatch?.matchedCardId === catalogId ? activeScanId : null}
          />
        </View>

        <View style={styles.identity}>
          <View style={styles.nameRow}>
            <Text style={[styles.cardName, { color: colors.foreground }]}>{card.name}</Text>
            <View style={[styles.rarityPill, { backgroundColor: colors.accent }]}>
              <Text style={[styles.rarity, { color: colors.primary }]}>{card.rarity}</Text>
            </View>
          </View>
          <Text style={[styles.cardNumber, { color: colors.mutedForeground }]}>
            {card.number}
          </Text>
          {card.series ? <Text style={[styles.cardNumber, { color: colors.mutedForeground }]}>{card.series}</Text> : null}
        </View>

        {savedCard ? (
          <View style={styles.managementActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="保存したカードを編集"
              testID="edit-saved-card-button"
              onPress={openEdit}
              style={({ pressed }) => [
                styles.manageButton,
                { backgroundColor: colors.secondary, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="edit-3" size={16} color={colors.foreground} />
              <Text style={[styles.manageButtonText, { color: colors.foreground }]}>編集</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="保存したカードを削除"
              testID="delete-saved-card-button"
              onPress={() => { setActionError(null); setModal('delete'); }}
              style={({ pressed }) => [
                styles.manageButton,
                { backgroundColor: colors.secondary, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Feather name="trash-2" size={16} color={colors.destructive} />
              <Text style={[styles.manageButtonText, { color: colors.destructive }]}>削除</Text>
            </Pressable>
          </View>
        ) : null}

        {savedCard ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="保存したカードの売り時分析を見る"
            testID="saved-card-sell-timing-analysis"
            onPress={() => router.push({
              pathname: '/sell-timing-analysis',
              params: { savedCardId: savedCard.id },
            })}
            style={({ pressed }) => [
              styles.sellAnalysisButton,
              { backgroundColor: colors.primary, opacity: pressed ? 0.82 : 1 },
            ]}
          >
            <View style={styles.sellAnalysisCopy}>
              <Text style={[styles.sellAnalysisEyebrow, { color: colors.primaryForeground }]}>CARD EYE · MARKET INSIGHT</Text>
              <Text style={[styles.sellAnalysisLabel, { color: colors.primaryForeground }]}>売り時分析を見る</Text>
            </View>
            <Feather name="arrow-up-right" size={19} color={colors.primaryForeground} />
          </Pressable>
        ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={error ? "価格を再取得" : "価格相場を見る"}
          style={[styles.priceCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={error ? () => { void refetch(); } : navigateToTrend}
        >
          <View style={styles.priceHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>
                CARD EYE MARKET · 成約中央値
              </Text>
              {error ? (
                <Text style={[styles.price, { color: colors.destructive, fontSize: 20, marginVertical: 4 }]}>
                  取得エラー · タップして再試行
                </Text>
              ) : isLoading ? (
                <Text style={[styles.price, { color: colors.mutedForeground, fontSize: 20, marginVertical: 4 }]}>
                  読み込み中...
                </Text>
              ) : hasData && prices?.marketPrice != null ? (
                <Text style={[styles.price, { color: colors.foreground }]}>
                  ¥{prices.marketPrice.toLocaleString()}
                </Text>
              ) : (
                <Text style={[styles.price, { color: colors.mutedForeground, fontSize: 24, marginVertical: 4 }]}>
                  データなし
                </Text>
              )}
              {prices?.summary.shopMedian != null && (
                <Text style={{ color: colors.mutedForeground, fontSize: 13, marginTop: 4 }}>
                  店舗販売価格の参考値 ¥{prices.summary.shopMedian.toLocaleString()}（成約価格には含めません）
                </Text>
              )}
              <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 5 }}>
                直近90日間の確認済み未鑑定品成約のみ。販売中の出品価格は含みません。
              </Text>
            </View>
            <View style={[styles.trendBadge, { backgroundColor: colors.secondary }]}>
              <Feather name="chevron-right" size={16} color={colors.foreground} />
            </View>
          </View>
          
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          
          <View style={styles.scanDateRow}>
            <Feather name={isCatalogCard ? "info" : "clock"} size={15} color={colors.mutedForeground} />
            <Text style={[styles.scanDateLabel, { color: colors.mutedForeground }]}>
              {isCatalogCard ? "カード情報" : "保存日時"}
            </Text>
            <Text style={[styles.scanDate, { color: colors.foreground }]}>{card.scannedAt}</Text>
          </View>
        </Pressable>

        {savedCard ? (
          <View style={styles.stateSection}>
            <View style={styles.stateHeader}>
              <Text style={[styles.stateTitle, { color: colors.foreground }]}>
                {savedCard.conditionAnalysis ? '保存したカード状態チェック' : '保存した状態メモ'}
              </Text>
              <View style={[styles.stateBadge, { backgroundColor: colors.accent }]}>
                <Text style={[styles.stateBadgeText, { color: colors.primary }]}>AI推定</Text>
              </View>
            </View>
            {savedCard.conditionAnalysis ? (
              <>
                {(() => {
                  const report = savedCard.conditionAnalysis;
                  const reportData = report as ConditionAnalysis & Record<string, unknown>;
                  const hasRank = ['S', 'A', 'A-', 'B', 'C', 'D', 'unassessable'].includes(String(reportData.overall_rank))
                    && typeof reportData.rank_reason === 'string'
                    && typeof reportData.rank_confidence === 'number'
                    && Number.isFinite(reportData.rank_confidence)
                    && reportData.rank_confidence >= 0
                    && reportData.rank_confidence <= 1;
                  const rankUnassessable = hasRank && reportData.overall_rank === 'unassessable';
                  const shouldRetake = report.retakeRecommended
                    || report.imageQuality === 'unusable'
                    || !report.qualityChecks.conditionAssessable
                    || rankUnassessable;
                  const qualityMessage = report.imageQuality === 'unusable' || !report.qualityChecks.conditionAssessable
                    ? 'この画像では状態を十分に確認できません。もう一度撮影してください。'
                    : report.imageQuality === 'limited'
                      ? '画像品質に制約があり、一部の状態を十分に判断できない場合があります。'
                      : '画像から確認できる範囲で状態を推定しました。';

                  return (
                    <>
                      {hasRank ? (
                        <View
                          testID="saved-card-condition-rank"
                          style={[
                            styles.rankCard,
                            {
                              backgroundColor: rankUnassessable ? colors.warningSoft : colors.card,
                              borderColor: rankUnassessable ? colors.warning : colors.primary,
                            },
                          ]}
                        >
                          <View style={styles.rankHeader}>
                            <View style={styles.conditionQualityCopy}>
                              <Text style={[styles.rankTitle, { color: colors.foreground }]}>CARD EYE状態ランク</Text>
                              <Text style={[styles.rankValue, { color: rankUnassessable ? colors.warning : colors.primary }]}>
                                {rankUnassessable ? '評価できません' : String(reportData.overall_rank)}
                              </Text>
                            </View>
                            <View style={[styles.stateBadge, { backgroundColor: colors.accent }]}>
                              <Text style={[styles.stateBadgeText, { color: colors.primary }]}>独自評価</Text>
                            </View>
                          </View>
                          <Text style={[styles.noticeText, { color: colors.foreground }]}>{reportData.rank_reason as string}</Text>
                          <Text style={[styles.conditionConfidence, { color: colors.mutedForeground }]}>
                            ランク判定の確信度 {Math.round(reportData.rank_confidence as number * 100)}%
                          </Text>
                          {rankUnassessable ? (
                            <Text style={[styles.noticeText, { color: colors.warning }]}>
                              ランクを確認するには、明るい場所でカード全体にピントを合わせて撮り直してください。
                            </Text>
                          ) : null}
                        </View>
                      ) : (
                        <View testID="saved-card-condition-rank-unavailable" style={[styles.stateSummary, { backgroundColor: colors.secondary }]}>
                          <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
                            この保存済みレポートにはCARD EYE状態ランクが含まれていません。
                          </Text>
                        </View>
                      )}
                      <View
                        testID="saved-card-condition-quality"
                        style={[
                          styles.conditionQualityNotice,
                          { backgroundColor: colors.secondary, borderColor: shouldRetake ? colors.warning : colors.border },
                        ]}
                      >
                        <Feather
                          name={shouldRetake ? 'alert-triangle' : 'info'}
                          size={17}
                          color={shouldRetake ? colors.warning : colors.primary}
                        />
                        <View style={styles.conditionQualityCopy}>
                          <Text style={[styles.conditionQualityTitle, { color: shouldRetake ? colors.warning : colors.foreground }]}>
                            {report.imageQuality === 'acceptable' ? '画像品質：確認可能' : '画像品質：要確認'}
                          </Text>
                          <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>{qualityMessage}</Text>
                          {report.qualityChecks.strongGlare ? (
                            <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>強い反射で見えにくい部分があります。</Text>
                          ) : null}
                          {!report.qualityChecks.focusSufficient ? (
                            <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>ピントが不十分な部分があります。</Text>
                          ) : null}
                          {!report.qualityChecks.wholeCardVisible || report.qualityChecks.cropped ? (
                            <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>カード全体が写っていない可能性があります。</Text>
                          ) : null}
                          {report.limitations.map((limitation, index) => (
                            <Text key={`${index}-${limitation}`} style={[styles.noticeText, { color: colors.mutedForeground }]}>
                              ・{limitation}
                            </Text>
                          ))}
                          {shouldRetake ? (
                            <Pressable
                              accessibilityRole="button"
                              testID="saved-card-condition-retake-button"
                              onPress={() => router.push('/scan')}
                              style={[styles.retakeButton, { borderColor: colors.border }]}
                            >
                              <Feather name="camera" size={15} color={colors.primary} />
                              <Text style={[styles.retakeButtonText, { color: colors.primary }]}>撮影し直す</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>

                      <View style={styles.observationList}>
                        {conditionItems.map((item) => {
                          const finding = (report as unknown as Record<string, unknown>)[item.key];
                          if (!finding || typeof finding !== 'object' || Array.isArray(finding)) return null;
                          const judgement = finding as Record<string, unknown>;
                          if (typeof judgement.status !== 'string' || typeof judgement.note !== 'string') return null;
                          const status = judgement.status as ConditionAnalysis['surface']['status'];
                          const statusColor = status === 'good'
                            ? colors.positive
                            : status === 'significant'
                              ? colors.destructive
                              : status === 'minor' || status === 'moderate'
                                ? colors.warning
                                : colors.mutedForeground;

                          return (
                            <View
                              key={item.key}
                              testID={`saved-card-condition-${item.key}`}
                              style={[styles.observationRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                            >
                              <View style={styles.conditionItemHeader}>
                                <Text style={[styles.stateLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
                                <Text style={[styles.conditionStatus, { color: statusColor }]}>
                                  {conditionStatusLabel(status)}
                                </Text>
                              </View>
                              <Text style={[styles.observationValue, { color: colors.foreground }]}>{judgement.note}</Text>
                              <Text style={[styles.conditionConfidence, { color: colors.mutedForeground }]}>
                                {conditionCountLabel(judgement.count)}
                              </Text>
                              <Text style={[styles.conditionConfidence, { color: colors.mutedForeground }]}>
                                {typeof judgement.confidence === 'number' && Number.isFinite(judgement.confidence)
                                  ? `判定の確信度 ${Math.round(judgement.confidence * 100)}%`
                                  : '判定の確信度：未記録'}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                      <View style={[styles.notice, { backgroundColor: colors.secondary }]}>
                        <Feather name="alert-circle" size={17} color={colors.primary} />
                        <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
                          CARD EYE状態ランクは撮影画像から確認できる範囲を独自基準で評価したもので、PSA等の専門鑑定機関による鑑定結果を示すものではありません。
                        </Text>
                      </View>
                    </>
                  );
                })()}
              </>
            ) : (
              <>
                {savedCard.conditionSummary || savedCard.observations ? (
                  <View style={[styles.stateSummary, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text style={[styles.stateLabel, { color: colors.mutedForeground }]}>従来の状態メモ</Text>
                    <Text style={[styles.stateValue, { color: colors.foreground }]}>
                      {safeLegacyText(savedCard.conditionSummary, '写真からは判断できません')}
                    </Text>
                  </View>
                ) : null}
                {savedCard.observations ? (
                  <View style={styles.observationList}>
                    {observationItems.map((item) => (
                      <View
                        key={item.key}
                        testID={`saved-card-observation-${item.key}`}
                        style={[styles.observationRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                      >
                        <Text style={[styles.stateLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
                        <Text style={[styles.observationValue, { color: colors.foreground }]}>
                          {safeLegacyText(savedCard.observations?.[item.key], '画像からは判断できません')}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={[styles.stateSummary, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Text testID="saved-card-observations-unavailable" style={[styles.observationValue, { color: colors.mutedForeground }]}>
                      このカードには6項目の状態メモが保存されていません。
                    </Text>
                  </View>
                )}
              </>
            )}
            {!savedCard.conditionAnalysis ? (
              <View style={[styles.notice, { backgroundColor: colors.secondary }]}>
                <Feather name="alert-circle" size={17} color={colors.primary} />
                <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
                  AIによる画像上の推定です。実物の状態や専門鑑定機関による鑑定結果を保証するものではありません。
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {!isCatalogCard ? (
          <View style={[styles.notice, { backgroundColor: colors.secondary }]}>
            <Feather name="info" size={17} color={colors.primary} />
            <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
              写真は保存していません。価格は確認済み成約データがある場合のみ表示します。
            </Text>
          </View>
        ) : null}
      </ScrollView>
      <Modal visible={modal !== null} transparent animationType="fade" onRequestClose={closeModal}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.modalPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              {modal === 'delete' ? 'カードを削除しますか？' : 'カード情報を編集'}
            </Text>
            {modal === 'delete' ? (
              <Text style={[styles.modalDescription, { color: colors.mutedForeground }]}>
                「{savedCard?.name}」をコレクションから削除します。この操作は取り消せません。
              </Text>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" style={styles.formScroll}>
                {([
                  ['name', 'カード名'],
                  ['series', 'シリーズ'],
                  ['number', 'カード番号'],
                  ['rarity', 'レアリティ'],
                ] as const).map(([key, label]) => (
                  <View key={key} style={styles.formField}>
                    <Text style={[styles.formLabel, { color: colors.mutedForeground }]}>{label}</Text>
                    <TextInput
                      accessibilityLabel={label}
                      testID={`edit-card-${key}`}
                      value={draft[key]}
                      onChangeText={(value) => setDraft((current) => ({ ...current, [key]: value }))}
                      editable={!isSubmitting}
                      placeholder={label}
                      placeholderTextColor={colors.mutedForeground}
                      style={[styles.formInput, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                    />
                  </View>
                ))}
                <Text style={[styles.formHint, { color: colors.mutedForeground }]}>
                  カード名とカード番号は必須です。状態メモは変更されません。
                </Text>
              </ScrollView>
            )}
            {actionError ? (
              <Text style={[styles.formError, { color: colors.destructive }]}>{actionError}</Text>
            ) : null}
            <View style={styles.modalActions}>
              <Pressable
                accessibilityRole="button"
                testID="cancel-card-action-button"
                disabled={isSubmitting}
                onPress={closeModal}
                style={[styles.modalButton, { borderColor: colors.border, opacity: isSubmitting ? 0.5 : 1 }]}
              >
                <Text style={[styles.manageButtonText, { color: colors.foreground }]}>キャンセル</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                testID={modal === 'delete' ? 'confirm-delete-card-button' : 'save-card-edits-button'}
                disabled={isSubmitting || (modal === 'edit' && (!draft.name.trim() || !draft.number.trim()))}
                onPress={modal === 'delete' ? confirmDelete : saveChanges}
                style={[
                  styles.modalButton,
                  { backgroundColor: modal === 'delete' ? colors.destructive : colors.primary,
                    borderColor: modal === 'delete' ? colors.destructive : colors.primary,
                    opacity: isSubmitting || (modal === 'edit' && (!draft.name.trim() || !draft.number.trim())) ? 0.5 : 1 },
                ]}
              >
                <Text style={[styles.manageButtonText, { color: colors.primaryForeground }]}>
                  {isSubmitting ? '処理中...' : modal === 'delete' ? '削除する' : '変更を保存'}
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  unavailable: { alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24 },
  topBar: {
    minHeight: 68,
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
  topBarTitle: { fontSize: 16, fontWeight: '700' },
  topBarSpacer: { width: 42, height: 42 },
  content: { padding: 20, paddingBottom: 36, alignItems: 'center', gap: 20 },
  artworkWrap: { width: 184, height: 256 },
  identity: { width: '100%', gap: 7 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  cardName: { flex: 1, fontSize: 24, fontWeight: '700', letterSpacing: -0.4 },
  rarityPill: { borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6 },
  rarity: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  cardNumber: { fontSize: 13 },
  managementActions: { width: '100%', flexDirection: 'row', gap: 10 },
  sellAnalysisButton: { width: '100%', minHeight: 62, borderRadius: 16, paddingHorizontal: 17, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sellAnalysisCopy: { gap: 3 },
  sellAnalysisEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.1, opacity: 0.82 },
  sellAnalysisLabel: { fontSize: 15, fontWeight: '800' },
  manageButton: { flex: 1, minHeight: 45, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  manageButtonText: { fontSize: 13, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', padding: 20 },
  modalPanel: { borderWidth: 1, borderRadius: 20, padding: 20, gap: 15, maxHeight: '85%' },
  modalTitle: { fontSize: 19, fontWeight: '700' },
  modalDescription: { fontSize: 13, lineHeight: 21 },
  formScroll: { flexGrow: 0 },
  formField: { gap: 7, marginBottom: 13 },
  formLabel: { fontSize: 12, fontWeight: '600' },
  formInput: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, minHeight: 43, fontSize: 15 },
  formHint: { fontSize: 11, lineHeight: 17 },
  formError: { fontSize: 12, lineHeight: 18 },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalButton: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  priceCard: { width: '100%', borderWidth: 1, borderRadius: 20, padding: 17, gap: 15 },
  priceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  priceLabel: { fontSize: 12, marginBottom: 5, fontWeight: '700' },
  price: { fontSize: 30, fontWeight: '700', letterSpacing: -0.8 },
  trendBadge: { borderRadius: 16, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth, width: '100%' },
  scanDateRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  scanDateLabel: { flex: 1, fontSize: 12 },
  scanDate: { fontSize: 12, fontWeight: '600' },
  stateSection: { width: '100%', gap: 11 },
  stateHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stateTitle: { fontSize: 18, fontWeight: '700' },
  stateBadge: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9 },
  stateBadgeText: { fontSize: 10, fontWeight: '700' },
  stateSummary: { borderWidth: 1, borderRadius: 15, padding: 14, gap: 5 },
  stateLabel: { fontSize: 11, fontWeight: '600' },
  stateValue: { fontSize: 15, fontWeight: '700', lineHeight: 21 },
  rankCard: { width: '100%', borderWidth: 1, borderRadius: 17, padding: 15, gap: 7 },
  rankHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rankTitle: { fontSize: 12, fontWeight: '700' },
  rankValue: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  observationList: { gap: 8 },
  observationRow: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 6 },
  observationValue: { fontSize: 13, lineHeight: 19 },
  conditionQualityNotice: { width: '100%', borderRadius: 15, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  conditionQualityCopy: { flex: 1, gap: 6 },
  conditionQualityTitle: { fontSize: 12, fontWeight: '700' },
  conditionItemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  conditionStatus: { fontSize: 12, fontWeight: '700' },
  conditionConfidence: { fontSize: 10 },
  retakeButton: { alignSelf: 'flex-start', minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, marginTop: 3 },
  retakeButtonText: { fontSize: 12, fontWeight: '700' },
  notice: { width: '100%', borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  noticeText: { flex: 1, fontSize: 11, lineHeight: 17 },
});
