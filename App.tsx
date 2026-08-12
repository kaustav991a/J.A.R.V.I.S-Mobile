import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { Orbitron_400Regular, Orbitron_700Bold, useFonts } from '@expo-google-fonts/orbitron';
import { RootNavigator } from './src/navigation/RootNavigator';
import { LaunchScreen } from './src/screens/LaunchScreen';
import { LockScreen } from './src/screens/LockScreen';
import { WatchAlertScreen } from './src/screens/WatchAlertScreen';
import { AuthProvider, useAuth } from './src/security/AuthProvider';
import { ReactorHandoffProvider } from './src/components/ReactorHandoff';
import { ToastProvider } from './src/components/ui/Toast';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { BlurTargetProvider } from './src/components/ui/Glass';
import { AppearanceProvider } from './src/theme/appearance';
import { JarvisProvider, useJarvis } from './src/state/JarvisProvider';
import { COLOR } from './src/theme/tokens';

void SplashScreen.preventAutoHideAsync();

/**
 * The gate, as a child so it can read the auth context it is gated by.
 *
 * It renders nothing until the probe and the stored settings have both landed:
 * a gate that flashed up for one frame on a phone with no app lock would be
 * worse than none, and `ready` is the flag that says which of those it is.
 */
function Gate() {
  const { ready, locked } = useAuth();
  if (!ready || !locked) return null;
  return <LockScreen />;
}

/**
 * The desk watch alert, over everything including the gate.
 *
 * Deliberately outside the navigator: it has to be able to arrive while any
 * screen is showing, and a route would be racing whatever navigation the user
 * was in the middle of.
 */
function Watch() {
  const { hud } = useJarvis();
  if (!hud.intruder) return null;
  return <WatchAlertScreen alert={hud.intruder} />;
}

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
      <BlurTargetProvider>
      <SafeAreaProvider>
        <AppearanceProvider>
          <AuthProvider>
            <JarvisProvider>
              <ReactorHandoffProvider>
              <ToastProvider>
                <StatusBar style="light" />
                <RootNavigator />
                {launching ? <LaunchScreen onDone={enter} /> : null}
                {/* The gate queues behind the launch screen. Mounted together,
                    LockScreen fires the OS prompt on the same frame the reactor
                    starts drawing, so the ignition plays under a system sheet and
                    the first thing the app does is interrupt itself. Nothing is
                    exposed by waiting: the launch overlay is opaque and covers
                    the whole app until it lifts. */}
                {launching ? null : <Gate />}
                <Watch />
              </ToastProvider>
              </ReactorHandoffProvider>
            </JarvisProvider>
          </AuthProvider>
        </AppearanceProvider>
      </SafeAreaProvider>
      </BlurTargetProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.bg },
});
