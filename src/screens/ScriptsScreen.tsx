import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen, EmptyState } from '../components/ui/Atoms';
import { ListCard, RunButton } from '../components/ui/ListCard';
import { SCRIPTS } from '../data/fixtures';
import { useJarvis } from '../state/JarvisProvider';
import type { ScriptsStackParams } from '../navigation/types';

export function ScriptsScreen() {
  const nav = useNavigation<NativeStackNavigationProp<ScriptsStackParams>>();
  const { sendCommand } = useJarvis();

  const run = (name: string) => {
    // running a script is just a command the backend already understands
    void sendCommand(`run script ${name}`).catch(() => {});
  };

  return (
    <Screen testID="scripts-screen">
      {SCRIPTS.length === 0 ? (
        <EmptyState text="No scripts yet." />
      ) : (
        SCRIPTS.map((s) => (
          <ListCard
            key={s.id}
            testID={`script-${s.id}`}
            icon="document-text-outline"
            title={s.name}
            subtitle={`Last run: ${s.lastRun}`}
            onPress={() => nav.navigate('ScriptDetails', { id: s.id })}
            trailing={<RunButton testID={`script-${s.id}-run`} onPress={() => run(s.name)} />}
          />
        ))
      )}
    </Screen>
  );
}
