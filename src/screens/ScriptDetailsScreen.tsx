import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen, Badge, SectionLabel } from '../components/ui/Atoms';
import { Button } from '../components/ui/Button';
import { COLOR, SPACE, TYPE } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';
import { SCRIPTS } from '../data/fixtures';
import { useJarvis } from '../state/JarvisProvider';
import type { ScriptsStackParams } from '../navigation/types';

const OUTCOME: Record<string, { label: string; tint: string }> = {
  success: { label: 'Success', tint: COLOR.green },
  failed: { label: 'Failed', tint: COLOR.red },
  never: { label: 'Never run', tint: COLOR.dim },
};

type Props = NativeStackScreenProps<ScriptsStackParams, 'ScriptDetails'>;

export function ScriptDetailsScreen({ route }: Props) {
  const { accent } = useAppearance();
  const { sendCommand } = useJarvis();
  const script = SCRIPTS.find((s) => s.id === route.params.id);

  if (!script) {
    return (
      <Screen testID="script-details-screen">
        <Text style={styles.missing}>That script no longer exists.</Text>
      </Screen>
    );
  }

  const outcome = OUTCOME[script.outcome] ?? OUTCOME.never;

  return (
    <Screen testID="script-details-screen">
      <View style={styles.header}>
        <View style={[styles.tile, { backgroundColor: COLOR.blueDim }]}>
          <Ionicons name="document-text-outline" size={28} color={accent} />
        </View>
        <Text testID="script-name" style={styles.name}>
          {script.name}
        </Text>
        <Text style={styles.lastRun}>{`Last run: ${script.lastRun}`}</Text>
        <Badge testID="script-outcome" label={outcome.label} tint={outcome.tint} />
      </View>

      <SectionLabel>Description</SectionLabel>
      <Text testID="script-description" style={styles.description}>
        {script.description}
      </Text>

      <SectionLabel>Actions</SectionLabel>
      <Button
        testID="script-run"
        label="RUN SCRIPT"
        onPress={() => void sendCommand(`run script ${script.name}`).catch(() => {})}
      />
      <Button testID="script-edit" label="EDIT SCRIPT" variant="ghost" style={styles.edit} />
      <Text style={styles.note}>Editing needs a script endpoint the desk backend does not expose yet.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    backgroundColor: COLOR.panel,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    paddingVertical: SPACE.xl,
    paddingHorizontal: SPACE.lg,
    gap: SPACE.sm,
  },
  tile: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  name: { ...TYPE.dataValue, fontSize: 18, color: COLOR.white, marginTop: SPACE.xs },
  lastRun: { ...TYPE.dataLabel, color: COLOR.dim },
  description: { ...TYPE.meta, color: COLOR.dim },
  edit: { marginTop: SPACE.md },
  note: { ...TYPE.dataLabel, color: COLOR.dim, opacity: 0.7, marginTop: SPACE.md, textAlign: 'center' },
  missing: { ...TYPE.meta, color: COLOR.dim, textAlign: 'center', marginTop: SPACE.xl },
});
