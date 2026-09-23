import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'card-eye:device-profile:v1';
const DEFAULT_NAME = 'ゲスト';

type DeviceProfileState = {
  displayName: string;
  isLoaded: boolean;
  loadError: string | null;
  saveDisplayName: (name: string) => Promise<void>;
};

const DeviceProfileContext = createContext<DeviceProfileState | null>(null);

export function DeviceProfileProvider({ children }: { children: ReactNode }) {
  const [displayName, setDisplayName] = useState(DEFAULT_NAME);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored !== null) {
          const parsed: unknown = JSON.parse(stored);
          if (!parsed || typeof parsed !== 'object' || !('displayName' in parsed)
            || typeof parsed.displayName !== 'string'
            || !parsed.displayName.trim()
            || parsed.displayName.trim().length > 24) {
            throw new Error('Invalid device profile');
          }
          if (active) setDisplayName(parsed.displayName.trim());
        }
      } catch {
        if (active) setLoadError('表示名を読み込めませんでした。保存データは消去していません。');
      } finally {
        if (active) setIsLoaded(true);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const saveDisplayName = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 24) throw new Error('表示名は1〜24文字で入力してください。');
    if (!isLoaded || loadError) throw new Error('表示名を読み込めないため変更できません。');
    if (savingRef.current) throw new Error('保存中です。少し待ってからお試しください。');
    savingRef.current = true;
    try {
      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ displayName: trimmed }));
      } catch {
        throw new Error('表示名を保存できませんでした。元の表示名は残っています。');
      }
      setDisplayName(trimmed);
    } finally {
      savingRef.current = false;
    }
  };

  return (
    <DeviceProfileContext.Provider value={{ displayName, isLoaded, loadError, saveDisplayName }}>
      {children}
    </DeviceProfileContext.Provider>
  );
}

export function useDeviceProfile() {
  const value = useContext(DeviceProfileContext);
  if (!value) throw new Error('useDeviceProfile must be used inside DeviceProfileProvider');
  return value;
}