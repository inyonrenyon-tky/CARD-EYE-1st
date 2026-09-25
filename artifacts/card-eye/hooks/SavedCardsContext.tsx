import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CardObservations, ConditionAnalysis } from '@workspace/api-client-react';

const STORAGE_KEY = 'card-eye:saved-cards:v1';

export type SavedCard = {
  id: string;
  /** Stable catalog identity; absent from cards saved before catalog matching. */
  catalogCardId?: string | null;
  name: string;
  series: string;
  number: string;
  rarity: string;
  conditionSummary: string | null;
  /** Missing on cards saved before individual observations were stored. */
  observations?: CardObservations | null;
  /** Missing on cards saved before the independent condition report was added. */
  conditionAnalysis?: ConditionAnalysis | null;
  savedAt: string;
};

type NewSavedCard = Pick<SavedCard, 'name' | 'series' | 'number' | 'rarity' | 'conditionSummary'> & {
  observations: CardObservations | null;
  conditionAnalysis?: ConditionAnalysis | null;
  catalogCardId?: string | null;
};
export type SavedCardEdits = Pick<SavedCard, 'name' | 'series' | 'number' | 'rarity'>;

type SavedCardsState = {
  cards: SavedCard[];
  isLoaded: boolean;
  loadError: string | null;
  saveCard: (card: NewSavedCard) => Promise<SavedCard>;
  updateCard: (id: string, edits: SavedCardEdits) => Promise<SavedCard>;
  deleteCard: (id: string) => Promise<void>;
};

const SavedCardsContext = createContext<SavedCardsState | null>(null);

const observationKeys = ['centering', 'corners', 'edges', 'surface', 'dirt', 'other'] as const;

function isObservations(value: unknown): value is CardObservations {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = value as Record<string, unknown>;
  return observationKeys.every((key) => entries[key] === null || typeof entries[key] === 'string');
}

const conditionKeys = ['surface', 'corners', 'edges', 'whitening', 'centering', 'scratches'] as const;
const additionalConditionKeys = ['dents', 'creases', 'peeling', 'water_damage'] as const;
const conditionStatuses = ['good', 'minor', 'moderate', 'significant', 'uncertain', 'not_assessable'] as const;
const conditionCounts = ['none', 'one', 'few', 'many', 'unknown'] as const;
const conditionRanks = ['S', 'A', 'A-', 'B', 'C', 'D', 'unassessable'] as const;

function isConditionJudgement(value: unknown, allowMissingCount: boolean): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const judgement = value as Record<string, unknown>;
  return conditionStatuses.includes(judgement.status as (typeof conditionStatuses)[number])
    && typeof judgement.confidence === 'number'
    && Number.isFinite(judgement.confidence)
    && judgement.confidence >= 0
    && judgement.confidence <= 1
    && typeof judgement.note === 'string'
    && (allowMissingCount && judgement.count === undefined
      || conditionCounts.includes(judgement.count as (typeof conditionCounts)[number]));
}

function isConditionAnalysis(value: unknown): value is ConditionAnalysis {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const report = value as Record<string, unknown>;
  const qualityChecks = report.qualityChecks;
  if (!qualityChecks || typeof qualityChecks !== 'object' || Array.isArray(qualityChecks)) return false;

  const checks = qualityChecks as Record<string, unknown>;
  const hasValidChecks = [
    'wholeCardVisible',
    'focusSufficient',
    'strongGlare',
    'cropped',
    'conditionAssessable',
  ].every((key) => typeof checks[key] === 'boolean');

  const rankFieldsPresent = ['overall_rank', 'rank_confidence', 'rank_reason']
    .some((key) => report[key] !== undefined);
  const hasValidRank = !rankFieldsPresent
    || (conditionRanks.includes(report.overall_rank as (typeof conditionRanks)[number])
      && typeof report.rank_confidence === 'number'
      && Number.isFinite(report.rank_confidence)
      && report.rank_confidence >= 0
      && report.rank_confidence <= 1
      && typeof report.rank_reason === 'string');

  return conditionKeys.every((key) => isConditionJudgement(report[key], !rankFieldsPresent))
    && additionalConditionKeys.every((key) => report[key] === undefined
      || isConditionJudgement(report[key], false))
    && typeof report.overallConfidence === 'number'
    && Number.isFinite(report.overallConfidence)
    && report.overallConfidence >= 0
    && report.overallConfidence <= 1
    && ['acceptable', 'limited', 'unusable'].includes(report.imageQuality as string)
    && typeof report.retakeRecommended === 'boolean'
    && hasValidChecks
    && Array.isArray(report.limitations)
    && report.limitations.every((item) => typeof item === 'string')
    && hasValidRank
    && (!rankFieldsPresent || additionalConditionKeys.every((key) => report[key] !== undefined));
}

