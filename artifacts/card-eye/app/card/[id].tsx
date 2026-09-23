import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardArtwork } from '@/components/CardArtwork';
import { recentScans } from '@/constants/mock-data';
import { useColors } from '@/hooks/useColors';
import { useSavedCards, type SavedCardEdits } from '@/hooks/SavedCardsContext';
import { getGetCardPricesQueryKey, useGetCardPrices, type CardObservations } from '@workspace/api-client-react';

const observationItems: Array<{ key: keyof CardObservations; label: string }> = [
  { key: 'centering', label: 'センタリング' },
  { key: 'corners', label: '角' },
  { key: 'edges', label: 'エッジ' },
  { key: 'surface', label: '表面' },
  { key: 'dirt', label: '白かけ' },
  { key: 'other', label: 'その他' },
];

export default function CardDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { cards, isLoaded, loadError, updateCard, deleteCard } = useSavedCards();
  const [modal, setModal] = useState<'edit' | 'delete' | null>(null);
  const [draft, setDraft] = useState<SavedCardEdits>({ name: '', series: '', number: '', rarity: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const savedCard = cards.find((item) => item.id === id);
  const sampleCard = recentScans.find((item) => item.id === id);
  const card = savedCard
    ? {
        id: savedCard.id,
        name: savedCard.name,
        number: savedCard.number,
        rarity: savedCard.rarity || '不明',
        scannedAt: new Date(savedCard.savedAt).toLocaleString('ja-JP'),
        tone: 'blue' as const,
      }
    : sampleCard;

  const isSample = !!sampleCard;
  const priceId = savedCard?.number ?? sampleCard?.number ?? '';
  const priceQuery = { period: 30 as const, demo: isSample };
  const { data: prices, isLoading, error } = useGetCardPrices(
    encodeURIComponent(priceId),
    priceQuery,
    { query: {
      enabled: isLoaded && !loadError && !!priceId,
      queryKey: getGetCardPricesQueryKey(encodeURIComponent(priceId), priceQuery),
    } },
  );

  const hasData = prices && prices.marketPrice != null;

  const navigateToTrend = () => {
    if (!card) return;
    router.push({
      pathname: '/price-trend',
      params: { 
        id: priceId,
        cardName: card.name,
        cardNumber: card.number,
        rarity: card.rarity,
        demo: isSample ? 'true' : 'false',
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

  if (!isLoaded || loadError || !card) {
    return (
      <View style={[styles.screen, styles.unavailable, { backgroundColor: colors.background }]}>
        <Text style={[styles.cardName, { color: colors.foreground }]}>
          {!isLoaded ? 'カードを読み込み中...' : loadError || 'カードが見つかりません'}
        </Text>
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
          <CardArtwork card={card} />
        </View>

        <View style={styles.identity}>
          <View style={styles.nameRow}>
            <Text style={[styles.cardName, { color: colors.foreground }]}>{card.name}</Text>
            {isSample && (
              <View style={[styles.sampleBadge, { backgroundColor: colors.destructive + '20' }]}>
                <Text style={[styles.sampleBadgeText, { color: colors.destructive }]}>サンプル</Text>
              </View>
            )}
            <View style={[styles.rarityPill, { backgroundColor: colors.accent }]}>
              <Text style={[styles.rarity, { color: colors.primary }]}>{card.rarity}</Text>
            </View>
          </View>
          <Text style={[styles.cardNumber, { color: colors.mutedForeground }]}>
            {card.number}
          </Text>
          {savedCard?.series ? (
            <Text style={[styles.cardNumber, { color: colors.mutedForeground }]}>{savedCard.series}</Text>
          ) : null}
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

        <Pressable 
          style={[styles.priceCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={navigateToTrend}
        >
          <View style={styles.priceHeader}>
            <View>
              <Text style={[styles.priceLabel, { color: colors.mutedForeground }]}>
                CARD EYE MARKET
              </Text>
              {error ? (
                <Text style={[styles.price, { color: colors.destructive, fontSize: 20, marginVertical: 4 }]}>
                  取得エラー
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
            </View>
            <View style={[styles.trendBadge, { backgroundColor: colors.secondary }]}>
              <Feather name="chevron-right" size={16} color={colors.foreground} />
            </View>
          </View>
          
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          
          <View style={styles.scanDateRow}>
            <Feather name={isSample ? "info" : "clock"} size={15} color={colors.mutedForeground} />
            <Text style={[styles.scanDateLabel, { color: colors.mutedForeground }]}>
              {isSample ? "デモ用データ" : "保存日時"}
            </Text>
            <Text style={[styles.scanDate, { color: colors.foreground }]}>{isSample ? "サンプル表示" : card.scannedAt}</Text>
          </View>
        </Pressable>

        {savedCard ? (
          <View style={styles.stateSection}>
            <View style={styles.stateHeader}>
              <Text style={[styles.stateTitle, { color: colors.foreground }]}>保存した状態メモ</Text>
              <View style={[styles.stateBadge, { backgroundColor: colors.accent }]}>
                <Text style={[styles.stateBadgeText, { color: colors.primary }]}>AI推定</Text>
              </View>
            </View>
            <View style={[styles.stateSummary, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.stateLabel, { color: colors.mutedForeground }]}>NM相当の可能性</Text>
              <Text style={[styles.stateValue, { color: colors.foreground }]}>
                {savedCard.conditionSummary ?? '写真からは判断できません'}
              </Text>
            </View>
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
                      {savedCard.observations?.[item.key] ?? '画像からは判断できません'}
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
            <View style={[styles.notice, { backgroundColor: colors.secondary }]}>
              <Feather name="alert-circle" size={17} color={colors.primary} />
              <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
                AIによる画像上の推定です。実物の状態や専門鑑定機関による鑑定結果を保証するものではありません。
              </Text>
            </View>
          </View>
        ) : null}

        {isSample ? (
          <View style={[styles.notice, { backgroundColor: colors.destructive + '20' }]}>
            <Feather name="alert-triangle" size={17} color={colors.destructive} />
            <Text style={[styles.noticeText, { color: colors.destructive }]}>
              これはサンプルデータです。実際の査定・スキャン結果ではありません。
            </Text>
          </View>
        ) : (
          <View style={[styles.notice, { backgroundColor: colors.secondary }]}>
            <Feather name="info" size={17} color={colors.primary} />
            <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
              写真は保存していません。実際の相場データはまだ取得できません。
            </Text>
          </View>
        )}
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
  sampleBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 4 },
  sampleBadgeText: { fontSize: 10, fontWeight: '800' },
  rarityPill: { borderRadius: 9, paddingHorizontal: 9, paddingVertical: 6 },
  rarity: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  cardNumber: { fontSize: 13 },
  managementActions: { width: '100%', flexDirection: 'row', gap: 10 },
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
  priceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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
  observationList: { gap: 8 },
  observationRow: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 6 },
  observationValue: { fontSize: 13, lineHeight: 19 },
  notice: { width: '100%', borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  noticeText: { flex: 1, fontSize: 11, lineHeight: 17 },
});
