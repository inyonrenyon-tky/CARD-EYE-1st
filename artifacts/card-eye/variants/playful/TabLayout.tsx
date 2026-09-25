import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { designTokens } from '@/variants/playful/design-tokens';

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const bottomInset = isWeb ? 34 : insets.bottom;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarActiveBackgroundColor: colors.accent,
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          left: 14,
          right: 14,
          bottom: 0,
          height: 67 + bottomInset,
          paddingTop: 8,
          paddingBottom: bottomInset + 8,
          backgroundColor: colors.card,
          borderTopWidth: 2,
          borderTopColor: colors.border,
          borderLeftWidth: 2,
          borderRightWidth: 2,
          borderBottomWidth: 2,
          borderColor: colors.border,
          borderRadius: designTokens.radius.card,
          elevation: 5,
          shadowColor: colors.text,
          shadowOpacity: 0.16,
          shadowRadius: 0,
          shadowOffset: { width: 3, height: 3 },
          ...(isWeb ? { height: 101 } : {}),
        },
        tabBarItemStyle: { borderRadius: designTokens.radius.medium, marginHorizontal: 5, marginVertical: 5, overflow: 'hidden', minHeight: 48 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginTop: 1 },
        tabBarBackground: () => (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.card, borderRadius: designTokens.radius.card }]} />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'ホーム',
          tabBarAccessibilityLabel: 'ホーム',
          tabBarIcon: ({ color }) => <Feather name="home" size={21} color={color} />,
        }}
      />
      <Tabs.Screen
        name="collection"
        options={{
          title: 'コレクション',
          tabBarAccessibilityLabel: 'コレクション',
          tabBarIcon: ({ color }) => <Feather name="grid" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'アラート',
          tabBarAccessibilityLabel: 'アラート',
          tabBarIcon: ({ color }) => <Feather name="bell" size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'マイページ',
          tabBarAccessibilityLabel: 'マイページ',
          tabBarIcon: ({ color }) => <Feather name="user" size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}
