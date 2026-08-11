import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { EmptyState, Screen } from '../components/ui/Atoms';
import { ScreenTitle } from '../components/ui/ScreenTitle';
import { ListCard, RunButton } from '../components/ui/ListCard';
import { useToast } from '../components/ui/Toast';
import { COLOR } from '../theme/tokens';
import { ACCENTS } from '../theme/appearance';
import { SCRIPTS } from '../data/fixtures';
import { useJarvis } from '../state/JarvisProvider';
import type { ScriptsStackParams } from '../navigation/types';

const OUTCOME_TINT: Record<string, string> = {
  success: COLOR.green,
  failed: COLOR.red,
  never: COLOR.dim,
};

/** the icon tile takes a hue per script, so a list of five reads as five */
const TILE_TINT = [COLOR.blue, ACCENTS.violet, COLOR.red, COLOR.green, COLOR.gold];

export function ScriptsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<ScriptsStackParams>>();
  const { sendCommand, connected } = useJarvis();
  const toast = useToast();

  const run = (name: string) => {
    // running a script is just a command the backend already understands
    void sendCommand(`run script ${name}`).catch(() => {});
    // the result lands on the desk, not here, so say the send happened
    toast.show(connected ? `Running ${name}` : `Queued ${name} — no link`, connected ? 'good' : 'bad');
  };

  return (
    <Screen testID="scripts-screen">
      <ScreenTitle title="SCRIPTS" caption={SCRIPTS.length ? `${SCRIPTS.length} saved` : undefined} />
      {SCRIPTS.length === 0 ? (
        <EmptyState
          testID="scripts-empty"
          text="No scripts on this machine"
          hint="Scripts you save on the desk appear here."
        />
      ) : (
        SCRIPTS.map((s, i) => (
          <ListCard
            key={s.id}
            testID={`script-${s.id}`}
            icon="document-text-outline"
            tint={TILE_TINT[i % TILE_TINT.length]}
            title={s.name}
            subtitle={`Last run: ${s.lastRun}`}
            statusTint={OUTCOME_TINT[s.outcome] ?? COLOR.dim}
            onPress={() => nav.navigate('ScriptDetails', { id: s.id })}
            trailing={<RunButton testID={`script-${s.id}-run`} onPress={() => run(s.name)} />}
          />
        ))
      )}
    </Screen>
  );
}
