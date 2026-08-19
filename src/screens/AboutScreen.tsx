import { Linking, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/ui/Atoms';
import { ScreenTitle } from '../components/ui/ScreenTitle';
import { SettingsRow } from '../components/ui/SettingsRow';
import { ArcReactor } from '../components/ArcReactor';
import { COLOR, RADIUS, SPACE, TYPE } from '../theme/tokens';
import * as Updates from 'expo-updates';
import { versionLine } from '../lib/updates';
import { APP_VERSION } from '../data/fixtures';

export function AboutScreen() {
  const open = (url: string) => {
    void Linking.openURL(url).catch(() => {});
  };

  return (
    <Screen testID="about-screen">
      <ScreenTitle title="ABOUT" />
      <View style={styles.hero}>
        {/* the same lockup Home carries, one size up — About is where it is the
            subject rather than a status light */}
        <ArcReactor size={112} status="online" label="" monogram="J" />
        <Text style={styles.name}>JARVIS</Text>
        {/* the number AND when this bundle was published: the number moves when
            a new build ships, the date moves when an over-the-air update lands,
            and only the pair of them says which code is actually running */}
        <Text testID="about-version" style={styles.version}>{`Version `}</Text>
        <Text testID="about-bundle" style={styles.bundle}>{versionLine(null, Updates.createdAt).replace('v? · ', '')}</Text>
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
  bundle: { ...TYPE.dataLabel, color: COLOR.dim, opacity: 0.75 },
  blurb: {
    ...TYPE.meta,
    color: COLOR.dim,
    textAlign: 'center',
    paddingHorizontal: SPACE.xl,
    marginTop: SPACE.sm,
  },
  group: {
    backgroundColor: COLOR.panel,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    overflow: 'hidden',
  },
  copyright: { ...TYPE.dataLabel, color: COLOR.dim, opacity: 0.6, textAlign: 'center', marginTop: SPACE.xl },
});
