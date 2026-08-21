import { useEffect, useMemo, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState, Screen, SectionLabel } from '../components/ui/Atoms';
import { ScreenTitle } from '../components/ui/ScreenTitle';
import { GovernancePanel } from '../components/GovernancePanel';
import { RichText } from '../components/ui/RichText';
import { Touchable } from '../components/ui/Touchable';
import { COLOR, RADIUS, SPACE, TYPE } from '../theme/tokens';
import { clockLabel, dayHeading, dayOf } from '../lib/day';
import { countable, timeline } from '../state/activity';
import type { ActivityItem } from '../state/activity';
import { openChat } from '../navigation/RootNavigator';
import { useJarvis } from '../state/JarvisProvider';

/**
 * How many entries the panel shows before asking.
 *
 * A fixed page rather than a measured one. Filling the viewport exactly would mean
 * measuring row heights, and rows here are one to four lines tall and re-measure on
 * rotation and on every font-scale change — a page count that changes under a
 * scroll position is worse than one that is occasionally an entry short.
 *
 * The number it replaces was a silent `slice(0, 40)`: a log longer than forty was
 * quietly incomplete and looked exactly like a log that really was forty long.
 */
const PAGE = 12;

const ICONS: Record<ActivityItem['from'], keyof typeof Ionicons.glyphMap> = {
  user: 'arrow-up-circle-outline',
  jarvis: 'chatbubble-ellipses-outline',
  trace: 'git-commit-outline',
};

const TINTS: Record<ActivityItem['from'], string> = {
  user: COLOR.dim,
  jarvis: COLOR.blue,
  trace: COLOR.gold,
};

/**
 * Everything that happened, newest first: what was said in either direction and
 * what the agent did, merged into one timeline.
 *
 * The bell used to open Reports, which answers "how is the machine" — a
 * different question from "what just happened". Approvals sit at the top
 * because they are the only entries that need the user to do something.
 *
 * The list is built by `state/activity`, not here. The bell reads the same builder,
 * and before it did the two could disagree: a count on the bell described entries
 * this panel was not showing.
 */
export function ActivityScreen() {
  const { hud, decide, alertsUnread, markAlertsRead, markRead, readIds } = useJarvis();

  const items = useMemo(() => timeline(hud.chat, hud.trace), [hud.chat, hud.trace]);
  /**
   * What the header is allowed to claim.
   *
   * Not `items.length`, which counted the message you had just typed and every
   * step that carried no text — a number that says "there is something here you
   * have not seen" must not be inflated by the thing you just sent.
   */
  const readable = useMemo(() => new Set(countable(items).map((i) => i.id)), [items]);
  const counted = readable.size;

  const [shown, setShown] = useState(PAGE);
  const page = items.slice(0, shown);
  const behind = items.length - page.length;

  /**
   * The entry being read, or null.
   *
   * Held rather than derived because the row can leave the page underneath it — the
   * log grows while the box is open, and a modal whose content is looked up by
   * index would swap to a different entry as things arrive.
   */
  const [open, setOpen] = useState<ActivityItem | null>(null);

  const read = (item: ActivityItem) => {
    setOpen(item);
    // only this one. `markAlertsRead` is the other control and it is deliberate:
    // reading one thing is not a claim about its neighbours
    markRead(item.id);
  };

  return (
    <>
    <Screen testID="activity-screen">
      <ScreenTitle
        title="ACTIVITY"
        caption={counted ? `${counted} from Jarvis` : undefined}
        /**
         * Offered only when there is something unread, rather than always.
         *
         * A permanently visible "mark all as read" is a button that does nothing
         * most of the time you look at it, and a control that usually no-ops stops
         * being read as a control. It does not clear parked approvals — those are
         * answered in "Needs you" below, not read away.
         */
        trailing={
          alertsUnread > 0 ? (
            <Touchable
              testID="activity-mark-read"
              accessibilityRole="button"
              accessibilityLabel={`Mark all ${alertsUnread} as read`}
              hitSlop={10}
              onPress={markAlertsRead}
            >
              <Text style={styles.markRead}>MARK ALL READ</Text>
            </Touchable>
          ) : undefined
        }
      />

      {hud.parked.length > 0 ? (
        <>
          <SectionLabel>Needs you</SectionLabel>
          <GovernancePanel parked={hud.parked} onDecide={decide} />
        </>
      ) : null}

      <SectionLabel>Timeline</SectionLabel>
      {items.length === 0 ? (
        <EmptyState
          testID="activity-empty"
          text="Nothing has happened yet"
          hint="Commands you send and steps the agent takes land here."
        />
      ) : (
        <View style={styles.list}>
          {page.map((item, i) => (
            <View key={item.id}>
              {/* the day changes above this row, so the rule belongs before it */}
              {i === 0 || dayOf(page[i - 1].at) !== dayOf(item.at) ? <DayRule at={item.at} /> : null}
              {/*
                `countable` decides what may be unread, the same rule the header count
                uses. The dot used to be driven by the read set alone, so a line you
                had just typed arrived marked unread — two definitions of one word on
                one screen, and the phone showed it within minutes of shipping.
              */}
              <Row
                item={item}
                unread={readable.has(item.id) && !readIds.has(item.id)}
                onPress={() => read(item)}
              />
            </View>
          ))}

          {behind > 0 ? (
            <Touchable
              testID="activity-more"
              accessibilityRole="button"
              accessibilityLabel={`Show ${behind} more`}
              onPress={() => setShown((n) => n + PAGE)}
              style={styles.more}
            >
              {/* the number, because "see more" alone does not say whether it is
                  three more or three hundred */}
              <Text style={styles.moreText}>{`SEE ${behind} MORE`}</Text>
            </Touchable>
          ) : null}
        </View>
      )}

    </Screen>
    {/*
      Outside `Screen`, because `Screen` is a ScrollView: an absolutely positioned
      child of one scrolls away with the content it is supposed to be covering.
      As a sibling it fills the navigator's scene instead.
    */}
    <DetailBox item={open} onClose={() => setOpen(null)} />
    </>
  );
}

