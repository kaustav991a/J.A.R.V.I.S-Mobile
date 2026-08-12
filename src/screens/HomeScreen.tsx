import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { ArcReactor } from '../components/ArcReactor';
import { HandoffAnchor } from '../components/ReactorHandoff';
import { CommandBar } from '../components/CommandBar';
import { GovernancePanel } from '../components/GovernancePanel';
import { TypeLine } from '../components/TypeLine';
import { QuickMenu } from '../components/QuickMenu';
import { Screen, SectionLabel } from '../components/ui/Atoms';
import { Touchable } from '../components/ui/Touchable';
import { useToast } from '../components/ui/Toast';
import { COLOR, SPACE, TYPE, glowText } from '../theme/tokens';
import { greetingFor, msToNextMinute } from '../theme/greeting';
import { ACCENTS, useAppearance } from '../theme/appearance';
import { useJarvis } from '../state/JarvisProvider';
import { SCRIPTS } from '../data/fixtures';
import { TABS_ID } from '../navigation/types';
import type { HomeStackParams, TabParams } from '../navigation/types';

/** the person the assistant is addressing; a real profile would supply this */
const ADDRESS = 'SIR';

const MODE_LABEL = { lan: 'WORKSPACE', cloud: 'CLOUD', offline: 'OFFLINE' } as const;

type Action = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  title: string;
  caption: string;
};

const ACTIONS: Action[] = [
  { key: 'run', icon: 'document-text-outline', tint: COLOR.blue, title: 'Run Script', caption: 'Execute your scripts' },
  {
    key: 'commands',
    icon: 'terminal-outline',
    tint: ACCENTS.violet,
    title: 'Commands',
    caption: 'Run system commands',
  },
  { key: 'connect', icon: 'link-outline', tint: COLOR.green, title: 'Connect', caption: 'Manage your connections' },
  { key: 'reports', icon: 'bar-chart-outline', tint: COLOR.gold, title: 'Reports', caption: 'View system reports' },
];

/**
 * The landing tab: a greeting, the command line, four shortcuts and a
 * three-column readout. Everything below the greeting is a doorway into a tab
 * that already exists — Home holds no state of its own.
 */
