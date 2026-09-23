import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CardObservations } from '@workspace/api-client-react';

const STORAGE_KEY = 'card-eye:saved-cards:v1';

export type SavedCard = {
  id: string;
  name: string;
  series: string;
  number: string;
  rarity: string;
  conditionSummary: string | null;
  /** Missing on cards saved before individual observations were stored. */
  observations?: CardObservations | null;
  savedAt: string;
};

type NewSavedCard = Pick<SavedCard, 'name' | 'series' | 'number' | 'rarity' | 'conditionSummary'> & {
  observations: CardObservations | null;
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