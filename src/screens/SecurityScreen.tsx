import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Hint, Screen, SectionLabel } from '../components/ui/Atoms';
import { Card, InfoRow } from '../components/ui/Card';
import { ScreenTitle } from '../components/ui/ScreenTitle';
import { SettingsRow } from '../components/ui/SettingsRow';
import { COLOR, RADIUS } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';
import { useAuth } from '../security/AuthProvider';
import { useToast } from '../components/ui/Toast';

/**
 * Auth setup. Two switches and an honest account of what this phone's sensor
 * can actually do, because both switches depend on it and a greyed-out row with
 * no reason given is the kind of thing people file bugs about.
 */
export function SecurityScreen() {
  const { accent } = useAppearance();
  const toast = useToast();
  const {
    ready,
    capability,
    sensorLabel,
    usable,
    appLock,
    requireForApprovals,
    setAppLock,
    setRequireForApprovals,
  } = useAuth();
  /** which switch is mid-prompt, so neither can be double-fired */
  const [busy, setBusy] = useState<'lock' | 'approvals' | null>(null);

  const enrolled = capability?.enrolled ?? false;
  const strong = capability?.strong ?? false;

  const flip = async (which: 'lock' | 'approvals', on: boolean) => {
    setBusy(which);
    try {
      if (which === 'lock') await setAppLock(on);
      else await setRequireForApprovals(on);
    } finally {
      setBusy(null);
    }
  };

  const guard = (which: 'lock' | 'approvals', on: boolean) => {
    if (!enrolled) {
      // the OS owns enrolment; all this app can do is say so plainly
      toast.show(`No ${sensorLabel.toLowerCase()} enrolled. Add one in your phone's settings first.`, 'bad');
      return;
    }
    void flip(which, on);
  };

  const toggle = (which: 'lock' | 'approvals', value: boolean) => (
    <Switch
      testID={`security-${which}-switch`}
      value={value}
      onValueChange={(on) => guard(which, on)}
      disabled={!ready || busy !== null || !enrolled}
      trackColor={{ false: COLOR.line, true: `${accent}88` }}
      thumbColor={value ? accent : COLOR.dim}
    />
  );

  return (
    <Screen testID="security-screen">
      <ScreenTitle title="SECURITY" caption={usable ? sensorLabel.toUpperCase() : 'UNAVAILABLE'} back />

      <SectionLabel>This phone</SectionLabel>
      <Card testID="security-sensor">
        <InfoRow
          first
          icon="finger-print-outline"
          label="Sensor"
          value={capability?.hardware ? sensorLabel : 'None'}
        />
        <InfoRow
          icon={enrolled ? 'checkmark-circle-outline' : 'alert-circle-outline'}
          label="Enrolled"
          value={enrolled ? 'Yes' : 'No'}
          valueColor={enrolled ? undefined : COLOR.gold}
        />
        {/* class-2 face unlock can be beaten with a photograph, so it is named
            rather than quietly accepted as equivalent */}
        <InfoRow
          icon="shield-outline"
          label="Class"
          value={strong ? 'Strong' : enrolled ? 'Weak — photo-spoofable' : '—'}
          valueColor={enrolled && !strong ? COLOR.gold : undefined}
        />
        <InfoRow icon="keypad-outline" label="Phone PIN" value={capability?.passcode ? 'Set' : 'Not set'} />
      </Card>

      <SectionLabel>Gates</SectionLabel>
      <View style={styles.group}>
        <SettingsRow
          testID="security-lock"
          icon="lock-closed-outline"
          title="App lock"
          subtitle={`${sensorLabel} on launch, and after 20s away`}
          trailing={toggle('lock', appLock)}
        />
        <SettingsRow
          testID="security-approvals"
          icon="shield-checkmark-outline"
          title="Confirm approvals"
          subtitle="Ask again before approving or denying anything"
          trailing={toggle('approvals', requireForApprovals)}
          last
        />
      </View>

      {!enrolled ? (
        <Hint testID="security-hint">
          {capability?.hardware
            ? `This phone has a ${sensorLabel.toLowerCase()} reader but nothing enrolled on it. Add one in your phone's settings and come back.`
            : 'This build cannot reach a biometric sensor. On a phone that has one, install a dev build made after this feature landed.'}
        </Hint>
      ) : (
        <Hint testID="security-hint">
          Turning a gate off asks for your {sensorLabel.toLowerCase()} too — otherwise anyone holding the unlocked phone
          could simply switch it off.
        </Hint>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: COLOR.panel,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    overflow: 'hidden',
  },
});
