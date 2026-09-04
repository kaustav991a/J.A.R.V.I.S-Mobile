import { useCallback, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Hint, Screen, SectionLabel } from '../components/ui/Atoms';
import { ScreenTitle } from '../components/ui/ScreenTitle';
import { useToast } from '../components/ui/Toast';
import { COLOR, SPACE, TYPE } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';
import { importVisits, previewFile } from '../lib/archiveImport';
import type { Preview } from '../lib/archiveImport';
import { available, parse } from '../../modules/timeline-import';
import { haptic } from '../lib/haptics';

/**
 * Seventeen months of history, if he wants it.
 *
 * Every habit figure this app quotes rests on a fortnight. `usuallyHereBy` had four
 * app-opens behind it and said *"usually you are there by 11:51 AM"* about a man at his
 * desk by ten; the export says **09:49 across 344 days**. One import makes the figures
 * true on the day it lands rather than after a month of waiting.
 *
 * **Nothing is written until he says so.** The file is read, matched against the places
 * he has named, and described — and the preview holds counts rather than the store
 * holding rows. Same shape as the memory candidates and the tidy pass, for the same
 * reason: a machine that helps itself to a year of your movements because it found a
 * file is not the machine this is meant to be.
 *
 * **The file never leaves the phone and is never copied into the app.** Same rule as
 * the call log: the phone already holds it, and a second copy is a second thing to
 * secure. `copyToCacheDirectory: false` is what enforces that, not a comment.
 */