export function HomeScreen() {
  // the third generic is the id `getParent` may be called with
  const nav = useNavigation<NativeStackNavigationProp<HomeStackParams, 'HomeMain', typeof TABS_ID>>();
  const { accent, animations } = useAppearance();
  const { hud, mode, connected, connecting, connect, sendCommand, decide } = useJarvis();
  const toast = useToast();

  // the clock, not the session, decides the greeting — so it has to be re-read
  // while the screen is open, on the minute
  const [greeting, setGreeting] = useState(() => greetingFor());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setGreeting(greetingFor());
      timer = setTimeout(tick, msToNextMinute());
    };
    timer = setTimeout(tick, msToNextMinute());
    return () => clearTimeout(timer);
  }, []);

  /**
   * A shortcut that changes tab has to be delivered to the tab navigator by
   * id. Left to bubble, the same call can be answered by the Home stack — the
   * screen changes but the tab bar stays lit on Home.
   */
  const tabs = nav.getParent<BottomTabNavigationProp<TabParams>>(TABS_ID);

  const go = (key: string) => {
    if (key === 'run') tabs?.navigate('Scripts', { screen: 'ScriptsHome' });
    else if (key === 'commands') tabs?.navigate('Commands', { screen: 'CommandsHome' });
    else if (key === 'reports') tabs?.navigate('Reports', { screen: 'ReportsHome' });
    else nav.navigate('Connection');
  };

  const linkLabel = connecting ? 'Connecting' : connected ? 'Connected' : 'Disconnected';
  const linkColor = connected ? COLOR.green : connecting ? COLOR.gold : COLOR.red;
  const activity = hud.status === 'boot' ? 'IDLE' : hud.status.toUpperCase();
  const scriptLabel = SCRIPTS.length ? `${SCRIPTS.length} Scripts` : 'No Scripts';

  const [menu, setMenu] = useState(false);

  const send = (text: string) => {
    void sendCommand(text).catch(() => {});
    toast.show(connected ? `Sent “${text}”` : 'No link — command queued', connected ? 'good' : 'bad');
  };

  return (
    <Screen testID="home-screen" refreshing={connecting} onRefresh={connect}>
      <QuickMenu
        visible={menu}
        onClose={() => setMenu(false)}
        onGo={(to) => {
          if (to === 'connection') nav.navigate('Connection');
          else if (to === 'appearance') tabs?.navigate('Settings', { screen: 'Appearance' });
          else tabs?.navigate('Settings', { screen: 'About' });
        }}
      />

      <View style={styles.topbar}>
        <Touchable
          testID="home-menu"
          accessibilityRole="button"
          accessibilityLabel="Menu"
          hitSlop={10}
          onPress={() => setMenu(true)}
        >
          <Ionicons name="menu" size={26} color={COLOR.white} />
        </Touchable>

        {/* the bell opens the timeline, not the machine's vitals: "what just
            happened" is a different question from "how is the desk" */}
        <Touchable
          testID="home-alerts"
          accessibilityRole="button"
          accessibilityLabel="Activity"
          hitSlop={10}
          onPress={() => nav.navigate('Activity')}
        >
          <Ionicons name="notifications-outline" size={23} color={COLOR.white} />
          {hud.parked.length > 0 ? <View testID="home-alert-dot" style={styles.alertDot} /> : null}
        </Touchable>
      </View>

      <View style={styles.greetRow}>
        <View style={styles.greetText}>
          <Text testID="home-greeting" style={styles.hello}>
            {greeting}
          </Text>
          <Text testID="home-address" style={[styles.address, { color: accent }, glowText(accent, 10)]}>
            {ADDRESS}
          </Text>
          <TypeLine
            testID="home-prompt"
            text="How can I assist you today?"
            style={styles.prompt}
            enabled={animations}
          />
        </View>
        {/* the launch screen's reactor flies to wherever this one lands */}
        <HandoffAnchor id="target">
          <ArcReactor size={84} status={hud.status} label="" monogram="J" />
        </HandoffAnchor>
      </View>

      <CommandBar placeholder="Type a command…" leadingIcon="sparkles" onSubmit={send} onVoice={() => {}} />

      <SectionLabel>Quick actions</SectionLabel>
      <View style={styles.grid}>
        {ACTIONS.map((a) => (
          <Touchable
            key={a.key}
            testID={`quick-${a.key}`}
            accessibilityRole="button"
            accessibilityLabel={a.title}
            onPress={() => go(a.key)}
            style={styles.card}
          >
            <View style={[styles.iconTile, { borderColor: a.tint, backgroundColor: `${a.tint}1f` }]}>
              <Ionicons name={a.icon} size={19} color={a.tint} />
            </View>
            <Text style={styles.cardTitle}>{a.title}</Text>
            <View style={styles.cardFoot}>
              <Text style={styles.cardCaption}>{a.caption}</Text>
              <Ionicons name="chevron-forward" size={14} color={COLOR.dim} />
            </View>
          </Touchable>
        ))}
      </View>

      {hud.parked.length > 0 ? (
        <>
          <SectionLabel>Awaiting approval</SectionLabel>
          <GovernancePanel parked={hud.parked} onDecide={decide} />
        </>
      ) : null}

      <SectionLabel>Status</SectionLabel>
      {/* each column is its own target: a single card-wide tap had nowhere
          sensible to go and landed the user back on a screen that looks like
          the one they were already on */}
      <View testID="home-status" style={styles.statusCard}>
        <Touchable
          testID="home-status-link"
          accessibilityRole="button"
          accessibilityLabel="Connection"
          onPress={() => nav.navigate('Connection')}
          style={styles.statusCol}
        >
          <Text testID="home-link" style={[styles.statusValue, { color: linkColor }]}>
            {linkLabel}
          </Text>
          <Text style={styles.statusCaption}>Server Status</Text>
        </Touchable>

        <View style={styles.statusDivider} />

        <Touchable
          testID="home-status-mode"
          accessibilityRole="button"
          accessibilityLabel="Current mode"
          onPress={() => nav.navigate('Connection')}
          style={styles.statusCol}
        >
          <Text style={[styles.statusValue, { color: accent }]}>{activity}</Text>
          <Text style={styles.statusCaption}>{connected ? MODE_LABEL[mode] : 'Current Mode'}</Text>
        </Touchable>

        <View style={styles.statusDivider} />

        <Touchable
          testID="home-status-scripts"
          accessibilityRole="button"
          accessibilityLabel="Scripts"
          onPress={() => tabs?.navigate('Scripts', { screen: 'ScriptsHome' })}
          style={styles.statusCol}
        >
          <Text style={[styles.statusValue, { color: ACCENTS.violet }]}>{scriptLabel}</Text>
          <Text style={styles.statusCaption}>Active</Text>
        </Touchable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  alertDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLOR.blue,
  },
  greetRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACE.xl, marginBottom: SPACE.xl },
  greetText: { flex: 1 },
  /** the greeting is the one place the app speaks plainly, so it uses the
   *  system face rather than the display font the HUD is set in */
  hello: { fontSize: 26, fontWeight: '700', color: COLOR.white, letterSpacing: 0.2 },
  address: { ...TYPE.wordmark, fontSize: 28, letterSpacing: 4, marginTop: 2 },
  prompt: { ...TYPE.meta, fontSize: 13, color: COLOR.dim, marginTop: SPACE.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: SPACE.md },
  card: {
    width: '48%',
    backgroundColor: COLOR.panel,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    padding: SPACE.lg,
  },
  pressed: { opacity: 0.75 },
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.md,
  },
  cardTitle: { ...TYPE.dataValue, fontSize: 15, color: COLOR.white },
  cardFoot: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 4 },
  cardCaption: { ...TYPE.meta, fontSize: 11, color: COLOR.dim, flex: 1, paddingRight: SPACE.sm },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLOR.panel,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    paddingVertical: SPACE.lg,
  },
  statusCol: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: SPACE.xs },
  statusDivider: { width: StyleSheet.hairlineWidth, height: 34, backgroundColor: COLOR.line },
  statusValue: { ...TYPE.dataValue, fontSize: 14 },
  statusCaption: { ...TYPE.meta, fontSize: 11, color: COLOR.dim },
});
