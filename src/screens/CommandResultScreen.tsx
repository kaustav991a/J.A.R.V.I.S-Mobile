import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, MonoCard } from '../components/ui/Atoms';
import { COLOR, SPACE, TYPE } from '../theme/tokens';
import type { CommandsStackParams } from '../navigation/types';

type Props = NativeStackScreenProps<CommandsStackParams, 'CommandResult'>;

export function CommandResultScreen({ route }: Props) {
  const { command, output } = route.params;

  return (
    <Screen testID="command-result-screen">
      <View style={styles.echo}>
        <Text testID="result-command" style={styles.command}>
          {command}
        </Text>
      </View>
      <MonoCard testID="result-output" text={output} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  echo: {
    backgroundColor: COLOR.panel,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    marginBottom: SPACE.md,
  },
  command: { ...TYPE.dataValue, color: COLOR.white },
});