/**
 * A rule with the day's name in it, between one day's entries and the next.
 *
 * The same rules as the chat, from `lib/day`: a line rather than a floating label,
 * because the point is to say one day stopped and another started, and a rule is
 * what a break looks like.
 */
function DayRule({ at }: { at: number }) {
  return (
    <View style={styles.dayRule} testID={`activity-day-${dayOf(at)}`}>
      <View style={styles.dayLine} />
      <Text style={styles.dayLabel}>{dayHeading(at)}</Text>
      <View style={styles.dayLine} />
    </View>
  );
}

function Row({ item, unread, onPress }: { item: ActivityItem; unread: boolean; onPress: () => void }) {
  return (
    <Touchable
      testID={`activity-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${clockLabel(item.at)}${unread ? ', unread' : ''}`}
      onPress={onPress}
      style={styles.row}
    >
      <Ionicons name={ICONS[item.from]} size={17} color={TINTS[item.from]} style={styles.icon} />
      <View style={styles.text}>
        <View style={styles.titleLine}>
          <Text style={styles.title}>{item.title}</Text>
          {/* a dot rather than a word: the row's title is already shouting, and a
              second uppercase label beside it competes with it */}
          {unread ? <View testID={`activity-unread-${item.id}`} style={styles.dot} /> : null}
        </View>
        {item.detail ? (
          <Text style={styles.detail} numberOfLines={3}>
            {item.detail}
          </Text>
        ) : null}
      </View>
      <Text style={styles.time}>{clockLabel(item.at)}</Text>
    </Touchable>
  );
}

/**
 * The whole message, on a row that only had space for three lines of it.
 *
 * A briefing is two or three sentences and every one of them is the part you act
 * on, so a clamped row was showing a cropped version of the only thing this panel
 * exists to show. Reported from the device on 2026-08-21.
 *
 * `OPEN IN CHAT` appears only for a chat turn. A trace entry has no turn to open,
 * and a button that navigates somewhere the entry is not would be a lie about what
 * the panel holds.
 *
 * **Not a `Modal`.** RN 0.86's `Modal` is not exported at all under this jest
 * setup — `require('react-native').Modal` is `undefined`, so a test renders the
 * screen with the box silently absent and every assertion inside it fails the way
 * a component that never opened would. An in-tree overlay is the same thing on
 * screen, is covered by the tests, and leaves the tab bar reachable, which for a
 * read-one-entry box is right: nothing here has to be answered before moving on.
 */
