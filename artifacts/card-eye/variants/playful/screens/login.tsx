import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Screen } from '@/variants/playful/components/Screen';
import { designTokens } from '@/variants/playful/design-tokens';
import { useAuth } from '@/hooks/AuthContext';
import { useColors } from '@/hooks/useColors';

export default function LoginScreen() {
  const colors = useColors();
  const { session, isLoading, loadError, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError('有効なメールアドレスを入力してください。');
      return;
    }
    if (password.length < 6) {
      setError('パスワードは6文字以上で入力してください。');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'login') {
        await signIn(address, password);
        router.replace('/profile');
      } else {
        const result = await signUp(address, password);
        if (result === 'signedIn') router.replace('/profile');
        else {
          setPassword('');
          setNotice('登録を受け付けました。確認メールが届いた場合は、メール内のリンクで認証してからログインしてください。');
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '認証できませんでした。時間をおいてお試しください。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding" keyboardVerticalOffset={0}>
      <Screen>
        <View pointerEvents="none" style={styles.orbit}>
          <View style={[styles.orbitDot, styles.orbitDotLarge, { backgroundColor: colors.lavender }]} />
          <View style={[styles.orbitDot, styles.orbitDotSmall, { backgroundColor: colors.mint }]} />
        </View>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="マイページに戻る" onPress={() => router.replace('/profile')} style={styles.back}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </Pressable>
          <View>
            <Text style={[styles.kicker, { color: colors.tint }]}>CARD EYE / MY SHELF</Text>
            <Text style={[styles.heading, { color: colors.foreground }]}>アカウント</Text>
          </View>
        </View>

          <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.foreground }]}>
          <View style={styles.panelIntro}>
            <View style={[styles.iconBadge, { backgroundColor: colors.coral, borderColor: colors.foreground }]}>
              <Feather name="eye" size={19} color={colors.primary} />
            </View>
            <View style={styles.introCopy}>
              <Text style={[styles.title, { color: colors.foreground }]}>
            {mode === 'login' ? 'ログイン' : '新規登録'}
              </Text>
              <Text style={[styles.description, { color: colors.mutedForeground }]}>
                保存したカードを、いつでも見つけられるように。
              </Text>
            </View>
          </View>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            Supabase Auth のアカウントを使用します。保存したカードと表示名はログイン後もこの端末内に残ります。
          </Text>
          {isLoading ? (
            <Text style={[styles.message, { color: colors.mutedForeground }]}>ログイン状態を確認中...</Text>
          ) : session ? (
            <View style={styles.signedIn}>
              <Text style={[styles.message, { color: colors.foreground }]}>{session.user.email ?? 'ログイン済みです'}</Text>
              <Pressable accessibilityRole="button" onPress={() => router.replace('/profile')}>
                <Text style={[styles.switchText, { color: colors.primary }]}>マイページへ戻る</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.foreground }]}>メールアドレス</Text>
                <TextInput
                  testID="auth-email"
                  accessibilityLabel="メールアドレス"
                  value={email}
                  onChangeText={(value) => { setEmail(value); setError(null); setNotice(null); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  editable={!busy && !loadError}
                  placeholder="name@example.com"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.foreground, color: colors.foreground }]}
                />
              </View>
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.foreground }]}>パスワード</Text>
                <TextInput
                  testID="auth-password"
                  accessibilityLabel="パスワード"
                  value={password}
                  onChangeText={(value) => { setPassword(value); setError(null); setNotice(null); }}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  textContentType={mode === 'register' ? 'newPassword' : 'password'}
                  editable={!busy && !loadError}
                  placeholder="6文字以上"
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { backgroundColor: colors.background, borderColor: colors.foreground, color: colors.foreground }]}
                />
              </View>
              {loadError || error ? (
                <Text accessibilityRole="alert" style={[styles.message, { color: colors.destructive }]}>{loadError || error}</Text>
              ) : null}
              {notice ? <Text accessibilityRole="alert" style={[styles.message, { color: colors.positive }]}>{notice}</Text> : null}
              <Pressable
                testID="auth-submit"
                accessibilityRole="button"
                disabled={busy || !!loadError}
                onPress={() => void submit()}
                style={({ pressed }) => [styles.submit, { backgroundColor: colors.coral, borderColor: colors.foreground, opacity: busy || loadError ? 0.45 : pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.submitText, { color: colors.primaryForeground }]}>
                  {busy ? '処理中...' : mode === 'login' ? 'ログイン' : 'アカウントを作成'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                testID="auth-switch-mode"
                disabled={busy}
                onPress={() => {
                  setMode(mode === 'login' ? 'register' : 'login');
                  setError(null);
                  setNotice(null);
                }}
                style={styles.switch}
              >
                <Text style={[styles.switchText, { color: colors.primary }]}>
                  {mode === 'login' ? 'アカウントをお持ちでない方は新規登録' : 'アカウントをお持ちの方はログイン'}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  back: { minWidth: 42, minHeight: 42, justifyContent: 'center' },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 3 },
  heading: { fontSize: 25, fontWeight: '900', letterSpacing: -0.4 },
  orbit: { position: 'absolute', top: 24, right: 8, width: 100, height: 80 },
  orbitDot: { position: 'absolute', borderRadius: 999, opacity: 0.32 },
  orbitDotLarge: { width: 68, height: 68, right: 0, top: 0 },
  orbitDotSmall: { width: 18, height: 18, left: 5, bottom: 2 },
  panel: { borderWidth: 2, borderRadius: designTokens.radius.hero, padding: 20, gap: 18, ...designTokens.shadows.soft },
  panelIntro: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBadge: { width: 42, height: 42, borderWidth: 1.5, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  introCopy: { flex: 1, gap: 3 },
  title: { fontSize: 23, fontWeight: '900', letterSpacing: -0.4 },
  description: { fontSize: 13, lineHeight: 20 },
  field: { gap: 8 },
  label: { fontSize: 13, fontWeight: '700' },
  input: { minHeight: 50, borderWidth: 2, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  message: { fontSize: 13, lineHeight: 20 },
  signedIn: { gap: 16 },
  submit: { minHeight: 50, borderWidth: 2, borderRadius: 12, alignItems: 'center', justifyContent: 'center', ...designTokens.shadows.soft },
  submitText: { fontSize: 15, fontWeight: '900' },
  switch: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  switchText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
});