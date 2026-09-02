import { useCallback, useState } from 'react';
import { Pressable, ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { factCandidates } from '../lib/journal/candidates';
import type { Candidate } from '../lib/journal/candidates';
import { decidedIds } from '../lib/journal/candidateStore';
import { dismissFact, keepFact } from '../lib/journal/decide';
import { factId } from '../lib/journal/candidates';
import { staleFacts } from '../lib/journal/stale';
import type { Stale } from '../lib/journal/stale';
import { forgetOne, keepAnyway } from '../lib/journal/tidy';
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
  const { api, pairing, hud } = useJarvis();
  const toast = useToast();

  const [facts, setFacts] = useState<string[]>([]);
  const [persistent, setPersistent] = useState(true);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  /**
   * Sentences he would remember if you let him.
   *
   * Read from the chat log this screen can already see, filtered by `factCandidates`,
   * and never stored by the reading. The harvest happens here rather than in the chat
   * screen for a reason worth keeping: a turn becomes a candidate while it is still in
   * the log, so `CHAT_CAP` drops a sentence that has already been offered instead of
   * one nobody ever saw.
   */
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const readCandidates = useCallback(async () => {
    const decided = await decidedIds();
    setCandidates(factCandidates(hud.chat, Date.now(), decided));
  }, [hud.chat]);

  /**
   * Send one, or refuse one. The deciding itself lives in `journal/decide`.
   *
   * Both answers are a line here on purpose: the promise this feature makes — nothing
   * reaches the gateway until it is ticked — is testable there and, on this screen,
   * not testable at all. The harness cannot render this component without tripping an
   * invalid hook call in the navigation mock, so logic that matters does not live in
   * it.
   */
  const keep = async (c: Candidate) => {
    setBusy(true);
    const out = await keepFact(c, { remember: api.remember });
    setBusy(false);
    if (!out.ok) {
      haptic.bad();
      toast.show(out.why, 'bad');
      return;
    }
    setFacts(out.facts);
    setPersistent(out.stored);
    setCandidates((held) => held.filter((x) => x.id !== c.id));
    haptic.good();
    toast.show(
      out.stored ? 'Remembered' : 'Held for now — the brain has no database',
      out.stored ? 'good' : 'bad'
    );
  };

  const ignore = async (c: Candidate) => {
    await dismissFact(c);
    setCandidates((held) => held.filter((x) => x.id !== c.id));
    haptic.tap();
  };

  /**
   * Facts he would offer to forget, with the reason beside each.
   *
   * Recomputed whenever the fact list changes rather than stored: the offer is a view
   * of what is held, and a stored copy would go stale the moment anything else edited
   * memory.
   */
  const [held, setHeld] = useState<string[]>([]);
  const stale = staleFacts(facts).filter((s) => !held.includes(`keep:${factId(s.fact)}`));

  const dropStale = async (s: Stale) => {
    setBusy(true);
    const out = await forgetOne(s, { forget: api.forget });
    setBusy(false);
    if (!out.ok) {
      haptic.bad();
      toast.show(out.why, 'bad');
      return;
    }
    setFacts(out.facts);
    haptic.good();
    toast.show('Forgotten');
  };

  /** keep it, and stop offering it: the answer was no */
  const hold = async (s: Stale) => {
    await keepAnyway(s);
    setHeld((was) => [...was, `keep:${factId(s.fact)}`]);
    haptic.tap();
  };

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
      void readCandidates();
    }, [load, readCandidates])
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

      {/**
       * What he noticed you say, offered rather than kept.
       *
       * **Nothing here has been stored.** The decision behind this section, taken on
       * 2026-09-02, was not *he decides quietly* — which needs a model reading every
       * sentence and a great deal of trust — but *he proposes, you approve*. So a
       * candidate is a sentence with a tick next to it, and the only thing that ever
       * reaches the gateway is one you ticked.
       *
       * Dismissing is as permanent as keeping. Both are answers, and an offer that
       * comes back after a no is nagging.
       */}
      {candidates.length ? (
        <>
          <SectionLabel>He noticed you said</SectionLabel>
          <View style={styles.group}>
            {candidates.map((c, i) => (
              <View
                key={c.id}
                style={[styles.row, i === candidates.length - 1 ? styles.lastRow : null]}
              >
                <Ionicons name="ellipse-outline" size={17} color={COLOR.dim} style={styles.bullet} />
                <Text style={styles.fact}>{c.text}</Text>
                <Pressable
                  testID={`candidate-keep-${c.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Remember: ${c.text}`}
                  hitSlop={8}
                  disabled={busy}
                  onPress={() => void keep(c)}
                  style={({ pressed }) => (pressed ? styles.pressed : undefined)}
                >
                  <Text style={[styles.action, { color: accent }]}>KEEP</Text>
                </Pressable>
                <Pressable
                  testID={`candidate-drop-${c.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Do not remember: ${c.text}`}
                  hitSlop={8}
                  disabled={busy}
                  onPress={() => void ignore(c)}
                  style={({ pressed }) => (pressed ? styles.pressed : undefined)}
                >
                  <Ionicons name="close" size={18} color={COLOR.dim} />
                </Pressable>
              </View>
            ))}
          </View>
          <Hint testID="candidates-hint">
            He has not kept any of these. Nothing leaves the phone until you say so.
          </Hint>
        </>
      ) : null}

      {/**
       * Facts he would rather not be carrying, offered up.
       *
       * *"all that i tell him will go to the memory ?? thats not feasable"* — nineteen
       * facts by 2026-09-02, several of them a question asked once or a place he was
       * standing an hour ago, and the hint at the bottom of this screen says the cost:
       * every one of them rides along on every reply.
       *
       * **Nothing is deleted until it is ticked**, and KEEP is a permanent answer the
       * same way ✕ is on the other section.
       */}
      {stale.length ? (
        <>
          <SectionLabel>Worth forgetting</SectionLabel>
          <View style={styles.group}>
            {stale.map((s, i) => (
              <View
                key={s.fact}
                style={[styles.row, i === stale.length - 1 ? styles.lastRow : null]}
              >
                <Ionicons name="trash-outline" size={17} color={COLOR.dim} style={styles.bullet} />
                <View style={styles.rowText}>
                  <Text style={styles.fact}>{s.fact}</Text>
                  <Text style={styles.why}>{s.why}</Text>
                </View>
                <Pressable
                  testID={`stale-forget-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Forget: ${s.fact}`}
                  hitSlop={8}
                  disabled={busy}
                  onPress={() => void dropStale(s)}
                  style={({ pressed }) => (pressed ? styles.pressed : undefined)}
                >
                  <Text style={[styles.action, { color: accent }]}>FORGET</Text>
                </Pressable>
                <Pressable
                  testID={`stale-keep-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Keep: ${s.fact}`}
                  hitSlop={8}
                  disabled={busy}
                  onPress={() => void hold(s)}
                  style={({ pressed }) => (pressed ? styles.pressed : undefined)}
                >
                  <Ionicons name="close" size={18} color={COLOR.dim} />
                </Pressable>
              </View>
            ))}
          </View>
        </>
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
  // KEEP sits beside the dismiss cross, so it reads as the pair of answers it is
  // the fact and its reason stack, so the reason reads as a caption and not a second fact
  rowText: { flex: 1, gap: 2 },
  why: { ...TYPE.meta, fontSize: 11, color: COLOR.dim, lineHeight: 15 },
  /**
   * Pressed feedback, and the reason these are `Pressable` at all.
   *
   * `Touchable` is an animated `Pressable` and **synthetic input does not reach it** —
   * measured again on 2026-09-02, when FORGET took three taps from a laptop and did
   * nothing each time while the same tap on a plain control worked. Every offer here
   * is meant to be checkable from a laptop, so none of them is animated.
   */
  pressed: { opacity: 0.55 },
  action: { ...TYPE.meta, fontSize: 11, letterSpacing: 1, marginRight: SPACE.md },
  add: { marginTop: SPACE.md },
});
