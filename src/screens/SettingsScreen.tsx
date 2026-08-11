import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Hint, Screen, SectionLabel } from '../components/ui/Atoms';
import { ScreenTitle } from '../components/ui/ScreenTitle';
import { SettingsRow } from '../components/ui/SettingsRow';
import { COLOR, RADIUS, SPACE } from '../theme/tokens';
import { APP_VERSION } from '../data/fixtures';
import { TABS_ID } from '../navigation/types';
import type { SettingsStackParams, TabParams } from '../navigation/types';

export function SettingsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<SettingsStackParams, 'SettingsHome', typeof TABS_ID>>();
  const tabs = nav.getParent<BottomTabNavigationProp<TabParams>>(TABS_ID);

  return (
    <Screen testID="settings-screen">
      <ScreenTitle title="SETTINGS" />
      {/* the rows that lead somewhere, first — a settings list that opens with
          five dead taps teaches the user not to trust it */}
      <SectionLabel>App</SectionLabel>
      <View style={styles.group}>
        <SettingsRow
          testID="settings-connection"
          icon="link-outline"
          title="Connection"
          subtitle="Server, transport and link state"
          onPress={() => nav.navigate('Connection')}
        />
        <SettingsRow
          testID="settings-appearance"
          icon="color-palette-outline"
          title="Appearance"
          subtitle="Accent, glow and animation"
          onPress={() => nav.navigate('Appearance')}
        />
        <SettingsRow
          testID="settings-about"
          icon="information-circle-outline"
          title="About"
          subtitle={`Version ${APP_VERSION}`}
          onPress={() => nav.navigate('About')}
          last
        />
      </View>

      <SectionLabel>Not built yet</SectionLabel>
      <View style={styles.group}>
        <SettingsRow
          testID="settings-general"
          icon="options-outline"
          title="General"
          subtitle="Startup, units and defaults"
          soon
        />
        <SettingsRow
          testID="settings-notifications"
          icon="notifications-outline"
          title="Notifications"
          subtitle="What the desk is allowed to push"
          soon
        />
        <SettingsRow
          testID="settings-security"
          icon="lock-closed-outline"
          title="Security"
          subtitle="Pairing token and permissions"
          soon
          last
        />
      </View>
      <Hint testID="settings-hint">These need backend surfaces the desk does not expose yet.</Hint>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: COLOR.panel,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    overflow: 'hidden',
  },
});
