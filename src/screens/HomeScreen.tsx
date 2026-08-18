import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { ArcReactor } from '../components/ArcReactor';
import { HandoffAnchor } from '../components/ReactorHandoff';
import { GovernancePanel } from '../components/GovernancePanel';
import { TypeLine } from '../components/TypeLine';
import { QuickMenu } from '../components/QuickMenu';
import { Screen, SectionLabel } from '../components/ui/Atoms';
import { Touchable } from '../components/ui/Touchable';
import { COLOR, SPACE, TYPE, glowBox, glowText } from '../theme/tokens';
import { greetingFor, msToNextMinute } from '../theme/greeting';
import { ACCENTS, useAppearance } from '../theme/appearance';
import { useJarvis } from '../state/JarvisProvider';
import { SCRIPTS } from '../data/fixtures';
import { TABS_ID } from '../navigation/types';
import type { HomeStackParams, TabParams } from '../navigation/types';

/** the person the assistant is addressing; a real profile would supply this */
const ADDRESS = 'SIR';

const MODE_LABEL = { lan: 'WORKSPACE', cloud: 'CLOUD', offline: 'OFFLINE' } as const;

/**
 * How lit the link tile is, as hex alpha on `COLOR.green`.
 *
 * Full power gets the whole wash and a lit edge; a cloud session gets a fifth of
 * it — present, clearly not the same thing. That ratio is the point: a cloud link
 * holds no PC control and must never read as a full desk link.
 *
 * Alpha rather than a shadow because `glowBox` is **iOS-only** — Android draws no
 * coloured shadow at all, so a glow expressed that way is invisible on the phone
 * this is mostly used on. `glowBox` is still applied for iOS, where it is the
 * better-looking half of the effect.
 */
