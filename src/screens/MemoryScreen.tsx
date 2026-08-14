import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Hint, Screen, SectionLabel } from '../components/ui/Atoms';
import { ScreenTitle } from '../components/ui/ScreenTitle';
import { Button } from '../components/ui/Button';
import { Touchable } from '../components/ui/Touchable';
import { useToast } from '../components/ui/Toast';
import { COLOR, SPACE, TYPE } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';
import { useJarvis } from '../state/JarvisProvider';
import { haptic } from '../lib/haptics';

/**
 * What J.A.R.V.I.S. holds as true about him — visible, and changeable.
 *
 * These are not chat history. A conversation scrolls away after a dozen messages;
 * these go into the system prompt on *every* turn, which is what let him ask about
 * his dog and be answered about his dog. That power is also why the screen exists:
 * the store already holds his address, his family and his plans, and until now the
 * only way to see or correct any of it was an authenticated POST from a laptop.
 *
 * A memory you cannot inspect is a memory you cannot trust. If it ever records
 * something wrong — and it records things by itself, from what he says — he has to
 * be able to find that and delete it without anyone's help.
 */
export function MemoryScreen() {
  const { accent } = useAppearance();
  const { api, pairing } = useJarvis();
  const toast = useToast();

  const [facts, setFacts] = useState<string[]>([]);
  const [persistent, setPersistent] = useState(true);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const out = await api.facts();
      setFacts(out.facts);
      setPersistent(out.persistent);
      setProblem(null);
    } catch (e) {
      // named rather than swallowed: "no gateway configured" and "the gateway
      // refused the token" want different actions from him, and an empty list
      // would imply it has simply forgotten everything
      setProblem(e instanceof Error ? e.message : 'could not reach the brain');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const add = async () => {
    const said = draft.trim();
    if (!said) return;
    setBusy(true);
    try {
      const out = await api.remember(said);
      setFacts(out.facts);
      setPersistent(out.persistent);
      setDraft('');
      haptic.good();
      // `stored` false means it is only in the gateway's memory — true until the
      // next restart, which is not what "remember" means to a person
      toast.show(out.stored ? 'Remembered' : 'Held for now — the brain has no database', out.stored ? 'good' : 'bad');
    } catch (e) {
      haptic.bad();
      toast.show(e instanceof Error ? e.message : 'Could not save that', 'bad');
    } finally {
      setBusy(false);
    }
  };

  const drop = async (fact: string) => {
    setBusy(true);
    try {
      const out = await api.forget(fact);
      setFacts(out.facts);
      toast.show('Forgotten');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Could not forget that', 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen testID="memory-screen" liftOnKeyboard>
      <ScreenTitle title="MEMORY" caption={facts.length ? `${facts.length} KNOWN` : undefined} />

      {!pairing.hasToken ? (
        <Hint testID="memory-unpaired">
          The brain refuses these without a pairing token, since anything written here is
          treated as true about you on every turn. Set one on the Connection screen.
        </Hint>
      ) : null}

      <SectionLabel>What he knows about you</SectionLabel>

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={accent} />
        </View>
      ) : problem ? (
        <Hint testID="memory-problem">Could not read it: {problem}</Hint>
      ) : facts.length === 0 ? (
        <Hint testID="memory-empty">
          Nothing yet. Add something below, or just tell him in the chat — he records
          lasting things himself.
        </Hint>
      ) : (
        <View style={styles.group}>
          {facts.map((fact, i) => (
            <View key={fact} style={[styles.row, i === facts.length - 1 ? styles.lastRow : null]}>
              <Ionicons name="bookmark-outline" size={17} color={accent} style={styles.bullet} />
              <Text style={styles.fact}>{fact}</Text>
              <Touchable
                testID={`memory-forget-${i}`}
                accessibilityRole="button"
                accessibilityLabel={`Forget: ${fact}`}
                hitSlop={8}
                disabled={busy}
                onPress={() => void drop(fact)}
              >
                <Ionicons name="close" size={18} color={COLOR.dim} />
              </Touchable>
            </View>
          ))}
        </View>
      )}

      <SectionLabel>Tell him something</SectionLabel>
      <TextInput
        testID="memory-input"
        style={styles.input}
        value={draft}
        onChangeText={setDraft}
        placeholder="I take my coffee without sugar"
        placeholderTextColor={COLOR.dim}
        multiline
      />
      <Button
        testID="memory-add"
        label="REMEMBER THIS"
        busy={busy}
        disabled={!draft.trim()}
        onPress={() => void add()}
        style={styles.add}
      />

      <Hint testID="memory-hint">
        {persistent
          ? 'These go to him with every message, and survive restarts. Keep them few and true — each one costs a little of every reply.'
          : 'The brain has no database attached, so anything here is forgotten when it restarts. Set DATABASE_URL on the gateway to make it stick.'}
      </Hint>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centre: { paddingVertical: SPACE.xl, alignItems: 'center' },
  group: {
    backgroundColor: COLOR.panel,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.md,
    padding: SPACE.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLOR.line,
  },
  lastRow: { borderBottomWidth: 0 },
  bullet: { marginTop: 1 },
  fact: { ...TYPE.meta, fontSize: 13, lineHeight: 19, color: COLOR.white, flex: 1 },
  input: {
    ...TYPE.meta,
    fontSize: 13,
    color: COLOR.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.dim,
    borderRadius: 10,
    paddingHorizontal: SPACE.md,
    paddingTop: SPACE.md,
    paddingBottom: SPACE.md,
    minHeight: 76,
    textAlignVertical: 'top',
  },
  add: { marginTop: SPACE.md },
});
