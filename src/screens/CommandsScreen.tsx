import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen, EmptyState } from '../components/ui/Atoms';
import { ScreenTitle } from '../components/ui/ScreenTitle';
import { CommandBar } from '../components/CommandBar';
import { Touchable } from '../components/ui/Touchable';
import { COLOR, RADIUS, SPACE, TYPE } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';
import { useJarvis } from '../state/JarvisProvider';
import { SAMPLE_RESULT } from '../data/fixtures';
import type { CommandsStackParams } from '../navigation/types';

/** the four the desk backend answers today, in the phrasing it expects */
const SUGGESTIONS = ['system status', 'open browser', 'take screenshot', 'list files'];

export function CommandsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<CommandsStackParams>>();
  const { accent } = useAppearance();
  const { sendCommand, recent, clearRecent, hud, connected } = useJarvis();

  /** the newest thing Jarvis said, which is what a command result shows */
  const latestReply = () => {
    for (let i = hud.chat.length - 1; i >= 0; i--) {
      if (hud.chat[i].from === 'jarvis') return hud.chat[i].text;
    }
    return connected ? 'No reply yet.' : SAMPLE_RESULT;
  };

  const run = async (text: string) => {
    try {
      await sendCommand(text);
    } catch {
      // a dead link is already visible on the Status tab; the result screen
      // says what came back, which is nothing
    }
    nav.navigate('CommandResult', { command: text, output: latestReply() });
  };

  return (
    <Screen testID="commands-screen">
      <ScreenTitle title="COMMANDS" />
      <CommandBar
        placeholder="Enter command…"
        onSubmit={(text) => void run(text)}
        onVoice={() => {}}
        disabled={false}
      />

      <View style={styles.chips}>
        {SUGGESTIONS.map((s) => (
          <Touchable
            key={s}
            testID={`suggest-${s}`}
            accessibilityRole="button"
            accessibilityLabel={s}
            onPress={() => void run(s)}
            style={styles.chip}
          >
            <Text style={styles.chipText}>{s}</Text>
          </Touchable>
        ))}
      </View>

      <View style={styles.recentHeader}>
        <Text style={styles.recentLabel}>RECENT COMMANDS</Text>
        {recent.length > 0 ? (
          <Touchable testID="commands-clear" accessibilityRole="button" accessibilityLabel="Clear" onPress={clearRecent} hitSlop={10} sink={0}>
            <Text style={[styles.clear, { color: accent }]}>Clear</Text>
          </Touchable>
        ) : null}
      </View>

      {recent.length === 0 ? (
        <EmptyState
          testID="commands-empty"
          text="No commands yet"
          hint="Type one above, or start with a suggestion."
        />
      ) : (
        recent.map((c) => (
          <Touchable
            key={c}
            testID={`recent-${c}`}
            accessibilityRole="button"
            accessibilityLabel={c}
            onPress={() => void run(c)}
            style={styles.row}
          >
            <Text style={styles.rowText}>{c}</Text>
            <Ionicons name="chevron-forward" size={16} color={COLOR.dim} />
          </Touchable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.md },
  chip: {
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    backgroundColor: COLOR.blueDim,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  chipText: { ...TYPE.dataLabel, fontSize: 11, color: COLOR.white },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACE.xl,
    marginBottom: SPACE.sm,
  },
  recentLabel: { ...TYPE.dataLabel, color: COLOR.dim, letterSpacing: 1.5 },
  clear: { ...TYPE.dataLabel, fontSize: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLOR.panel,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md + 2,
    marginBottom: SPACE.sm,
    minHeight: 48,
  },
  rowText: { ...TYPE.dataValue, color: COLOR.white },
});
