import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';

import { EmptyState, Hint, Screen, SectionLabel } from '../components/ui/Atoms';
import { ScreenTitle } from '../components/ui/ScreenTitle';
import { SettingsRow } from '../components/ui/SettingsRow';
import { COLOR, RADIUS, SPACE, TYPE } from '../theme/tokens';
import { clockLabel, dayHeading } from '../lib/day';
import { clearCrashes, crashReport, loadCrashes, markSeen } from '../lib/crashLog';
import type { CrashRecord } from '../lib/crashLog';
import { haptic } from '../lib/haptics';

/**
 * What the app can say about the last time it died.
 *
 * Until this screen existed the answer was `adb logcat`, on the one machine that
 * built the APK, with the phone on a cable — so a crash on a Tuesday afternoon was
 * simply lost. Everything here is read off disk and nothing is fetched: the screen
 * has to work on a phone with no link, which is a state a crash makes more likely
 * rather than less.
 *
 * Only JavaScript crashes reach it. A native crash takes the process with no JS
 * involved and leaves nothing to catch — that half is a service and a build, and it
 * is owed rather than quietly implied by this screen being here. The caption says
 * so, because a diagnostics screen that silently covers half the failures is worse
 * than none: it turns "nothing recorded" into evidence.
 */
export function DiagnosticsScreen() {
  const [crashes, setCrashes] = useState<CrashRecord[]>([]);
  const [copied, setCopied] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setCrashes(await loadCrashes());
        // opening the screen is what counts as reading them; the settings row
        // stops announcing from here
        await markSeen(Date.now());
      })();
    }, [])
  );

  const copy = useCallback(async () => {
    await Clipboard.setStringAsync(crashReport(crashes));
    setCopied(true);
    haptic.good();
  }, [crashes]);

  const forget = useCallback(async () => {
    await clearCrashes();
    setCrashes([]);
    setCopied(false);
    haptic.good();
  }, []);

  return (
    <Screen testID="diagnostics-screen">
      <ScreenTitle title="DIAGNOSTICS" caption="JAVASCRIPT CRASHES" back />

      <Hint>
        Kept on the phone and nowhere else. The message, the stack and which build it happened on — never chat text
        and never a token.
      </Hint>

      {crashes.length === 0 ? (
        <EmptyState
          testID="diagnostics-empty"
          text="Nothing has crashed"
          hint="A JavaScript crash is written down here as it happens. A native crash still needs a cable — it takes the process before any of this runs."
        />
      ) : (
        <>
          <SectionLabel>{crashes.length === 1 ? 'One crash' : `${crashes.length} crashes`}</SectionLabel>
          {crashes.map((crash, i) => (
            <View key={`${crash.at}-${i}`} testID={`crash-${i}`} style={styles.card}>
              <Text style={styles.when}>
                {dayHeading(crash.at)} {clockLabel(crash.at)} · {crash.kind === 'render' ? 'While drawing' : 'In the background'}
              </Text>
              <Text testID={`crash-${i}-message`} style={styles.message}>
                {crash.name}: {crash.message}
              </Text>
              <Text testID={`crash-${i}-build`} style={styles.build}>
                v{crash.build.version} · {crash.build.updateId} · {crash.build.platform}
              </Text>
              {crash.frames.length ? (
                <Text testID={`crash-${i}-frames`} style={styles.frames}>
                  {crash.frames.slice(0, 6).join('\n')}
                </Text>
              ) : null}
            </View>
          ))}

          <SectionLabel>What to do with it</SectionLabel>
          <SettingsRow
            testID="diagnostics-copy"
            icon="copy-outline"
            title={copied ? 'Copied' : 'Copy the report'}
            subtitle="Every record above as text, timestamps included"
            onPress={() => void copy()}
          />
          <SettingsRow
            testID="diagnostics-clear"
            icon="trash-outline"
            title="Forget them"
            subtitle="Only the records go — nothing is fixed by clearing them"
            onPress={() => void forget()}
            last
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLOR.panel,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    padding: SPACE.lg,
    marginBottom: SPACE.sm,
    gap: SPACE.xs,
  },
  when: { ...TYPE.dataLabel, fontSize: 11, letterSpacing: 1.2, color: COLOR.dim },
  message: { ...TYPE.meta, fontSize: 14, lineHeight: 20, color: COLOR.white },
  build: { ...TYPE.meta, fontSize: 11, color: COLOR.dim },
  frames: { ...TYPE.meta, fontSize: 10, lineHeight: 15, color: COLOR.dim },
});
