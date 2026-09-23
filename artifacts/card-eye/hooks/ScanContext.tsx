import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { CardAnalysis } from '@workspace/api-client-react';

type ScanState = {
  uri?: string;
  analysis: CardAnalysis | null;
  setScan: (scan: { uri?: string; analysis: CardAnalysis }) => void;
  clearScan: () => void;
};

const ScanContext = createContext<ScanState | null>(null);

export function ScanProvider({ children }: { children: ReactNode }) {
  const [scan, setScanState] = useState<{ uri?: string; analysis: CardAnalysis } | null>(null);
  const value = useMemo<ScanState>(
    () => ({
      uri: scan?.uri,
      analysis: scan?.analysis ?? null,
      setScan: setScanState,
      clearScan: () => setScanState(null),
    }),
    [scan],
  );
  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScan() {
  const context = useContext(ScanContext);
  if (!context) throw new Error('useScan must be used inside ScanProvider');
  return context;
}