import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import { useColors } from '@/hooks/useColors';
import { ScanProvider } from '@/hooks/ScanContext';
import { SavedCardsProvider } from '@/hooks/SavedCardsContext';
import { DeviceProfileProvider } from '@/hooks/DeviceProfileContext';
import { AuthProvider } from '@/hooks/AuthContext';
import { DesignVariantProvider, useDesignVariant } from '@/hooks/DesignVariantContext';
import { setBaseUrl } from '@workspace/api-client-react';

setBaseUrl(process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : null);

const queryClient = new QueryClient();

function RootLayoutNav() {
  const colors = useColors();
  const { variant } = useDesignVariant();

  return (
    <ThemeProvider
      value={{
        ...(variant === 'playful' ? DefaultTheme : DarkTheme),
        colors: {
          ...(variant === 'playful' ? DefaultTheme.colors : DarkTheme.colors),
          background: colors.background,
          card: colors.background,
          text: colors.foreground,
          border: colors.border,
          primary: colors.primary,
        },
      }}
    >
      <StatusBar style={variant === 'playful' ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerBackTitle: '戻る',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="scan" options={{ headerShown: false }} />
        <Stack.Screen name="card/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="camera" options={{ headerShown: false }} />
        <Stack.Screen name="camera-preview" options={{ headerShown: false }} />
        <Stack.Screen name="analysis-result" options={{ headerShown: false }} />
        <Stack.Screen name="condition-check" options={{ headerShown: false }} />
        <Stack.Screen name="price-trend" options={{ headerShown: false }} />
        <Stack.Screen name="market-overview" options={{ headerShown: false }} />
        <Stack.Screen name="sell-timing-analysis" options={{ headerShown: false }} />
        <Stack.Screen name="profile-settings" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="help" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}
function RootLayoutContent() {
  const colors = useColors();

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.background).catch((error) => {
      console.warn('Could not set system background color', error);
    });
  }, [colors.background]);

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.background }}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
            <KeyboardProvider>
              <AuthProvider>
                <SavedCardsProvider>
                  <DeviceProfileProvider>
                    <ScanProvider><RootLayoutNav /></ScanProvider>
                  </DeviceProfileProvider>
                </SavedCardsProvider>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  return (
    <DesignVariantProvider>
      <RootLayoutContent />
    </DesignVariantProvider>
  );
}
