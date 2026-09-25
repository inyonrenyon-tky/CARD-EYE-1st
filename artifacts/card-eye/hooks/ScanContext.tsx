import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { CardAnalysis } from '@workspace/api-client-react';

type ScanState = {
  uri?: string;
  scanId?: string;
  analysis: CardAnalysis | null;
  setPhotoUri: (uri: string) => void;
  setScan: (analysis: CardAnalysis) => void;
  clearScan: () => void;
};

const ScanContext = createContext<ScanState | null>(null);

export function ScanProvider({ children }: { children: ReactNode }) {
  const [uri, setUri] = useState<string>();
  const [scanId, setScanId] = useState<string>();
  const [analysis, setAnalysis] = useState<CardAnalysis | null>(null);
  const value = useMemo<ScanState>(
    () => ({
      uri,
      scanId,
      analysis,
      setPhotoUri: (photoUri) => {
        setUri(photoUri);
        setScanId(`${Date.now()}-${Math.random().toString(36).slice(2)}`);
        setAnalysis(null);
      },
      setScan: setAnalysis,
      clearScan: () => {
        setUri(undefined);
        setScanId(undefined);
        setAnalysis(null);
      },
    }),
    [uri, scanId, analysis],
  );
  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScan() {
  const context = useContext(ScanContext);
  if (!context) throw new Error('useScan must be used inside ScanProvider');
  return context;
}