import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getCardPrices } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { useSavedCards } from '@/hooks/SavedCardsContext';
import { designTokens } from '@/constants/design-tokens';
import {
  ALERTS_STORAGE_KEY, MAX_PRICE_ALERTS, evaluatePriceAlert, parsePriceAlerts,
  type PriceAlert, type PriceQuote,
} from '@/lib/price-alerts';

const yen = (value: number) => `¥${value.toLocaleString('ja-JP')}`;
const basisName = (basis: PriceAlert['basis']) => basis === 'SALE' ? '確認済み成約の中央値' : '店頭の販売提示価格';
const directionName = (direction: PriceAlert['direction']) => direction === 'above' ? '以上' : '以下';

function quoteFromPrices(prices: Awaited<ReturnType<typeof getCardPrices>>, basis: PriceAlert['basis']): PriceQuote | null {
  if (basis === 'SALE') {
    const available = prices.sources.transactions.filter((item) =>
      item.source !== 'yahoo_auction' && item.lastUpdated !== null && item.transactionCount > 0);
    const source = [...available]
      .sort((a, b) => (b.lastUpdated ?? '').localeCompare(a.lastUpdated ?? ''))[0];
    return prices.marketPrice !== null
      && prices.marketPriceBasis === 'confirmed_ungraded_sales'
      && prices.summary.transactionCount >= 3
      && source?.lastUpdated
      ? { price: prices.marketPrice, observedAt: source.lastUpdated, source: available.length === 1 ? source.displayName : '確認済み成約（複数ソース）' }
      : null;
  }
  const listing = prices.sources.sales.find((item) => item.isReference);
  return listing ? { price: listing.price, observedAt: listing.lastUpdated, source: listing.displayName } : null;
}

