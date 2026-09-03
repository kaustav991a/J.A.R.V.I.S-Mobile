import { useCallback, useEffect, useRef, useState } from 'react';
import { Hint, MonoCard, Screen, SectionLabel } from '../components/ui/Atoms';
import { callSummary } from '../lib/calls';
import { permission as callPermission, readError, recentCalls } from '../../modules/call-log';
import { Card, InfoRow } from '../components/ui/Card';
import { ScreenTitle } from '../components/ui/ScreenTitle';
import { SettingsRow } from '../components/ui/SettingsRow';
import { COLOR } from '../theme/tokens';
import { say, summarise, syncLine } from '../lib/journal/digest';
import type { Reading } from '../lib/journal/digest';
import { androidSource, dayKey } from '../lib/journal/source';
import { openJournal } from '../lib/journal/store';
import type { Journal } from '../lib/journal/store';
import { syncUsage } from '../lib/journal/sync';
import type { SyncResult } from '../lib/journal/sync';

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

  /**
   * What the call log returned, read fresh and never stored.
   *
   * Read here rather than remembered anywhere: this is a diagnostic somebody opens to
   * answer one question — did it see anything — and a stored copy of a call log is a
   * second thing to secure for no gain.
   */
  const [callState, setCallState] = useState<'granted' | 'denied' | 'unavailable'>('unavailable');
  const [calls, setCalls] = useState({ calls: 0, people: 0, days: 0 });
  const [callProblem, setCallProblem] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setCallState(callPermission());
    void recentCalls()
      .then((read) => {
        if (!alive) return;
        setCalls(callSummary(read));
        // a read that threw and a phone with no calls are different facts
        setCallProblem(readError());
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  /**
   * What the last sync did, and when.
   *
   * Reported from the device: **Sync now** a minute after the screen had already
   * synced changed no counts, because there was nothing new — and the screen said
   * nothing, so a correct answer and a dead button looked identical. It took a
   * second tap that happened to add five moments to establish the first had
   * worked at all.
   */
  const [last, setLast] = useState<{ result: SyncResult; at: number } | null>(null);
  /** opened once and kept, so a sync does not reopen the file each time */
  const journal = useRef<Journal | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      journal.current = journal.current ?? (await openJournal());
      const j = journal.current;
      const ranAt = Date.now();
      const outcome = await syncUsage(j, androidSource, ranAt);
      setLast({ result: outcome, at: ranAt });

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

      {/**
       * What the call log actually returned.
       *
       * On 2026-09-03 the app spoke about Instagram twice while both call triggers
       * stayed silent, and nothing on screen could tell **a module that had not
       * loaded** from **a call log where nobody is overdue**. Those want completely
       * different fixes and looked identical from outside — which is the failure this
       * project has now shipped five times, in five different costumes.
       */}
      <SectionLabel>Calls</SectionLabel>
      <Card testID="journal-calls">
        <InfoRow
          first
          icon="call-outline"
          label="Call log"
          value={
            callState === 'granted'
              ? 'Readable'
              : callState === 'denied'
                ? 'Permission off'
                : 'Not in this build'
          }
          valueColor={callState === 'granted' ? COLOR.green : COLOR.dim}
        />
        <InfoRow icon="people-outline" label="Calls read" value={String(calls.calls)} />
        <InfoRow icon="person-outline" label="People named" value={String(calls.people)} />
        <InfoRow
          icon="hourglass-outline"
          label="Reaching back"
          value={calls.days ? `${calls.days} days` : '—'}
        />
      </Card>
      {callProblem ? (
        <Hint testID="journal-calls-problem">{`The read failed: ${callProblem}`}</Hint>
      ) : null}
      <Hint testID="journal-calls-hint">
        The number never reaches this app: it is hashed before it leaves the native side, and
        the name is the one Android had already cached against the call. Nothing is stored and
        nothing is uploaded.
      </Hint>

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
        <>
          <SettingsRow
            testID="journal-sync"
            icon="refresh-outline"
            title="Sync now"
            subtitle="Reads what Android has already recorded. Nothing is collected here."
            onPress={() => void refresh()}
          />
          {/* Offered even while access is granted, which is the only time it is
              hard to find: the grant lives several levels into Settings, under a
              different name on every skin, and the one moment you want to reach
              it — to switch it off and see what this screen says — is the one
              moment the button above would not be here. */}
          <SettingsRow
            testID="journal-access"
            icon="key-outline"
            title="Usage access"
            subtitle="Opens Android's list, where this can be switched off again"
            onPress={() => void androidSource.openSettings()}
            last
          />
        </>
      )}
      {/* always rendered, including when nothing changed: a sync that found
          nothing is an answer, and it has to look like one */}
      <Hint testID="journal-last">{busy ? 'Reading…' : syncLine(last?.result ?? null, last?.at ?? null)}</Hint>

      <Hint>
        Android records this whether anything asks or not — the journal only reads what is already there, which is why it
        costs no battery of its own. It syncs when the app opens and alongside the morning briefing.
      </Hint>
    </Screen>
  );
}
