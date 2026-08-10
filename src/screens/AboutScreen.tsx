import { Linking, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/ui/Atoms';
import { SettingsRow } from '../components/ui/SettingsRow';
import { ArcReactor } from '../components/ArcReactor';
import { COLOR, SPACE, TYPE } from '../theme/tokens';
import { APP_VERSION } from '../data/fixtures';

export function AboutScreen() {
  const open = (url: string) => {
    void Linking.openURL(url).catch(() => {});
  };

  return (
    <Screen testID="about-screen">
      <View style={styles.hero}>
        <ArcReactor size={130} status="online" label="" />
        <Text style={styles.name}>JARVIS</Text>
        <Text testID="about-version" style={styles.version}>{`Version ${APP_VERSION}`}</Text>
        <Text style={styles.blurb}>Your intelligent assistant for automation and productivity.</Text>
      </View>

      <View style={styles.group}>
        <SettingsRow
          testID="about-website"
          icon="globe-outline"
          title="Website"
          onPress={() => open('https://docs.expo.dev')}
          trailing={<Ionicons name="open-outline" size={16} color={COLOR.dim} />}
        />
        <SettingsRow testID="about-privacy" icon="shield-checkmark-outline" title="Privacy Policy" />
        <SettingsRow testID="about-license" icon="document-outline" title="License" last />
      </View>

      <Text style={styles.copyright}>© 2026 Jarvis. All rights reserved.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: SPACE.xl, gap: SPACE.xs },
  name: { ...TYPE.wordmark, fontSize: 18, color: COLOR.white, marginLeft: 10, marginTop: SPACE.md },
  version: { ...TYPE.dataLabel, color: COLOR.dim },
  blurb: {
    ...TYPE.meta,
    color: COLOR.dim,
    textAlign: 'center',
    paddingHorizontal: SPACE.xl,
    marginTop: SPACE.sm,
  },
  group: {
    backgroundColor: COLOR.panel,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    overflow: 'hidden',
  },
  copyright: { ...TYPE.dataLabel, color: COLOR.dim, opacity: 0.6, textAlign: 'center', marginTop: SPACE.xl },
});
