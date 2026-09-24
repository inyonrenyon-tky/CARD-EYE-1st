import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { useColors } from '@/hooks/useColors';
import { useDeviceProfile } from '@/hooks/DeviceProfileContext';

export default function ProfileSettingsScreen() {
  const colors = useColors();
  const { displayName, isLoaded, loadError, saveDisplayName } = useDeviceProfile();
  const [draft, setDraft] = useState(displayName);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoaded) setDraft(displayName);
  }, [isLoaded]);

  const trimmed = draft.trim();
  const canSave = isLoaded && !loadError && !isSaving
    && trimmed.length > 0 && trimmed.length <= 24 && trimmed !== displayName;

  const save = async () => {
    if (!canSave) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await saveDisplayName(trimmed);
      router.replace('/profile');
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : '表示名を保存できませんでした。');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="マイページに戻る"
          onPress={() => router.replace('/profile')}
          style={styles.back}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>表示名の設定</Text>
      </View>

      <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.foreground }]}>この端末の表示名</Text>
          <TextInput
            accessibilityLabel="表示名"
            testID="device-profile-name-input"
            value={draft}
            onChangeText={(text) => { setDraft(text); setSaveError(null); }}
            editable={isLoaded && !loadError && !isSaving}
            maxLength={24}
            placeholder="表示名を入力"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.input, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
          />
          <Text style={[styles.hint, { color: colors.mutedForeground }]}>1〜24文字。表示名はこの端末だけに保存されます。</Text>
        </View>
        {loadError || saveError ? (
          <Text style={[styles.error, { color: colors.destructive }]}>{loadError || saveError}</Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="表示名を保存"
          testID="save-device-profile-button"
          disabled={!canSave}
          onPress={() => void save()}
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: colors.primary, opacity: canSave ? (pressed ? 0.7 : 1) : 0.45 },
          ]}
        >
          <Text style={[styles.saveText, { color: colors.primaryForeground }]}>
            {isSaving ? '保存中...' : '表示名を保存'}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.note, { backgroundColor: colors.secondary }]}>
        <Feather name="info" size={18} color={colors.primary} />
        <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
          アカウントにログインしていても、表示名はこの端末だけに保存されます。端末の変更やアプリの削除後には引き継げません。
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  back: { minWidth: 42, minHeight: 42, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700' },
  panel: { borderWidth: 1, borderRadius: 20, padding: 18, gap: 20 },
  field: { gap: 9 },
  label: { fontSize: 14, fontWeight: '700' },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  hint: { fontSize: 12, lineHeight: 18 },
  error: { fontSize: 12, lineHeight: 18 },
  saveButton: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontSize: 14, fontWeight: '700' },
  note: { borderRadius: 15, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 19 },
});