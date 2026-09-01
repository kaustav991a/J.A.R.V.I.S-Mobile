import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { Orbitron_400Regular, Orbitron_700Bold, useFonts } from '@expo-google-fonts/orbitron';
import { RootNavigator } from './src/navigation/RootNavigator';
import { LaunchScreen } from './src/screens/LaunchScreen';
import { LockScreen } from './src/screens/LockScreen';
import { WatchAlertScreen } from './src/screens/WatchAlertScreen';
import { AuthProvider, useAuth } from './src/security/AuthProvider';
import { ReactorHandoffProvider } from './src/components/ReactorHandoff';
import { alertFromLaunch, installHandler, probeNotify } from './src/lib/notify';
// Also imported for its side effect: the task has to be *defined* before the OS
// can hand work back to a process it just woke, which is before any component
// mounts. Registering it is the separate job the effect below does.
import { syncCommuteTask } from './src/lib/commuteTask';
import { pruneSweepExits } from './src/lib/timeline';
import { ToastProvider } from './src/components/ui/Toast';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { crashBuild } from './src/lib/crashBuild';
import { installCrashHandler } from './src/lib/crashLog';
import { UpdateBanner } from './src/components/UpdateBanner';
import { BlurTargetProvider } from './src/components/ui/Glass';
import { AppearanceProvider } from './src/theme/appearance';
import { JarvisProvider, useJarvis } from './src/state/JarvisProvider';
import { COLOR } from './src/theme/tokens';

void SplashScreen.preventAutoHideAsync();

// Registered at module scope, before any component mounts: the handler decides
// how a notification behaves when one lands while the app is open, and anything
// that arrives before it exists is discarded. Channels and permission are asked
// for once the app is up, since those can wait and this cannot.
installHandler();

// Same reasoning, for the errors no boundary sees: a throw in a socket callback, a
// task or an unawaited promise reaches React Native's global handler and today ends
// the process with nothing written down. Installed at module scope so it is already
// there for a crash during the first render, and it calls the handler it replaced —
// the app still dies exactly as it would have, with the record as a side effect.
installCrashHandler({ build: crashBuild });

/**
 * The gate, as a child so it can read the auth context it is gated by.
 *
 * It renders nothing until the probe and the stored settings have both landed:
 * a gate that flashed up for one frame on a phone with no app lock would be
 * worse than none, and `ready` is the flag that says which of those it is.
 */
function Gate() {
  const { ready, locked } = useAuth();
  if (!ready || !locked) return null;
  return <LockScreen />;
}

/**
 * The desk watch alert, over everything including the gate.
 *
 * Deliberately outside the navigator: it has to be able to arrive while any
 * screen is showing, and a route would be racing whatever navigation the user
 * was in the middle of.
 */
function Watch() {
  const { hud } = useJarvis();
  if (!hud.intruder) return null;
  return <WatchAlertScreen alert={hud.intruder} />;
}

