import { StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, SectionLabel } from '../components/ui/Atoms';
import { ScreenTitle } from '../components/ui/ScreenTitle';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { COLOR, RADIUS, SPACE, TYPE } from '../theme/tokens';
import { useJarvis } from '../state/JarvisProvider';
import type { CommandsStackParams } from '../navigation/types';

type Props = NativeStackScreenProps<CommandsStackParams, 'CommandResult'>;

/** the three dots and the host line that make a terminal read as a terminal */
function TerminalChrome({ host }: { host: string }) {
  return (
    <View style={styles.chrome}>
      <View style={styles.dots}>
        <View style={[styles.dot, { backgroundColor: COLOR.red }]} />
        <View style={[styles.dot, { backgroundColor: COLOR.gold }]} />
        <View style={[styles.dot, { backgroundColor: COLOR.green }]} />
      </View>
      <Text style={styles.host}>{host}</Text>
    </View>
  );
}

export function CommandResultScreen({ route }: Props) {
  const { command, output } = route.params;
  const nav = useNavigation<NativeStackNavigationProp<CommandsStackParams>>();
  const { sendCommand, connected } = useJarvis();
  const toast = useToast();

  const copy = async () => {
    await Clipboard.setStringAsync(output);
    toast.show('Output copied', 'good');
  };

  const again = () => {
    void sendCommand(command).catch(() => {});
    toast.show(connected ? `Sent “${command}”` : 'No link — command queued', connected ? 'good' : 'bad');
    nav.setParams({ command, output });
  };

  return (
    <Screen testID="command-result-screen">
      <ScreenTitle title="RESULT" />

      <SectionLabel>Command</SectionLabel>
      <View style={styles.echo}>
        <Text testID="result-command" style={styles.command}>
          {command}
        </Text>
      </View>

      <SectionLabel>Output</SectionLabel>
      <View style={styles.terminal}>
        <TerminalChrome host="jarvis@desktop" />
        <View style={styles.body}>
          <Text style={styles.prompt}>{`> ${command}`}</Text>
          <Text testID="result-output" style={styles.output}>
            {output}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Button testID="result-copy" label="COPY" variant="ghost" onPress={() => void copy()} style={styles.action} />
        <Button testID="result-again" label="RUN AGAIN" onPress={again} style={styles.action} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  echo: {
    backgroundColor: COLOR.panel,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  command: { ...TYPE.dataValue, color: COLOR.white },
  terminal: {
    backgroundColor: 'rgba(3,10,24,0.94)',
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    overflow: 'hidden',
  },
  chrome: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLOR.line,
  },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  host: { ...TYPE.meta, fontSize: 11, color: COLOR.dim },
  body: { padding: SPACE.lg, gap: SPACE.sm },
  prompt: { ...TYPE.meta, fontSize: 12, color: COLOR.white },
  output: { ...TYPE.meta, fontSize: 12, lineHeight: 19, color: COLOR.green },
  actions: { flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.xl },
  action: { flex: 1 },
});