const LINK_WASH = { full: '47', cloud: '0f' } as const;
const LINK_EDGE = { full: 'ff', cloud: '4d' } as const;
const LINK_GLOW = { full: 20, cloud: 4 } as const;

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
  const { accent, animations, glow } = useAppearance();
  const {
    hud,
    mode,
    connected,
    connecting,
    connect,
    decide,
    unread,
    alertsUnread,
    shareLocation,
    place,
    refreshPlace,
  } = useJarvis();

  /**
   * What the bell shows: things you have not seen, plus things still waiting on you.
   *
   * Two different kinds of attention deliberately summed into one number, because
   * one 23px glyph cannot carry two marks. Reading the sheet clears the first half
   * only — see `markAlertsRead`.
   */
  const bellCount = alertsUnread + hud.parked.length;

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

  /**
   * A cloud session with the desk attached is not the same animal as a cloud
   * session without one — the first has PC control, the second does not. Naming
   * both CLOUD hid the only difference that matters.
   */
  const fullPower = connected && hud.deskLinked === true;
  const transport = fullPower ? 'FULL POWER' : MODE_LABEL[mode];

  // the last thing said, either direction: enough to recognise the conversation
  // you left without reproducing it on this screen
  const lastSaid = hud.chat.length ? hud.chat[hud.chat.length - 1].text : null;

  const linkLabel = connecting ? 'Connecting' : connected ? 'Connected' : 'Disconnected';
  const linkColor = connected ? COLOR.green : connecting ? COLOR.gold : COLOR.red;
  const activity = hud.status === 'boot' ? 'IDLE' : hud.status.toUpperCase();
  const scriptLabel = SCRIPTS.length ? `${SCRIPTS.length} Scripts` : 'No Scripts';

  /**
   * A fix when Home is on screen, not on a timer.
   *
   * The line is only read while this tab is open, so that is the only moment worth
   * spending a GPS read on — anything periodic would be a background tracker with
   * extra steps.
   */
  useFocusEffect(
    useCallback(() => {
      void refreshPlace();
    }, [refreshPlace])
  );

  const [menu, setMenu] = useState(false);

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

        {/**
         * Where he is, the way a delivery app shows it.
         *
         * Only when sharing is on: an empty pin inviting a tap would be asking for
         * a permission with nothing to show for it yet, and this screen already has
         * a Settings row that explains the trade. Tapping refreshes the fix, which
         * is what a stale line makes you want to do.
         */}
        {shareLocation ? (
          <Touchable
            testID="home-place"
            accessibilityRole="button"
            accessibilityLabel="Refresh location"
            hitSlop={8}
            onPress={() => void refreshPlace()}
            style={styles.place}
          >
            <Ionicons name="location-sharp" size={13} color={accent} />
            <Text style={styles.placeText} numberOfLines={1}>
              {place ?? 'Locating…'}
            </Text>
          </Touchable>
        ) : null}

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
          {/* A count, not a dot. The dot was driven by `parked.length` alone, so a
              timeline full of things you had not seen looked exactly like an empty
              one. Parked approvals are added on top of the unread count rather than
              replaced by it: marking the sheet read cannot clear something that is
              still waiting on a decision. */}
          {bellCount > 0 ? (
            <View testID="home-alert-count" style={styles.alertCount}>
              <Text style={styles.alertCountText}>{bellCount > 9 ? '9+' : String(bellCount)}</Text>
            </View>
          ) : null}
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

      {/**
       * Where the command box used to be.
       *
       * Two boxes that both send to J.A.R.V.I.S. — this one and the chat's own
       * composer — meant a reply to something typed here landed in a tab you were
       * not on, and nothing on Home said so. Home is the place you come back to,
       * so it now reports the conversation instead of starting a second one: the
       * last thing said, and how many answers you have not read.
       */}
      <Touchable
        testID="home-replies"
        accessibilityRole="button"
        accessibilityLabel={unread ? `${unread} unread replies` : 'Open chat'}
        onPress={() => tabs?.navigate('Commands', { screen: 'CommandsHome' })}
        style={[styles.replies, unread ? { borderColor: accent } : null]}
      >
        <View style={[styles.replyIcon, { borderColor: unread ? accent : COLOR.line }]}>
          <Ionicons
            name={unread ? 'chatbubble-ellipses' : 'chatbubble-outline'}
            size={18}
            color={unread ? accent : COLOR.dim}
          />
        </View>
        <View style={styles.replyBody}>
          <Text style={styles.replyTitle} numberOfLines={1}>
            {unread ? `${unread} new ${unread === 1 ? 'reply' : 'replies'}` : 'Chat'}
          </Text>
          <Text style={styles.replyLine} numberOfLines={1}>
            {lastSaid ?? 'Ask J.A.R.V.I.S. something'}
          </Text>
        </View>
        {unread ? (
          <View testID="home-unread-dot" style={[styles.replyDot, { backgroundColor: accent }]} />
        ) : (
          <Ionicons name="chevron-forward" size={14} color={COLOR.dim} />
        )}
      </Touchable>

      <SectionLabel>Quick actions</SectionLabel>
      <View style={styles.grid}>
        {ACTIONS.map((a) => {
          // The link tile carries the link's own colour rather than a fixed one.
          // Painted green whatever the state, it read as "connected" on a phone
          // sitting dark — the one tile on this screen that must never flatter.
          const isLink = a.key === 'connect';
          const tint = isLink ? linkColor : a.tint;
          const caption =
            isLink && connected
              ? fullPower
                ? 'Full power — the desk is online'
                : `Linked over ${MODE_LABEL[mode]}`
              : a.caption;
          const tone = fullPower ? 'full' : 'cloud';
          const lit = isLink && connected;
          return (
            <Touchable
              key={a.key}
              testID={`quick-${a.key}`}
              accessibilityRole="button"
              accessibilityLabel={a.title}
              onPress={() => go(a.key)}
              style={
                lit
                  ? [
                      styles.card,
                      {
                        backgroundColor: `${COLOR.green}${LINK_WASH[tone]}`,
                        borderColor: `${COLOR.green}${LINK_EDGE[tone]}`,
                      },
                      glowBox(COLOR.green, glow * LINK_GLOW[tone]),
                    ]
                  : styles.card
              }
            >
              <View style={[styles.iconTile, { borderColor: tint, backgroundColor: `${tint}1f` }]}>
                <Ionicons name={isLink && connected ? 'link' : a.icon} size={19} color={tint} />
              </View>
              {/* the title stays the destination, not the state: this tile is a
                  doorway to the Connection screen, and the Status card below
                  already carries the reading */}
              <Text style={styles.cardTitle}>{a.title}</Text>
              <View style={styles.cardFoot}>
                <Text style={styles.cardCaption}>{caption}</Text>
                <Ionicons name="chevron-forward" size={14} color={COLOR.dim} />
              </View>
            </Touchable>
          );
        })}
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
          <Text style={styles.statusCaption}>{connected ? transport : 'Current Mode'}</Text>
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
  alertCount: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLOR.blue,
  },
  alertCountText: {
    ...TYPE.dataLabel,
    fontSize: 9,
    lineHeight: 14,
    // dark on the blue, so the digit is the hole rather than a second bright thing
    color: COLOR.bg,
    includeFontPadding: false,
  },
  greetRow: { flexDirection: 'row', alignItems: 'center', marginTop: SPACE.xl, marginBottom: SPACE.xl },
  greetText: { flex: 1 },
  /** the greeting is the one place the app speaks plainly, so it uses the
   *  system face rather than the display font the HUD is set in */
  hello: { fontSize: 26, fontWeight: '700', color: COLOR.white, letterSpacing: 0.2 },
  address: { ...TYPE.wordmark, fontSize: 28, letterSpacing: 4, marginTop: 2 },
  prompt: { ...TYPE.meta, fontSize: 13, color: COLOR.dim, marginTop: SPACE.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: SPACE.md },
  place: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1, maxWidth: '62%' },
  placeText: { ...TYPE.dataLabel, color: COLOR.dim },
  replies: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    backgroundColor: COLOR.panel,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    padding: SPACE.lg,
  },
  replyIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replyBody: { flex: 1 },
  replyTitle: { ...TYPE.dataValue, fontSize: 15, color: COLOR.white },
  replyLine: { ...TYPE.meta, color: COLOR.dim, marginTop: 2 },
  replyDot: { width: 9, height: 9, borderRadius: 999 },
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