export default function App() {
  const [loaded, error] = useFonts({ Orbitron_400Regular, Orbitron_700Bold });
  // the native splash hands off to this one, so the reactor never blinks out
  const [launching, setLaunching] = useState(true);
  const enter = useCallback(() => setLaunching(false), []);

  /**
   * A watch alert skips the launch screen entirely.
   *
   * The choreography is 2.4s, and the desk-watch window is 30 — so an app opened
   * by tapping that notification would spend a twelfth of the time available
   * watching a logo draw itself, on the one screen in this app that exists because
   * a machine is about to lock and someone has to say whether that is right.
   *
   * Read here rather than from the reducer because this sits *above* the provider:
   * `alertFromLaunch` reads the notification that opened the app, which is the
   * same thing `JarvisProvider` uses to raise the alert itself. Both read it; only
   * the provider acts on it.
   */
  const [alertChecked, setAlertChecked] = useState(false);
  useEffect(() => {
    let alive = true;
    void alertFromLaunch().then((alert) => {
      if (!alive) return;
      if (alert) setLaunching(false);
      setAlertChecked(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);

  /**
   * Deferred until the launch screen has lifted, for two reasons.
   *
   * It competes with the ignition: creating channels, asking permission and
   * resolving an FCM token are native round-trips on the JS thread, and they land
   * inside exactly the 1250ms the reactor is drawing itself — which starved the
   * draw and made it look like it skipped. And the permission dialog itself would
   * appear *over* the launch animation, which is the same mistake the lock screen
   * already queues behind it to avoid.
   */
  useEffect(() => {
    if (launching) return;
    void probeNotify().then(({ granted, pushToken }) => {
      // Logged rather than displayed: the desk has no way to receive this yet,
      // and a token is the address of *this install* — it belongs in the pairing
      // handshake once that exists, not on a screen to be read out. Until then
      // this line is how you confirm FCM actually resolved.
      // Never log the token itself. It is the address of this install, app logs
      // are readable by anything with adb, and it belongs in the pairing
      // handshake so the desk gets it directly rather than via a copy-paste.
      console.log(`[jarvis] notifications granted=${granted} push=${pushToken ? 'ok' : 'none'}`);
    });
  }, [launching]);

  /**
   * Re-register the briefing at every launch, from the stored setting.
   *
   * `setCommuteTask` was imported here and never called, so the switch on the
   * Places screen was the only thing that ever registered the task. Why that is
   * not enough is written at `syncCommuteTask`. Deferred with the rest: it is a
   * native round trip, and the launch animation has already been starved once.
   *
   * **The result is no longer thrown away.** `void syncCommuteTask()` was the last
   * of the three places a failed registration went silent — caught in
   * `setCommuteTask`, passed up as `false`, discarded here — and between them the
   * phone spent days with two departures switched on and no job for this uid. The
   * durable record is written by `setCommuteTask` for the Places screen to read;
   * this line is the same fact where `adb logcat` can see it during a launch.
   */
  /**
   * Take the platform's geofence sweeps back out of the history.
   *
   * Play Services re-evaluates every region when this process starts and reports an
   * exit for each one the phone is outside of. On 2026-09-01 at 18:31 that wrote ten
   * departures in one minute, from ten places, one of them an office he had not left
   * yet. `onGeofenceEvent` now recognises a burst as it arrives; this is for the ones
   * already stored, and for any that slip through a process that dies mid-sweep.
   *
   * Runs on every launch rather than once behind a flag, because the failure it
   * repairs recurs by design and a silent wrong figure is what this whole area of the
   * app has spent a week paying for.
   */
  useEffect(() => {
    if (launching) return;
    void pruneSweepExits().then((dropped) => {
      if (dropped) console.log(`[jarvis] dropped ${dropped} swept exits`);
    });
  }, [launching]);

  useEffect(() => {
    if (launching) return;
    void syncCommuteTask().then(({ ok, reason }) => {
      if (!ok) console.log(`[jarvis] commute task not armed: ${reason ?? 'no reason given'}`);
    });
  }, [launching]);

  /**
   * Nothing is rendered until it is known whether a watch alert opened the app.
   *
   * Setting `launching` false once the check resolves was not enough: the launch
   * screen mounts on the first frame and the check is a native round trip, so the
   * ignition flashed up and vanished on the one screen where every frame is part
   * of a 30-second decision. The native splash is still up at this point, so
   * holding here shows the user nothing new — it just declines to start an
   * animation that is about to be thrown away.
   */
  if ((!loaded && !error) || !alertChecked) return null;

  // AppearanceProvider is outermost: the navigator itself reads the accent for
  // its header tint and tab bar.
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={styles.root}>
      <BlurTargetProvider>
      <SafeAreaProvider>
        <AppearanceProvider>
          <AuthProvider>
            <JarvisProvider>
              <ReactorHandoffProvider>
              <ToastProvider>
                <StatusBar style="light" />
                <RootNavigator />
                {launching ? <LaunchScreen onDone={enter} /> : null}
                {/* The gate queues behind the launch screen. Mounted together,
                    LockScreen fires the OS prompt on the same frame the reactor
                    starts drawing, so the ignition plays under a system sheet and
                    the first thing the app does is interrupt itself. Nothing is
                    exposed by waiting: the launch overlay is opaque and covers
                    the whole app until it lifts. */}
                {launching ? null : <Gate />}
                <Watch />
                {/* over the navigator and under the gate: an update is worth
                    saying wherever he is, and never over a locked app */}
                {launching ? null : <UpdateBanner />}
              </ToastProvider>
              </ReactorHandoffProvider>
            </JarvisProvider>
          </AuthProvider>
        </AppearanceProvider>
      </SafeAreaProvider>
      </BlurTargetProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.bg },
});