function DetailBox({ item, onClose }: { item: ActivityItem | null; onClose: () => void }) {
  /** Android's back gesture closes it, which `Modal` would have given for free */
  useEffect(() => {
    if (!item) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [item, onClose]);

  if (!item) return null;

  return (
    <View style={styles.shade}>
      {/* a press on the dimmed area closes, the way a sheet does */}
      <Touchable
        testID="activity-shade"
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={styles.shadeFill}
      />
      <View testID="activity-detail" style={styles.box}>
            <Text style={styles.boxTitle}>{item.title.toUpperCase()}</Text>
            <Text style={styles.boxTime}>{clockLabel(item.at)}</Text>
            <ScrollView style={styles.boxScroll} testID="activity-detail-body">
              {/*
                Markdown rendered rather than shown as asterisks, the same as the
                chat: the model reaches for it and the panel now carries its words
                verbatim. No `numberOfLines` anywhere below — the clamp on the row
                is the bug this box exists to undo.
              */}
              <RichText text={item.detail} style={styles.boxBody} />
            </ScrollView>
            <View style={styles.boxActions}>
              {item.from !== 'trace' ? (
                <Touchable
                  testID="activity-open-chat"
                  accessibilityRole="button"
                  accessibilityLabel="Open in chat"
                  onPress={() => {
                    onClose();
                    openChat();
                  }}
                >
                  <Text style={styles.action}>OPEN IN CHAT</Text>
                </Touchable>
              ) : null}
              <Touchable
                testID="activity-close"
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
              >
                <Text style={[styles.action, styles.actionQuiet]}>CLOSE</Text>
              </Touchable>
            </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  markRead: { ...TYPE.dataLabel, fontSize: 10, letterSpacing: 1.2, color: COLOR.blue },
  list: { gap: SPACE.sm },
  row: {
    flexDirection: 'row',
    backgroundColor: COLOR.panel,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  icon: { marginRight: SPACE.md, marginTop: 2 },
  text: { flex: 1 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  title: { ...TYPE.dataLabel, fontSize: 11, color: COLOR.white, letterSpacing: 1 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLOR.blue },
  detail: { ...TYPE.meta, fontSize: 12, color: COLOR.dim, marginTop: 3 },
  time: { ...TYPE.meta, fontSize: 11, color: COLOR.dim, marginLeft: SPACE.md },

  dayRule: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginTop: SPACE.sm },
  dayLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: COLOR.line },
  dayLabel: { ...TYPE.dataLabel, fontSize: 10, letterSpacing: 1.2, color: COLOR.dim },

  more: { alignItems: 'center', paddingVertical: SPACE.md },
  moreText: { ...TYPE.dataLabel, fontSize: 10, letterSpacing: 1.2, color: COLOR.blue },

  /**
   * The measuring parent, and that is the point.
   *
   * An absolutely-positioned fill has a definite height, so `maxHeight: '80%'` on the
   * box below resolves against it. It used to sit inside an auto-height wrapper, where
   * the percentage had nothing to measure against: the box collapsed to a single
   * clipped line and the detail view showed less than the row it was opened from —
   * caught on the phone 2026-08-21, invisible to every test because jest does not lay
   * anything out.
   */
  shade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: SPACE.lg,
  },
  shadeFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.72)' },
  box: {
    backgroundColor: COLOR.panel,
    borderRadius: RADIUS.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    padding: SPACE.lg,
    // a long briefing must not push the actions off the bottom of the screen
    maxHeight: '80%',
  },
  boxTitle: { ...TYPE.dataLabel, fontSize: 11, color: COLOR.white, letterSpacing: 1 },
  boxTime: { ...TYPE.meta, fontSize: 11, color: COLOR.dim, marginTop: 2 },
  // shrink rather than grow: the box is capped, and without this the scroll view
  // demands its full content height and pushes the actions off the bottom
  boxScroll: { flexShrink: 1, marginTop: SPACE.md },
  boxBody: { ...TYPE.meta, fontSize: 13, color: COLOR.white, lineHeight: 19 },
  boxActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACE.lg, marginTop: SPACE.lg },
  action: { ...TYPE.dataLabel, fontSize: 10, letterSpacing: 1.2, color: COLOR.blue },
  actionQuiet: { color: COLOR.dim },
});
