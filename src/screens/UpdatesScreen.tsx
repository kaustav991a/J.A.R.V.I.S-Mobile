import { useCallback, useState } from 'react';
import * as Updates from 'expo-updates';
import { Hint, MonoCard, Screen, SectionLabel } from '../components/ui/Atoms';
import { Card, InfoRow } from '../components/ui/Card';
import { ScreenTitle } from '../components/ui/ScreenTitle';
import { SettingsRow } from '../components/ui/SettingsRow';
import { COLOR } from '../theme/tokens';
import Constants from 'expo-constants';
import { describeUpdate, shortId, versionLine } from '../lib/updates';

/**
 * What version is running, and the one button that does the next useful thing.
 *
 * Asked for after an update was published, downloaded in the background, and
 * left no trace anywhere in the app — so there was no way to tell "nothing new"
 * from "it is not working", which is the confusion this project keeps paying
 * for. Every state here names itself.
 *
 * One button, never two. Whatever the state is, exactly one action moves it
 * forward: check, download, or restart. Offering all three at once would make
 * the user work out which applies.
 */
export function UpdatesScreen() {
  const { currentlyRunning, isUpdateAvailable, isUpdatePending, isChecking, isDownloading, checkError, downloadError } =
    Updates.useUpdates();
  /** what is running, in the one form that changes the moment a push lands */
  const version = versionLine(Constants.expoConfig?.version, currentlyRunning?.createdAt ?? null);
  /** a check has completed since this screen opened, so "up to date" can be said */
  const [checked, setChecked] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const reading = describeUpdate({
    enabled: Updates.isEnabled,
    checking: isChecking,
    downloading: isDownloading,
    available: isUpdateAvailable,
    pending: isUpdatePending,
    checked,
    problem: problem ?? checkError?.message ?? downloadError?.message ?? null,
  });

  const act = useCallback(async () => {
    setProblem(null);
    try {
      if (reading.action === 'check') {
        const found = await Updates.checkForUpdateAsync();
        setChecked(true);
        // fetched straight away: having said one exists, making him press a
        // second button to begin is ceremony
        if (found.isAvailable) await Updates.fetchUpdateAsync();
        return;
      }
      if (reading.action === 'download') {
        await Updates.fetchUpdateAsync();
        return;
      }
      if (reading.action === 'restart') {
        // this does not return — the app relaunches on the new bundle
        await Updates.reloadAsync();
      }
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'unknown');
      setChecked(true);
    }
  }, [reading.action]);

  return (
    <Screen testID="updates-screen">
      <ScreenTitle title="UPDATES" caption={Updates.isEnabled ? 'OVER THE AIR' : 'DEVELOPMENT'} back />

      <Hint testID="updates-version">{version}</Hint>

      <SectionLabel>Status</SectionLabel>
      <MonoCard testID="updates-headline" text={reading.headline} />
      <Hint testID="updates-detail">{reading.detail}</Hint>

      {reading.action !== 'none' ? (
        <SettingsRow
          testID="updates-action"
          icon={reading.action === 'restart' ? 'refresh-outline' : 'cloud-download-outline'}
          title={reading.actionLabel}
          subtitle={
            reading.action === 'restart'
              ? 'Applies the version already downloaded'
              : 'Asks the update server whether anything newer exists'
          }
          onPress={() => void act()}
          last
        />
      ) : null}

      <SectionLabel>This build</SectionLabel>
      <Card testID="updates-build">
        <InfoRow
          first
          icon="git-commit-outline"
          label="Runtime"
          value={shortId(Updates.runtimeVersion)}
        />
        <InfoRow icon="git-branch-outline" label="Channel" value={Updates.channel ?? '—'} />
        {/* the embedded bundle is the one shipped inside the APK; anything else
            arrived over the air, and knowing which is running is the first
            question when an update appears not to have taken */}
        <InfoRow
          icon="cube-outline"
          label="Running"
          value={Updates.isEmbeddedLaunch ? 'Built in' : 'Downloaded'}
          valueColor={Updates.isEmbeddedLaunch ? undefined : COLOR.green}
        />
        <InfoRow icon="finger-print-outline" label="Update" value={shortId(Updates.updateId)} />
      </Card>

      <Hint>
        Only the JavaScript travels this way. A change to the native side — a new permission, a new module — still needs
        an installed build, and the runtime version above is what stops one being applied to the wrong one.
      </Hint>
    </Screen>
  );
}