export function PriceAlertsPanel() {
  const colors = useColors();
  const { cards, isLoaded: cardsLoaded, loadError: cardsError } = useSavedCards();
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const alertsRef = useRef<PriceAlert[]>([]);
  const checking = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState('');
  const [basis, setBasis] = useState<PriceAlert['basis']>('SALE');
  const [direction, setDirection] = useState<PriceAlert['direction']>('below');
  const [threshold, setThreshold] = useState('');
  const [editorError, setEditorError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const persist = useCallback(async (next: PriceAlert[]) => {
    await AsyncStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(next));
    alertsRef.current = next;
    setAlerts(next);
    setStorageError(null);
  }, []);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(ALERTS_STORAGE_KEY)
      .then(parsePriceAlerts)
      .then((items) => {
        if (!mounted) return;
        alertsRef.current = items;
        setAlerts(items);
        setLoaded(true);
      })
      .catch((error) => {
        if (mounted) setStorageError(error instanceof Error ? error.message : 'アラートを読み込めませんでした。');
      });
    return () => { mounted = false; };
  }, []);

  const checkAll = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    setRefreshing(true);
    setNotice(null);
    try {
      for (const initial of alertsRef.current) {
        const rule = alertsRef.current.find((item) => item.id === initial.id);
        if (!rule || !rule.enabled) continue;
        const savedCard = cards.find((item) => item.id === rule.savedCardId);
        const requestCardId = rule.cardCatalogId ?? savedCard?.catalogCardId ?? rule.cardNumber;
        let prices: Awaited<ReturnType<typeof getCardPrices>>;
        try {
          prices = await getCardPrices(encodeURIComponent(requestCardId), {
            name: rule.cardName, period: rule.basis === 'SALE' ? 90 : 30, demo: false,
          }, { cache: 'no-store' });
        } catch {
          setStatuses((prev) => ({ ...prev, [rule.id]: '価格を取得できませんでした' }));
          continue;
        }
        const result = evaluatePriceAlert(rule, quoteFromPrices(prices, rule.basis));
        setStatuses((prev) => ({ ...prev, [rule.id]: result.status }));
        if (result.rule !== rule) {
          try {
            await persist(alertsRef.current.map((item) => item.id === rule.id ? result.rule : item));
          } catch {
            setStorageError('確認結果を保存できませんでした。端末の空き容量を確認してください。');
            break;
          }
        }
        if (result.newlyTriggered) {
          setNotice(`${rule.cardName}が${yen(rule.threshold)}${directionName(rule.direction)}の条件に到達しました。`);
        }
      }
    } finally {
      checking.current = false;
      setRefreshing(false);
    }
  }, [cards, persist]);

  useFocusEffect(useCallback(() => {
    if (loaded && !storageError) void checkAll();
  }, [loaded, storageError, checkAll]));

  const openEditor = (rule?: PriceAlert) => {
    setEditingId(rule?.id ?? null);
    setSelectedCardId(rule?.savedCardId ?? cards[0]?.id ?? '');
    setBasis(rule?.basis ?? 'SALE');
    setDirection(rule?.direction ?? 'below');
    setThreshold(rule ? String(rule.threshold) : '');
    setEditorError(null);
    setEditorOpen(true);
  };

  const saveRule = async () => {
    const card = cards.find((item) => item.id === selectedCardId);
    const printedCardNumber = card?.number.match(/(?:^|\s)(\d{1,4}\/[\w-]{2,25})$/i)?.[1];
    const cardNumber = printedCardNumber ?? card?.number;
    const amount = Number(threshold);
    if (!card || (!printedCardNumber && !card.catalogCardId) || !cardNumber || !card.name.trim()) {
      setEditorError('カード名と有効なカード番号またはカードマスターIDがある保存カードを選んでください。');
      return;
    }
    if (!/^\d+$/.test(threshold) || !Number.isSafeInteger(amount) || amount < 1 || amount > 100_000_000) {
      setEditorError('目標価格は1円から1億円までの整数で入力してください。');
      return;
    }
    if (!editingId && alertsRef.current.length >= MAX_PRICE_ALERTS) {
      setEditorError(`アラートは最大${MAX_PRICE_ALERTS}件までです。`);
      return;
    }
    const previous = alertsRef.current.find((item) => item.id === editingId);
    const rule: PriceAlert = {
      id: previous?.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      savedCardId: card.id, cardCatalogId: card.catalogCardId ?? null,
      cardName: card.name.trim(), cardNumber, basis, direction, threshold: amount,
      enabled: previous?.enabled ?? true, triggered: false, lastPrice: null,
      lastObservedAt: null, lastSource: null, triggeredAt: null,
    };
    try {
      await persist(previous
        ? alertsRef.current.map((item) => item.id === previous.id ? rule : item)
        : [...alertsRef.current, rule]);
      setEditorOpen(false);
      void checkAll();
    } catch {
      setEditorError('保存できませんでした。端末の空き容量を確認してください。');
    }
  };

  const toggleRule = async (rule: PriceAlert) => {
    try {
      await persist(alertsRef.current.map((item) => item.id === rule.id
        ? { ...item, enabled: !item.enabled, triggered: false, triggeredAt: null } : item));
      if (!rule.enabled) void checkAll();
    } catch {
      setStorageError('アラートの変更を保存できませんでした。');
    }
  };

  const removeRule = async (id: string) => {
    try {
      await persist(alertsRef.current.filter((item) => item.id !== id));
      setPendingDeleteId(null);
    } catch {
      setStorageError('アラートを削除できませんでした。');
    }
  };

  return (
    <>
      <View style={[styles.intro, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.introTitle, { color: colors.foreground }]}>価格の条件を登録</Text>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          保存カードの価格を、アラート画面を開いたときに確認します。成約価格と販売提示価格は別々に判定します。
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="アラートを作成" testID="create-alert-button"
          disabled={!loaded || !!storageError || !cardsLoaded}
          onPress={() => openEditor()}
          style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: !loaded || !!storageError || !cardsLoaded ? 0.5 : 1 }]}>
          <Feather name="plus" size={17} color={colors.primaryForeground} />
          <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>アラートを作成</Text>
        </Pressable>
      </View>

      <View style={[styles.limitNotice, { borderColor: colors.warning, backgroundColor: colors.card }]}>
        <Feather name="info" size={18} color={colors.warning} />
        <Text style={[styles.description, { color: colors.mutedForeground, flex: 1 }]}>
          端末への自動プッシュ通知は現在利用できません。価格の継続取得と通知基盤の準備後に対応します。
        </Text>
      </View>

      {notice ? (
        <Text accessibilityRole="alert" style={[styles.reachedBanner, { color: colors.positive, backgroundColor: colors.card }]}>
          {notice}
        </Text>
      ) : null}
      {storageError || cardsError ? (
        <Text accessibilityRole="alert" style={[styles.message, { color: colors.destructive }]}>
          {storageError ?? cardsError}
        </Text>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>登録中のアラート</Text>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>{alerts.length}件</Text>
      </View>
      {!loaded && !storageError ? <Text style={[styles.message, { color: colors.mutedForeground }]}>読み込み中...</Text> : null}
      {loaded && alerts.length === 0 ? (
        <View style={[styles.empty, { borderColor: colors.border }]}>
          <Feather name="sliders" size={24} color={colors.mutedForeground} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>まだアラートはありません</Text>
          <Text style={[styles.description, { color: colors.mutedForeground, textAlign: 'center' }]}>
            コレクションに保存したカードから、目標価格を設定できます。
          </Text>
        </View>
      ) : null}
      {alerts.map((rule) => (
        <View key={rule.id} style={[styles.rule, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.row}>
            <View style={styles.fill}>
              <Text style={[styles.ruleTitle, { color: colors.foreground }]}>{rule.cardName}</Text>
              <Text style={[styles.description, { color: colors.mutedForeground }]}>{rule.cardNumber} · {basisName(rule.basis)}</Text>
            </View>
            <Text style={[styles.badge, {
              color: rule.triggered ? colors.positive : colors.mutedForeground,
              backgroundColor: colors.secondary,
            }]}>{!rule.enabled ? '停止中' : statuses[rule.id] ?? (rule.triggered ? '条件に到達' : '確認待ち')}</Text>
          </View>
          <Text style={[styles.target, { color: colors.foreground }]}>{yen(rule.threshold)}{directionName(rule.direction)}</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            {rule.lastPrice === null ? '確認できる価格はまだありません' :
              `前回の確認: ${yen(rule.lastPrice)} · ${rule.lastSource ?? '情報源不明'} · ${rule.lastObservedAt ? new Date(rule.lastObservedAt).toLocaleDateString('ja-JP') : '日時不明'}`}
          </Text>
          {pendingDeleteId === rule.id ? (
            <View style={styles.actions}>
              <Text style={[styles.description, { color: colors.foreground, flex: 1 }]}>このアラートを削除しますか？</Text>
              <Pressable onPress={() => setPendingDeleteId(null)} accessibilityRole="button"><Text style={{ color: colors.mutedForeground }}>戻る</Text></Pressable>
              <Pressable onPress={() => void removeRule(rule.id)} accessibilityRole="button"><Text style={{ color: colors.destructive }}>削除する</Text></Pressable>
            </View>
          ) : (
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${rule.cardName}を${rule.enabled ? '停止' : '再開'}`}
                onPress={() => void toggleRule(rule)}>
                <Text style={[styles.actionText, { color: colors.primary }]}>{rule.enabled ? '停止' : '再開'}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`${rule.cardName}を編集`} onPress={() => openEditor(rule)}>
                <Text style={[styles.actionText, { color: colors.primary }]}>編集</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`${rule.cardName}を削除`} onPress={() => setPendingDeleteId(rule.id)}>
                <Text style={[styles.actionText, { color: colors.destructive }]}>削除</Text>
              </Pressable>
            </View>
          )}
        </View>
      ))}
      {alerts.length > 0 ? (
        <Pressable accessibilityRole="button" accessibilityLabel="価格を再確認" testID="refresh-alerts-button"
          disabled={refreshing} onPress={() => void checkAll()}
          style={[styles.refresh, { borderColor: colors.border, opacity: refreshing ? 0.5 : 1 }]}>
          <Feather name="refresh-cw" size={16} color={colors.primary} />
          <Text style={[styles.actionText, { color: colors.primary }]}>{refreshing ? '確認中...' : '価格を再確認'}</Text>
        </Pressable>
      ) : null}

      <Modal transparent animationType="slide" visible={editorOpen} onRequestClose={() => setEditorOpen(false)}>
        <View style={styles.overlay}>
          <View style={[styles.editor, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.row}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{editingId ? 'アラートを編集' : 'アラートを作成'}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={() => setEditorOpen(false)}>
                <Feather name="x" size={22} color={colors.foreground} />
              </Pressable>
            </View>
            <ScrollView style={styles.editorScroll} keyboardShouldPersistTaps="handled">
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>保存したカード</Text>
              {cards.length === 0 ? <Text style={[styles.description, { color: colors.mutedForeground }]}>先にカードをコレクションに保存してください。</Text> : null}
              {cards.map((card) => (
                <Pressable key={card.id} accessibilityRole="button" accessibilityState={{ selected: selectedCardId === card.id }}
                  onPress={() => setSelectedCardId(card.id)}
                   style={[styles.choice, {
                     borderColor: selectedCardId === card.id ? colors.primary : colors.border,
                     backgroundColor: selectedCardId === card.id ? colors.surfaceHighlight : colors.card,
                   }]}>
                  <Text style={[styles.choiceText, { color: colors.foreground }]}>{card.name} · {card.number}</Text>
                </Pressable>
              ))}
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>価格の種類</Text>
              <View style={styles.options}>
                {(['SALE', 'LISTING'] as const).map((value) => (
                  <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: basis === value }}
                     onPress={() => setBasis(value)} style={[styles.option, {
                       borderColor: basis === value ? colors.primary : colors.border,
                       backgroundColor: basis === value ? colors.accent : colors.card,
                     }]}>
                    <Text style={[styles.description, { color: colors.foreground }]}>{basisName(value)}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>通知する条件</Text>
              <View style={styles.options}>
                {(['above', 'below'] as const).map((value) => (
                  <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: direction === value }}
                     onPress={() => setDirection(value)} style={[styles.option, {
                       borderColor: direction === value ? colors.primary : colors.border,
                       backgroundColor: direction === value ? colors.accent : colors.card,
                     }]}>
                    <Text style={[styles.description, { color: colors.foreground }]}>{directionName(value)}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.fieldLabel, { color: colors.foreground }]}>目標価格（円）</Text>
              <TextInput accessibilityLabel="目標価格" keyboardType="number-pad" value={threshold}
                onChangeText={setThreshold} placeholder="例: 10000" placeholderTextColor={colors.mutedForeground}
                style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} />
              {editorError ? <Text accessibilityRole="alert" style={[styles.description, { color: colors.destructive }]}>{editorError}</Text> : null}
            </ScrollView>
            <Pressable accessibilityRole="button" accessibilityLabel="アラートを保存" testID="save-alert-button"
              onPress={() => void saveRule()} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
              <Text style={[styles.primaryText, { color: colors.primaryForeground }]}>保存する</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  intro: { borderWidth: 1, borderRadius: designTokens.radius.card, padding: 18, gap: 12, ...designTokens.shadows.soft },
  introTitle: { fontSize: 18, fontWeight: '700' },
  description: { fontSize: 12, lineHeight: 19 },
  primaryButton: { minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { fontSize: 14, fontWeight: '700' },
  limitNotice: { flexDirection: 'row', gap: 10, padding: 14, borderWidth: 1, borderRadius: designTokens.radius.medium, alignItems: 'flex-start' },
  reachedBanner: { padding: 14, borderRadius: designTokens.radius.medium, fontSize: 13, lineHeight: 20 },
  message: { fontSize: 13, lineHeight: 20 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 20, minHeight: 170, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 },
  rule: { borderWidth: 1, borderRadius: designTokens.radius.medium, padding: 16, gap: 12, ...designTokens.shadows.soft },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  fill: { flex: 1 },
  ruleTitle: { fontSize: 16, fontWeight: '700', marginBottom: 3 },
  badge: { fontSize: 11, overflow: 'hidden', borderRadius: designTokens.radius.pill, paddingHorizontal: 10, paddingVertical: 6, fontWeight: '600' },
  target: { fontSize: 24, fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 18, marginTop: 2, minHeight: 30 },
  actionText: { fontSize: 13, fontWeight: '700' },
  refresh: { borderWidth: 1, borderRadius: 14, flexDirection: 'row', minHeight: 46, gap: 8, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  editor: { maxHeight: '88%', borderTopLeftRadius: designTokens.radius.hero, borderTopRightRadius: designTokens.radius.hero, borderWidth: 1, padding: 20, gap: 14 },
  editorScroll: { flexGrow: 0 },
  fieldLabel: { fontSize: 13, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  choice: { borderWidth: 1, borderRadius: designTokens.radius.small, padding: 12, marginBottom: 7, minHeight: 46, justifyContent: 'center' },
  choiceText: { fontSize: 13 },
  options: { flexDirection: 'row', gap: 8 },
  option: { flex: 1, borderWidth: 1, borderRadius: designTokens.radius.pill, minHeight: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: designTokens.radius.small, paddingHorizontal: 13, minHeight: 48, fontSize: 16 },
});