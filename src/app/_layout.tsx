import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { createNativeTransport } from '@/remote/native-transport';
import { usePreferences } from '@/state/preferences';
import { useRemote } from '@/state/remote';
import { useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const theme = useTheme();
  const loaded = usePreferences((state) => state.loaded);
  const phase = useRemote((state) => state.phase);

  useEffect(() => {
    void usePreferences.getState().load();
    void useRemote.getState().init(createNativeTransport);
  }, []);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.colors.canvas);
  }, [theme.colors.canvas]);

  const ready = loaded && phase !== 'loading';
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  const base = theme.dark ? DarkTheme : DefaultTheme;
  const navigation = {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.colors.primary,
      background: theme.colors.canvas,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      notification: theme.colors.danger,
    },
  };

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <ThemeProvider value={navigation}>
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerStyle: { backgroundColor: theme.colors.canvas },
            headerTintColor: theme.colors.text,
            contentStyle: { backgroundColor: theme.colors.canvas },
          }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="pair" options={{ title: 'Pair with your computer', headerShown: false }} />
          <Stack.Screen name="scan" options={{ title: 'Scan the code', presentation: 'fullScreenModal', headerShown: false }} />
          <Stack.Screen name="remote-control" options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="remote" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ title: 'Settings', presentation: 'modal' }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
