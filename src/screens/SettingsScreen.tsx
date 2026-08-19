import { StyleSheet, Switch, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Hint, Screen, SectionLabel } from '../components/ui/Atoms';
import { ScreenTitle } from '../components/ui/ScreenTitle';
import { SettingsRow } from '../components/ui/SettingsRow';
import { useToast } from '../components/ui/Toast';
import { useJarvis } from '../state/JarvisProvider';
import { COLOR, RADIUS, SPACE } from '../theme/tokens';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { versionLine } from '../lib/updates';
import { APP_VERSION } from '../data/fixtures';
import { TABS_ID } from '../navigation/types';
import type { SettingsStackParams, TabParams } from '../navigation/types';

export function SettingsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<SettingsStackParams, 'SettingsHome', typeof TABS_ID>>();
  const tabs = nav.getParent<BottomTabNavigationProp<TabParams>>(TABS_ID);
  const { shareLocation, setShareLocation } = useJarvis();
  const toast = useToast();

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
          testID="settings-security"
          icon="lock-closed-outline"
          title="Security"
          subtitle="App lock and approval confirmation"
          onPress={() => nav.navigate('Security')}
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

      <SectionLabel>Privacy</SectionLabel>
      <View style={styles.group}>
        {/* Off until switched on, and one switch for one disclosure: the trail and
            the fix are the same decision, and separating them is how people end up
            sharing more than they meant to. */}
        <SettingsRow
          testID="settings-location"
          icon="location-outline"
          title="Share my location"
          subtitle={
            shareLocation
              ? 'Questions carry where you are, and where you have been today'
              : 'Off — J.A.R.V.I.S. answers without knowing where you are'
          }
          trailing={
            <Switch
              testID="settings-location-switch"
              value={shareLocation}
              onValueChange={(on) => {
                void setShareLocation(on).then((ok) => {
                  if (!ok) toast.show('Location permission was refused', 'bad');
                });
              }}
            />
          }
        />
        <SettingsRow
          testID="settings-places"
          icon="map-outline"
          title="Places and leaving times"
          subtitle="Name home and the office, set when you leave each, take an umbrella"
          onPress={() => nav.navigate('Places')}
        />
        <SettingsRow
          testID="settings-memory"
          icon="bookmark-outline"
          title="Memory"
          subtitle="What he knows about you — read it, add to it, take things back"
          onPress={() => nav.navigate('Memory')}
        />
        <SettingsRow
          testID="settings-journal"
          icon="pulse-outline"
          title="Journal"
          subtitle="How this phone is used, kept on the phone and nowhere else"
          onPress={() => nav.navigate('Journal')}
        />
        <SettingsRow
          testID="settings-updates"
          icon="cloud-download-outline"
          title="Updates"
          // the running version on the row itself, so "did my push land" is
          // answered without opening anything. The publish time is the part that
          // changes; the id and the runtime hash tell a person nothing at a glance
          subtitle={versionLine(Constants.expoConfig?.version, Updates.createdAt)}
          onPress={() => nav.navigate('Updates')}
          last
        />
      </View>
      <Hint testID="settings-location-hint">
        Taken one reading at a time, only while the app is open — never in the background. The
        trail is kept on this phone, capped, and forgotten when you switch this off.
      </Hint>

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
          testID="settings-pairing"
          icon="key-outline"
          title="Pairing token"
          subtitle="The secret the desk checks on the socket"
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
