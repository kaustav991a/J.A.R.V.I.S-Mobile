import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { Orbitron_400Regular, Orbitron_700Bold, useFonts } from '@expo-google-fonts/orbitron';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AppearanceProvider } from './src/theme/appearance';
import { JarvisProvider } from './src/state/JarvisProvider';
import { COLOR } from './src/theme/tokens';

void SplashScreen.preventAutoHideAsync();

export default function App() {
  const [loaded, error] = useFonts({ Orbitron_400Regular, Orbitron_700Bold });

  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  // AppearanceProvider is outermost: the navigator itself reads the accent for
  // its header tint and tab bar.
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <AppearanceProvider>
          <JarvisProvider>
            <StatusBar style="light" />
            <RootNavigator />
          </JarvisProvider>
        </AppearanceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.bg },
});
