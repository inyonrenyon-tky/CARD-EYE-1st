import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type DesignVariant = 'classic' | 'playful';

type DesignVariantContextValue = {
  variant: DesignVariant;
  setVariant: (variant: DesignVariant) => void;
};

const STORAGE_KEY = 'card-eye-design-variant-v1';
const DesignVariantContext = createContext<DesignVariantContextValue | null>(null);

export function DesignVariantProvider({ children }: { children: ReactNode }) {
  const [variant, setVariantState] = useState<DesignVariant>('playful');
  const userChangedVariant = useRef(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (active && !userChangedVariant.current && (stored === 'classic' || stored === 'playful')) {
          setVariantState(stored);
        }
      })
      .catch((error) => {
        console.warn('Could not load saved design preference; using PLAYFUL.', error);
      });
    return () => {
      active = false;
    };
  }, []);

  const setVariant = useCallback((nextVariant: DesignVariant) => {
    userChangedVariant.current = true;
    setVariantState(nextVariant);
    void AsyncStorage.setItem(STORAGE_KEY, nextVariant).catch((error) => {
      console.warn('Could not save design preference.', error);
    });
  }, []);

  const value = useMemo(() => ({ variant, setVariant }), [variant, setVariant]);
  return <DesignVariantContext.Provider value={value}>{children}</DesignVariantContext.Provider>;
}

export function useDesignVariant() {
  const context = useContext(DesignVariantContext);
  if (!context) {
    throw new Error('useDesignVariant must be used within a DesignVariantProvider');
  }
  return context;
}