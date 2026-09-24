import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  isLoading: boolean;
  loadError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<'signedIn' | 'confirmEmail'>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);
const missingConfig = 'Supabase Auth の Project URL または publishable key が正しくありません。公開用設定を確認してください。';

function requireClient() {
  if (!supabase) throw new Error(missingConfig);
  return supabase;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(supabase ? null : missingConfig);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setIsLoading(false);
      return;
    }
    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession);
        setIsLoading(false);
      }
    });
    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setLoadError('ログイン状態を読み込めませんでした。');
      else setSession(data.session);
      setIsLoading(false);
    }).catch(() => {
      if (active) {
        setLoadError('ログイン状態を読み込めませんでした。');
        setIsLoading(false);
      }
    });
    const appState = Platform.OS === 'web' ? null : AppState.addEventListener('change', (state) => {
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });
    return () => {
      active = false;
      subscription.unsubscribe();
      appState?.remove();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await requireClient().auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message === 'Invalid login credentials'
      ? 'メールアドレスまたはパスワードが正しくありません。'
      : error.message);
    setLoadError(null);
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await requireClient().auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    setLoadError(null);
    return data.session ? 'signedIn' : 'confirmEmail';
  };

  const signOut = async () => {
    const { error } = await requireClient().auth.signOut();
    if (error) throw new Error(error.message);
  };

  return (
    <AuthContext.Provider value={{ session, isLoading, loadError, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}