function isSavedCard(value: unknown): value is SavedCard {
  if (!value || typeof value !== 'object') return false;
  const card = value as Partial<SavedCard>;
  return typeof card.id === 'string'
    && card.id.startsWith('saved-')
    && typeof card.name === 'string'
    && typeof card.series === 'string'
    && typeof card.number === 'string'
    && typeof card.rarity === 'string'
    && (card.conditionSummary === null || typeof card.conditionSummary === 'string')
    && (card.observations === undefined || card.observations === null || isObservations(card.observations))
    && (card.conditionAnalysis === undefined || card.conditionAnalysis === null || isConditionAnalysis(card.conditionAnalysis))
    && (card.catalogCardId === undefined || card.catalogCardId === null
      || (typeof card.catalogCardId === 'string' && /^[a-f0-9-]{36}$/i.test(card.catalogCardId)))
    && typeof card.savedAt === 'string'
    && !Number.isNaN(Date.parse(card.savedAt));
}

export function SavedCardsProvider({ children }: { children: ReactNode }) {
  const [cards, setCards] = useState<SavedCard[]>([]);
  const cardsRef = useRef<SavedCard[]>([]);
  const savingRef = useRef(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored !== null) {
          const parsed: unknown = JSON.parse(stored);
          if (!Array.isArray(parsed) || !parsed.every(isSavedCard)) {
            throw new Error('Invalid saved cards');
          }
          if (active) {
            cardsRef.current = parsed;
            setCards(parsed);
          }
        }
      } catch {
        if (active) setLoadError('保存したカードを読み込めませんでした。データは消去していません。');
      } finally {
        if (active) setIsLoaded(true);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const commit = async <T,>(
    change: (current: SavedCard[]) => { next: SavedCard[]; result: T },
    failureMessage: string,
  ): Promise<T> => {
    if (!isLoaded || loadError) throw new Error('保存先を読み込めないため、カードを保存できません。');
    if (savingRef.current) throw new Error('保存処理中です。少し待ってからお試しください。');
    savingRef.current = true;
    try {
      const { next, result } = change(cardsRef.current);
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        throw new Error(failureMessage);
      }
      cardsRef.current = next;
      setCards(next);
      return result;
    } finally {
      savingRef.current = false;
    }
  };

  const saveCard = (input: NewSavedCard) => {
    const name = input.name.trim();
    const number = input.number.trim();
    if (!name || !number) return Promise.reject(new Error('カード名とカード番号を入力してください。'));
    if (input.observations !== null && !isObservations(input.observations)) {
      return Promise.reject(new Error('状態メモが正しくないため保存できません。'));
    }
    if (input.conditionAnalysis != null && !isConditionAnalysis(input.conditionAnalysis)) {
      return Promise.reject(new Error('状態チェック結果が正しくないため保存できません。'));
    }
    return commit((current) => {
      const card: SavedCard = {
        ...input,
        name,
        number,
        series: input.series.trim(),
        rarity: input.rarity.trim(),
        id: `saved-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        savedAt: new Date().toISOString(),
      };
      return { next: [card, ...current], result: card };
    }, 'カードを保存できませんでした。元のデータは変更していません。');
  };

  const updateCard = (id: string, edits: SavedCardEdits) => {
    const name = edits.name.trim();
    const number = edits.number.trim();
    if (!name || !number) return Promise.reject(new Error('カード名とカード番号を入力してください。'));
    return commit((current) => {
      const index = current.findIndex((card) => card.id === id);
      if (index < 0) throw new Error('保存済みカードが見つかりません。');
      const updated: SavedCard = {
        ...current[index],
        name,
        number,
        series: edits.series.trim(),
        rarity: edits.rarity.trim(),
        catalogCardId: current[index].name === name
          && current[index].number === number
          && current[index].series === edits.series.trim()
          && current[index].rarity === edits.rarity.trim()
          ? current[index].catalogCardId : null,
      };
      const next = [...current];
      next[index] = updated;
      return { next, result: updated };
    }, '変更を保存できませんでした。元のカード情報は残っています。');
  };

  const deleteCard = (id: string) => commit((current) => {
    if (!current.some((card) => card.id === id)) {
      throw new Error('保存済みカードが見つかりません。');
    }
    return { next: current.filter((card) => card.id !== id), result: undefined };
  }, 'カードを削除できませんでした。元のカード情報は残っています。');

  return (
    <SavedCardsContext.Provider value={{ cards, isLoaded, loadError, saveCard, updateCard, deleteCard }}>
      {children}
    </SavedCardsContext.Provider>
  );
}

export function useSavedCards() {
  const context = useContext(SavedCardsContext);
  if (!context) throw new Error('useSavedCards must be used inside SavedCardsProvider');
  return context;
}