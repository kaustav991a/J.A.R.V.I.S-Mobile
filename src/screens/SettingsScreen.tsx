import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/ui/Atoms';
import { SettingsRow } from '../components/ui/SettingsRow';
import { COLOR, SPACE } from '../theme/tokens';
import { APP_VERSION } from '../data/fixtures';
import type { SettingsStackParams } from '../navigation/types';

export function SettingsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<SettingsStackParams>>();

  return (
    <Screen testID="settings-screen">
      <View style={styles.group}>
        <SettingsRow
          testID="settings-general"
          icon="options-outline"
          title="General"
          subtitle="Customize general preferences"
        />
        <SettingsRow
          testID="settings-connection"
          icon="link-outline"
          title="Connection"
          subtitle="Configure connection settings"
        />
        <SettingsRow
          testID="settings-appearance"
          icon="color-palette-outline"
          title="Appearance"
          subtitle="Customize app appearance"
          onPress={() => nav.navigate('Appearance')}
        />
        <SettingsRow
          testID="settings-notifications"
          icon="notifications-outline"
          title="Notifications"
          subtitle="Manage notifications"
        />
        <SettingsRow
          testID="settings-security"
          icon="lock-closed-outline"
          title="Security"
          subtitle="Security and permissions"
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: COLOR.panel,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    overflow: 'hidden',
    marginTop: SPACE.sm,
  },
});
