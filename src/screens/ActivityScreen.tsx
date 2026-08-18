import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EmptyState, Screen, SectionLabel } from '../components/ui/Atoms';
import { ScreenTitle } from '../components/ui/ScreenTitle';
import { GovernancePanel } from '../components/GovernancePanel';
import { Touchable } from '../components/ui/Touchable';
import { COLOR, RADIUS, SPACE, TYPE } from '../theme/tokens';
import { useJarvis } from '../state/JarvisProvider';

type Item = {
  key: string;
  at: number;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  title: string;
  detail?: string;
};

const clock = (at: number): string => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * Everything that happened, newest first: what was said in either direction and
 * what the agent did, merged into one timeline.
 *
 * The bell used to open Reports, which answers "how is the machine" — a
 * different question from "what just happened". Approvals sit at the top
 * because they are the only entries that need the user to do something.
 */
export function ActivityScreen() {
  const { hud, decide, alertsUnread, markAlertsRead } = useJarvis();

  const items: Item[] = [
    ...hud.chat.map((c, i) => ({
      key: `chat-${c.at}-${i}`,
      at: c.at,
      icon: c.from === 'user' ? ('arrow-up-circle-outline' as const) : ('chatbubble-ellipses-outline' as const),
      tint: c.from === 'user' ? COLOR.dim : COLOR.blue,
      title: c.from === 'user' ? 'You sent' : 'Jarvis replied',
      detail: c.text,
    })),
    ...hud.trace.map((t, i) => ({
      key: `trace-${t.at}-${i}`,
      at: t.at,
      icon: 'git-commit-outline' as const,
      tint: COLOR.gold,
      title: t.event,
      detail: t.detail || t.goal,
    })),
  ].sort((a, b) => b.at - a.at);

  return (
    <Screen testID="activity-screen">
      <ScreenTitle
        title="ACTIVITY"
        caption={items.length ? `${items.length} events` : undefined}
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
          {items.slice(0, 40).map((item) => (
            <View key={item.key} testID={`activity-${item.key}`} style={styles.row}>
              <Ionicons name={item.icon} size={17} color={item.tint} style={styles.icon} />
              <View style={styles.text}>
                <Text style={styles.title}>{item.title}</Text>
                {item.detail ? (
                  <Text style={styles.detail} numberOfLines={3}>
                    {item.detail}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.time}>{clock(item.at)}</Text>
            </View>
          ))}
        </View>
      )}
    </Screen>
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
  title: { ...TYPE.dataLabel, fontSize: 11, color: COLOR.white, letterSpacing: 1 },
  detail: { ...TYPE.meta, fontSize: 12, color: COLOR.dim, marginTop: 3 },
  time: { ...TYPE.meta, fontSize: 11, color: COLOR.dim, marginLeft: SPACE.md },
});
