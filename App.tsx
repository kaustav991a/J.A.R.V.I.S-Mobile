/**
 * TEMPORARY: mounts PreviewScreen, a fixture harness, so the HUD can be seen
 * in Expo Go ahead of the real screen. Task 14 of the plan replaces the
 * PreviewScreen import below with the real HudScreen.
 */
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { Orbitron_400Regular, Orbitron_700Bold, useFonts } from '@expo-google-fonts/orbitron';
import { PreviewScreen } from './src/screens/PreviewScreen';
import { COLOR } from './src/theme/tokens';

void SplashScreen.preventAutoHideAsync();

export default function App() {
  const [loaded, error] = useFonts({ Orbitron_400Regular, Orbitron_700Bold });

  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  // No SafeAreaView here on purpose: the canvas gradient runs edge to edge and
  // the screen applies insets itself as padding.
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <PreviewScreen />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.bg },
});
