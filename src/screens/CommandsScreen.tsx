import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen, EmptyState } from '../components/ui/Atoms';
import { CommandBar } from '../components/CommandBar';
import { COLOR, SPACE, TYPE } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';
import { useJarvis } from '../state/JarvisProvider';
import { SAMPLE_RESULT } from '../data/fixtures';
import type { CommandsStackParams } from '../navigation/types';

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
      <CommandBar
        placeholder="Enter command…"
        onSubmit={(text) => void run(text)}
        onVoice={() => {}}
        disabled={false}
      />

      <View style={styles.recentHeader}>
        <Text style={styles.recentLabel}>RECENT COMMANDS</Text>
        <Pressable testID="commands-clear" accessibilityRole="button" onPress={clearRecent} hitSlop={8}>
          <Text style={[styles.clear, { color: accent }]}>Clear</Text>
        </Pressable>
      </View>

      {recent.length === 0 ? (
        <EmptyState testID="commands-empty" text="Nothing sent from this device yet." />
      ) : (
        recent.map((c) => (
          <Pressable
            key={c}
            testID={`recent-${c}`}
            accessibilityRole="button"
            accessibilityLabel={c}
            onPress={() => void run(c)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Text style={styles.rowText}>{c}</Text>
            <Ionicons name="chevron-forward" size={16} color={COLOR.dim} />
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md + 2,
    marginBottom: SPACE.sm,
  },
  pressed: { opacity: 0.7 },
  rowText: { ...TYPE.dataValue, color: COLOR.white },
});
