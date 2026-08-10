import { Ionicons } from '@expo/vector-icons';
import { DarkTheme, NavigationContainer, Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet } from 'react-native';
import { COLOR, FONT } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';
import { StatusScreen } from '../screens/StatusScreen';
import { ConnectionScreen } from '../screens/ConnectionScreen';
import { ScriptsScreen } from '../screens/ScriptsScreen';
import { ScriptDetailsScreen } from '../screens/ScriptDetailsScreen';
import { CommandsScreen } from '../screens/CommandsScreen';
import { CommandResultScreen } from '../screens/CommandResultScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { AppearanceScreen } from '../screens/AppearanceScreen';
import { AboutScreen } from '../screens/AboutScreen';
import type {
  CommandsStackParams,
  ScriptsStackParams,
  SettingsStackParams,
  StatusStackParams,
  TabParams,
} from './types';

const StatusStack = createNativeStackNavigator<StatusStackParams>();
const ScriptsStack = createNativeStackNavigator<ScriptsStackParams>();
const CommandsStack = createNativeStackNavigator<CommandsStackParams>();
const SettingsStack = createNativeStackNavigator<SettingsStackParams>();
const Tabs = createBottomTabNavigator<TabParams>();

/** The canvas gradient shows through every screen, so no navigator paints a background. */
const navTheme: Theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: COLOR.bg, card: COLOR.bg, border: COLOR.line, text: COLOR.white },
};

function useHeader() {
  const { accent } = useAppearance();
  return {
    headerStyle: { backgroundColor: COLOR.bg },
    headerShadowVisible: false,
    headerTitleAlign: 'center' as const,
    headerTitleStyle: { fontFamily: FONT.display, fontSize: 14, letterSpacing: 2, color: COLOR.white },
    headerTintColor: accent,
  };
}

function StatusStackScreens() {
  const header = useHeader();
  return (
    <StatusStack.Navigator screenOptions={header}>
      <StatusStack.Screen name="StatusHome" component={StatusScreen} options={{ title: 'STATUS' }} />
      <StatusStack.Screen name="Connection" component={ConnectionScreen} options={{ title: 'CONNECTION' }} />
    </StatusStack.Navigator>
  );
}

function ScriptsStackScreens() {
  const header = useHeader();
  return (
    <ScriptsStack.Navigator screenOptions={header}>
      <ScriptsStack.Screen name="ScriptsHome" component={ScriptsScreen} options={{ title: 'SCRIPTS' }} />
      <ScriptsStack.Screen
        name="ScriptDetails"
        component={ScriptDetailsScreen}
        options={{ title: 'SCRIPT DETAILS' }}
      />
    </ScriptsStack.Navigator>
  );
}

function CommandsStackScreens() {
  const header = useHeader();
  return (
    <CommandsStack.Navigator screenOptions={header}>
      <CommandsStack.Screen name="CommandsHome" component={CommandsScreen} options={{ title: 'COMMANDS' }} />
      <CommandsStack.Screen
        name="CommandResult"
        component={CommandResultScreen}
        options={{ title: 'COMMAND RESULT' }}
      />
    </CommandsStack.Navigator>
  );
}

function SettingsStackScreens() {
  const header = useHeader();
  return (
    <SettingsStack.Navigator screenOptions={header}>
      <SettingsStack.Screen name="SettingsHome" component={SettingsScreen} options={{ title: 'SETTINGS' }} />
      <SettingsStack.Screen name="Appearance" component={AppearanceScreen} options={{ title: 'APPEARANCE' }} />
      <SettingsStack.Screen name="About" component={AboutScreen} options={{ title: 'ABOUT' }} />
    </SettingsStack.Navigator>
  );
}

const TAB_ICON: Record<keyof TabParams, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> =
  {
    Status: { on: 'home', off: 'home-outline' },
    Scripts: { on: 'documents', off: 'documents-outline' },
    Commands: { on: 'terminal', off: 'terminal-outline' },
    Settings: { on: 'settings', off: 'settings-outline' },
  };

export function RootNavigator() {
  const { accent } = useAppearance();

  return (
    <NavigationContainer theme={navTheme}>
      <Tabs.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: accent,
          tabBarInactiveTintColor: COLOR.dim,
          tabBarStyle: styles.tabBar,
          tabBarLabelStyle: styles.tabLabel,
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? TAB_ICON[route.name].on : TAB_ICON[route.name].off}
              size={size}
              color={color}
            />
          ),
        })}
      >
        <Tabs.Screen name="Status" component={StatusStackScreens} />
        <Tabs.Screen name="Scripts" component={ScriptsStackScreens} />
        <Tabs.Screen name="Commands" component={CommandsStackScreens} />
        <Tabs.Screen name="Settings" component={SettingsStackScreens} />
      </Tabs.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: 'rgba(4,12,28,0.96)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLOR.line,
    height: 64,
    paddingTop: 6,
    paddingBottom: 8,
  },
  tabLabel: { fontFamily: FONT.data, fontSize: 10, letterSpacing: 0.5 },
});
