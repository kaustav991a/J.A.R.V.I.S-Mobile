import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { Orbitron_400Regular, Orbitron_700Bold, useFonts } from '@expo-google-fonts/orbitron';
import { RootNavigator } from './src/navigation/RootNavigator';
import { LaunchScreen } from './src/screens/LaunchScreen';
import { ToastProvider } from './src/components/ui/Toast';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { AppearanceProvider } from './src/theme/appearance';
import { JarvisProvider } from './src/state/JarvisProvider';
import { COLOR } from './src/theme/tokens';

void SplashScreen.preventAutoHideAsync();

export default function App() {
  const [loaded, error] = useFonts({ Orbitron_400Regular, Orbitron_700Bold });
  // the native splash hands off to this one, so the reactor never blinks out
  const [launching, setLaunching] = useState(true);
  const enter = useCallback(() => setLaunching(false), []);

  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  // AppearanceProvider is outermost: the navigator itself reads the accent for
  // its header tint and tab bar.
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppearanceProvider>
          <JarvisProvider>
            <ToastProvider>
              <StatusBar style="light" />
              <RootNavigator />
              {launching ? <LaunchScreen onDone={enter} /> : null}
            </ToastProvider>
          </JarvisProvider>
        </AppearanceProvider>
      </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.bg },
});
