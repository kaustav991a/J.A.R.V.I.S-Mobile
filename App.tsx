/**
 * TEMPORARY: mounts PreviewScreen, a fixture harness, so the HUD built so
 * far can be seen in Expo Go ahead of the real screen. Task 14 of the plan
 * replaces the PreviewScreen import below with the real HudScreen.
 */
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
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

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <PreviewScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.bg },
});