export function ImportScreen() {
  const { accent } = useAppearance();
  const toast = useToast();

  const [busy, setBusy] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const pick = useCallback(async () => {
    setBusy(true);
    setDone(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        // false, deliberately: `true` copies 47 MB into the app's cache, which is
        // exactly the second copy this feature promises not to make
        copyToCacheDirectory: false,
      });
      if (picked.canceled || !picked.assets?.length) return;
      const file = picked.assets[0];
      setName(file.name);
      setUri(file.uri);
      setPreview(await previewFile(file.uri));
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'That file could not be read', 'bad');
    } finally {
      setBusy(false);
    }
  }, [toast]);

  /**
   * Read the file a second time rather than keeping four thousand visits in React state.
   *
   * The preview carries counts, so a re-render never walks the visits. Parsing again
   * costs a few seconds of Kotlin and keeps the app's memory flat, which is the trade
   * this whole feature is built on.
   */
  const confirm = useCallback(async () => {
    if (!uri) return;
    setBusy(true);
    try {
      haptic.tap();
      const { visits } = await parse(uri);
      const rows = await importVisits(visits);
      setDone(rows);
      toast.show(rows ? `${rows} sightings added` : 'Nothing new to add', rows ? 'good' : 'bad');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'That import did not finish', 'bad');
    } finally {
      setBusy(false);
    }
  }, [uri, toast]);

  return (
    <Screen>
      <ScreenTitle title="IMPORT" caption={preview ? `${preview.visits.toLocaleString()} VISITS` : undefined} />

      <Hint testID="import-how">
        Settings → Location → Location Services → Timeline → Export Timeline data writes
        a file to Downloads. Nothing leaves this phone, and the file is not copied into
        the app.
      </Hint>

      {available() ? (
        <Pressable
          testID="import-pick"
          onPress={pick}
          disabled={busy}
          style={({ pressed }) => [
            styles.action,
            { borderColor: accent },
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={[styles.actionText, { color: accent }]}>
            {name ? 'CHOOSE ANOTHER FILE' : 'CHOOSE A FILE'}
          </Text>
        </Pressable>
      ) : (
        <Hint testID="import-unavailable">
          This build cannot read an export yet — the parser arrives with an installed
          build, not over the air.
        </Hint>
      )}

      {busy ? (
        <View style={styles.centre}>
          <ActivityIndicator color={accent} />
        </View>
      ) : null}

      {preview ? <PreviewBlock name={name} preview={preview} /> : null}

      {preview && preview.places.length > 0 && done === null && !busy ? (
        <Pressable
          testID="import-confirm"
          onPress={confirm}
          style={({ pressed }) => [
            styles.action,
            { borderColor: accent },
            pressed ? styles.pressed : null,
          ]}
        >
          <Text style={[styles.actionText, { color: accent }]}>IMPORT</Text>
        </Pressable>
      ) : null}

      {done !== null ? (
        <Hint testID="import-done">
          {done
            ? `${done} sightings added. Places → Crossings recorded says what is held, and FORGET there takes all of it back.`
            : 'Nothing new to add — every visit in that file was already recorded.'}
        </Hint>
      ) : null}
    </Screen>
  );
}

/**
 * What importing this file would do, in numbers he can disagree with.
 *
 * **Days, not visits, is the figure that matters.** Four visits across three days is
 * three days of evidence, and a count of visits reads as more history than there is.
 * Both are shown, because the honest sentence needs both.
 */
function PreviewBlock({ name, preview }: { name: string | null; preview: Preview }) {
  const span = preview.range
    ? `${date(preview.range.from)} to ${date(preview.range.to)}`
    : 'no dated visits';
  const shown = preview.clusters.slice(0, 6);

  return (
    <>
      <SectionLabel>What that file holds</SectionLabel>
      <View style={styles.group}>
        <Text style={[styles.line, styles.lastLine]} testID="import-file">
          {name ?? 'the file'} · {preview.segments.toLocaleString()} segments ·{' '}
          {preview.visits.toLocaleString()} visits · {span}
        </Text>
      </View>

      {preview.error ? (
        /**
         * The reason, verbatim, above everything else.
         *
         * *The file held nothing* and *the parser gave up* must never look the same.
         * The Journal read **Readable · 0 calls · 0 people** on a phone holding 22,165
         * call log rows because a caught exception became an empty list, and that
         * afternoon is why this line exists.
         */
        <Hint testID="import-error">Could not read it: {preview.error}</Hint>
      ) : null}

      {!preview.error && preview.segments > 0 && preview.visits === 0 ? (
        <Hint testID="import-shape">
          {preview.segments.toLocaleString()} segments and no visits — Google has changed
          the format. Nothing here can be imported until the parser is taught the new
          shape.
        </Hint>
      ) : null}

      {preview.places.length > 0 ? (
        <>
          <SectionLabel>Would be added</SectionLabel>
          <View style={styles.group}>
            {preview.places.map((p, i) => (
              <Text
                key={p.place}
                testID={`import-place-${p.place}`}
                style={[styles.line, i === preview.places.length - 1 ? styles.lastLine : null]}
              >
                {p.place} · {p.visits.toLocaleString()} visits · {p.days} days
                {p.hour === null ? '' : ` · usually arrives ${clock(p.hour)}`}
              </Text>
            ))}
          </View>
        </>
      ) : preview.visits > 0 && !preview.error ? (
        <Hint testID="import-none-named">
          None of those visits is inside a place you have named, so there is nothing to
          add yet. Name a place on Places first — a visit only ever becomes a sighting
          inside a circle you named yourself.
        </Hint>
      ) : null}

      {shown.length > 0 ? (
        <>
          <SectionLabel>Places you have never named</SectionLabel>
          <View style={styles.group}>
            {shown.map((c, i) => (
              <Text
                key={`${c.lat},${c.lon}`}
                style={[styles.line, i === shown.length - 1 ? styles.lastLine : null]}
              >
                {c.hint === 'home' ? 'Looks like your home · ' : ''}
                {c.hint === 'work' ? 'Looks like your work · ' : ''}
                {c.visits.toLocaleString()} visits · {c.days} days · usually {clock(c.hour)}
              </Text>
            ))}
          </View>
          <Hint testID="import-clusters-hint">
            Naming one of these is the next thing to build. Nothing here is guessed: the
            names Google inferred are shown as a hint and never used as a label, and
            looking the rest up would mean sending these places to Google.
          </Hint>
        </>
      ) : null}
    </>
  );
}

const clock = (minute: number): string => {
  const h = Math.floor(minute / 60);
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(minute % 60).padStart(2, '0')} ${suffix}`;
};

const date = (at: number): string =>
  new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const styles = StyleSheet.create({
  centre: { paddingVertical: SPACE.xl, alignItems: 'center' },
  group: {
    backgroundColor: COLOR.panel,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    overflow: 'hidden',
  },
  line: {
    ...TYPE.meta,
    fontSize: 13,
    lineHeight: 19,
    color: COLOR.white,
    padding: SPACE.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLOR.line,
  },
  lastLine: { borderBottomWidth: 0 },
  /**
   * `Pressable`, never `Touchable`.
   *
   * The animated wrapper does not receive `adb shell input tap`, so anything that has
   * to be verified from a laptop is a plain `Pressable`. It cost three taps and an
   * afternoon on the FORGET button in Memory.
   */
  action: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingVertical: SPACE.lg,
    alignItems: 'center',
  },
  pressed: { opacity: 0.6 },
  actionText: { ...TYPE.meta, fontSize: 12, letterSpacing: 1.5 },
});
