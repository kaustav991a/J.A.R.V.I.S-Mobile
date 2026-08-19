import { useCallback, useEffect, useRef, useState } from 'react';
import { Hint, MonoCard, Screen, SectionLabel } from '../components/ui/Atoms';
import { Card, InfoRow } from '../components/ui/Card';
import { ScreenTitle } from '../components/ui/ScreenTitle';
import { SettingsRow } from '../components/ui/SettingsRow';
import { COLOR } from '../theme/tokens';
import { say, summarise } from '../lib/journal/digest';
import type { Reading } from '../lib/journal/digest';
import { androidSource, dayKey } from '../lib/journal/source';
import { openJournal } from '../lib/journal/store';
import type { Journal } from '../lib/journal/store';
import { syncUsage } from '../lib/journal/sync';

/**
 * What the journal has actually collected.
 *
 * This screen exists so the collector is inspectable on the device rather than
 * on faith. Without it, a revoked permission looks exactly like a quiet day —
 * and this project has already spent an evening proving that a silent briefing
 * was correct rather than broken.
 */
export function JournalScreen() {
  const [reading, setReading] = useState<Reading>({ state: 'empty' });
  const [held, setHeld] = useState<{ events: number; daily: number }>({ events: 0, daily: 0 });
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  /** opened once and kept, so a sync does not reopen the file each time */
  const journal = useRef<Journal | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      journal.current = journal.current ?? (await openJournal());
      const j = journal.current;
      const outcome = await syncUsage(j, androidSource, Date.now());

      setHeld(await j.size());
      setNames(await j.allLabels());

      // The sync's own verdict decides what is said, not the rows that came
      // back. A denied read and an empty day both produce no rows, and calling
      // the first one a quiet day is the bug this screen exists to make
      // impossible.
      if (outcome.state === 'denied') {
        setReading({ state: 'denied' });
        return;
      }
      if (outcome.state === 'error') {
        setReading({ state: 'error', problem: outcome.problem });
        return;
      }

      const today = dayKey(Date.now());
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      setReading(summarise(await j.dailyFor(today), await j.eventsBetween(midnight.getTime(), Date.now())));
    } catch (e) {
      setReading({ state: 'error', problem: e instanceof Error ? e.message : 'unknown' });
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const denied = reading.state === 'denied';

  return (
    <Screen testID="journal-screen" refreshing={busy} onRefresh={refresh}>
      <ScreenTitle title="JOURNAL" caption={denied ? 'NO ACCESS' : 'ON THIS PHONE'} back />

      <SectionLabel>Today</SectionLabel>
      <MonoCard testID="journal-digest" text={say(reading, names)} />

      <SectionLabel>Held on this device</SectionLabel>
      <Card testID="journal-held">
        <InfoRow first icon="pulse-outline" label="Moments" value={String(held.events)} />
        <InfoRow icon="calendar-outline" label="Day totals" value={String(held.daily)} />
        <InfoRow
          icon="lock-closed-outline"
          label="Leaves the phone"
          value="Never"
          valueColor={COLOR.green}
        />
      </Card>
      <Hint testID="journal-size">{`${held.events} moments and ${held.daily} day totals, all of it on this phone.`}</Hint>

      <SectionLabel>Collection</SectionLabel>
      {denied ? (
        <SettingsRow
          testID="journal-grant"
          icon="key-outline"
          title="Grant usage access"
          subtitle="Opens Android's Usage access list. J.A.R.V.I.S. cannot see anything until this is on."
          onPress={() => void androidSource.openSettings()}
          last
        />
      ) : (
        <SettingsRow
          testID="journal-sync"
          icon="refresh-outline"
          title="Sync now"
          subtitle="Reads what Android has already recorded. Nothing is collected here."
          onPress={() => void refresh()}
          last
        />
      )}

      <Hint>
        Android records this whether anything asks or not — the journal only reads what is already there, which is why it
        costs no battery of its own. It syncs when the app opens and alongside the morning briefing.
      </Hint>
    </Screen>
  );
}
