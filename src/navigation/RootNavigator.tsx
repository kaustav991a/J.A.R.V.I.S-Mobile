import { useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, View } from 'react-native';
import { BlurTargetView } from 'expo-blur';
import { COLOR } from '../theme/tokens';
import { GlassTabBar } from './GlassTabBar';
import { HomeScreen } from '../screens/HomeScreen';
import { ReportsScreen } from '../screens/ReportsScreen';
import { ConnectionScreen } from '../screens/ConnectionScreen';
import { ActivityScreen } from '../screens/ActivityScreen';
import { ScriptsScreen } from '../screens/ScriptsScreen';
import { ScriptDetailsScreen } from '../screens/ScriptDetailsScreen';
import { ChatScreen } from '../screens/ChatScreen';
import { CommandResultScreen } from '../screens/CommandResultScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AppearanceScreen } from '../screens/AppearanceScreen';
import { AboutScreen } from '../screens/AboutScreen';
import { TABS_ID } from './types';
import type {
  CommandsStackParams,
  HomeStackParams,
  ReportsStackParams,
  ScriptsStackParams,
  SettingsStackParams,
  TabParams,
} from './types';

const HomeStack = createNativeStackNavigator<HomeStackParams>();
const ScriptsStack = createNativeStackNavigator<ScriptsStackParams>();
const CommandsStack = createNativeStackNavigator<CommandsStackParams>();
const ReportsStack = createNativeStackNavigator<ReportsStackParams>();
const SettingsStack = createNativeStackNavigator<SettingsStackParams>();
const Tabs = createBottomTabNavigator<TabParams, typeof TABS_ID>();

/** The canvas gradient shows through every screen, so no navigator paints a background. */
const navTheme: Theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: COLOR.bg, card: 'transparent', border: COLOR.line, text: COLOR.white },
};

/**
 * No navigator headers anywhere. Each screen sets its own title through
 * `ScreenTitle`, at a size a header cannot reach — a 14px centred header title
 * above a screen whose own heading shouts is a hierarchy with two heads. It
 * also keeps the canvas gradient running to the top of the display, which an
 * opaque header used to cut with a flat black band.
 */
const SCREEN_OPTIONS = { headerShown: false } as const;

function HomeStackScreens() {
  return (
    <HomeStack.Navigator screenOptions={SCREEN_OPTIONS}>
      {/* Home draws its own top row — a navigator header would double it */}
      <HomeStack.Screen name="HomeMain" component={HomeScreen} />
      <HomeStack.Screen name="Connection" component={ConnectionScreen} />
      <HomeStack.Screen name="Activity" component={ActivityScreen} />
    </HomeStack.Navigator>
  );
}

function ReportsStackScreens() {
  return (
    <ReportsStack.Navigator screenOptions={SCREEN_OPTIONS}>
      <ReportsStack.Screen name="ReportsHome" component={ReportsScreen} />
    </ReportsStack.Navigator>
  );
}

function ScriptsStackScreens() {
  return (
    <ScriptsStack.Navigator screenOptions={SCREEN_OPTIONS}>
      <ScriptsStack.Screen name="ScriptsHome" component={ScriptsScreen} />
      <ScriptsStack.Screen
        name="ScriptDetails"
        component={ScriptDetailsScreen}
      />
    </ScriptsStack.Navigator>
  );
}

function CommandsStackScreens() {
  return (
    <CommandsStack.Navigator screenOptions={SCREEN_OPTIONS}>
      <CommandsStack.Screen name="CommandsHome" component={ChatScreen} />
      <CommandsStack.Screen
        name="CommandResult"
        component={CommandResultScreen}
      />
    </CommandsStack.Navigator>
  );
}

function SettingsStackScreens() {
  return (
    <SettingsStack.Navigator screenOptions={SCREEN_OPTIONS}>
      <SettingsStack.Screen name="SettingsHome" component={SettingsScreen} />
      <SettingsStack.Screen name="Appearance" component={AppearanceScreen} />
      <SettingsStack.Screen name="About" component={AboutScreen} />
    </SettingsStack.Navigator>
  );
}

/** outline glyphs throughout: the accent capsule carries selection, not weight */
const TAB_ICON: Record<keyof TabParams, keyof typeof Ionicons.glyphMap> = {
  Home: 'home-outline',
  Scripts: 'document-text-outline',
  Commands: 'chatbubble-ellipses-outline',
  Reports: 'bar-chart-outline',
  Settings: 'settings-outline',
};

export function RootNavigator() {
  return (
    <View style={styles.root}>
      <NavigationContainer theme={navTheme}>
        <Tabs.Navigator
          id={TABS_ID}
          tabBar={(props) => <GlassTabBar {...props} icons={TAB_ICON} />}
          screenOptions={{ headerShown: false, sceneStyle: styles.scene }}
        >
          <Tabs.Screen name="Home" component={HomeStackScreens} />
          <Tabs.Screen name="Scripts" component={ScriptsStackScreens} />
          <Tabs.Screen name="Commands" component={CommandsStackScreens} options={{ tabBarLabel: 'Chat' }} />
          <Tabs.Screen name="Reports" component={ReportsStackScreens} />
          <Tabs.Screen name="Settings" component={SettingsStackScreens} />
        </Tabs.Navigator>
      </NavigationContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.bg },
  /** the screens paint their own gradient; anything opaque here would cover it */
  scene: { backgroundColor: 'transparent' },
});
