import { useContext, useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { HeaderHeightContext } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CommandBar } from '../components/CommandBar';
import { ScreenTitle } from '../components/ui/ScreenTitle';
import { EmptyState } from '../components/ui/Atoms';
import { Touchable } from '../components/ui/Touchable';
import { Glass } from '../components/ui/Glass';
import { useToast } from '../components/ui/Toast';
import { CHROME, COLOR, RADIUS, SCRIM, SPACE, TYPE } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';
import { useJarvis } from '../state/JarvisProvider';
import type { ChatEntry } from '../state/hudReducer';
import type { CommandsStackParams } from '../navigation/types';

const SUGGESTIONS = ['system status', 'open browser', 'take screenshot', 'list files'];

/**
 * Roughly the length of Android's own keyboard animation, so the composer looks
 * like it is riding the keyboard rather than chasing it. Decelerating, because it
 * is following something that has already started moving.
 */
const KEYBOARD_MS = 220;
const KEYBOARD_EASE = Easing.out(Easing.quad);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * A time for today's turns, a date and time for anything older.
 *
 * A bare `14:32` is unambiguous only while the log dies with the app. Once it
 * survives a restart, the same string could be from any day, so the date has to
 * appear — but only where it carries information: stamping today's turns with
 * today's date is noise on every line.
 */
const clock = (at: number): string => {
  const d = new Date(at);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (sameDay) return time;
  const stamp = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  // the year only when it is not this one — it is almost never the useful part
  return d.getFullYear() === now.getFullYear() ? `${stamp}, ${time}` : `${stamp} ${d.getFullYear()}, ${time}`;
};

/**
 * The conversation, both directions, as it happens.
 *
 * This is the tab that used to be a command box over a list of past strings.
 * Once voice lands, a transcript is just another user turn, so the same panel
 * carries it — there is no separate voice surface to build.
 *
 * It does not use `Screen`: a chat is a list pinned to a composer, not a page
 * that scrolls as a whole. The list is inverted, which is what keeps the newest
 * turn against the composer while the keyboard opens and closes.
 */
export function ChatScreen() {
  const nav = useNavigation<NativeStackNavigationProp<CommandsStackParams>>();
  const insets = useSafeAreaInsets();
  const headerHeight = useContext(HeaderHeightContext);
  const { accent, animations } = useAppearance();
  const { hud, sendCommand, connected } = useJarvis();
  const toast = useToast();
  const list = useRef<FlatList<ChatEntry>>(null);

  // newest first, because the list is inverted
  const turns = [...hud.chat].reverse();
  const thinking = hud.status === 'thinking' || hud.status === 'agent';

  useEffect(() => {
    if (turns.length) list.current?.scrollToOffset({ offset: 0, animated: true });
  }, [turns.length]);

  /**
   * Lift the composer by the keyboard's measured height.
   *
   * `softwareKeyboardLayoutMode: resize` does not resize an edge-to-edge
   * Android window — the app owns its insets there, and assuming otherwise is
   * what left the composer sitting under the keyboard with the newest turn
   * hidden behind it. So take the height the event reports and pad by it.
   */
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
      list.current?.scrollToOffset({ offset: 0, animated: true });
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const typing = keyboardHeight > 0;

  const send = (text: string) => {
    void sendCommand(text).catch(() => {});
    if (!connected) toast.show('No link — answered locally', 'bad');
  };

  // iOS lifts the whole view itself, so only Android pays the keyboard height
  const lift = Platform.OS === 'android' ? keyboardHeight : 0;
  // 20 clear of the keyboard: sitting flush on it leaves the field looking
  // stuck to the keys, and the newest turn crowded right behind the composer
  const bottom = typing
    ? lift + SPACE.xl
    : CHROME.tabBarHeight + Math.max(insets.bottom, CHROME.tabBarGap) + SPACE.sm;

  /**
   * Glide the composer to its new resting place instead of snapping to it.
   *
   * Applying `bottom` directly moved the composer the entire keyboard height in a
   * single frame, which is the jump. This follows it instead.
   *
   * It is not keyboard-tracking: Android only reports `keyboardDidShow`, which
   * fires once the keyboard has finished coming up, so the glide starts at the
   * end of the system animation and trails it slightly. True 1:1 following needs
   * reanimated's `useAnimatedKeyboard`, which disables Android's automatic resize
   * for the *whole app* and takes over insets management — too broad a change to
   * make for one screen without being able to test the other one.
   */
  const shift = useSharedValue(bottom);
  useEffect(() => {
    shift.value = animations
      ? withTiming(bottom, { duration: KEYBOARD_MS, easing: KEYBOARD_EASE })
      : bottom;
  }, [bottom, animations, shift]);

  const composerStyle = useAnimatedStyle(() => ({ paddingBottom: shift.value }));

  return (
    <View style={styles.root} testID="chat-screen">
      <LinearGradient colors={[...SCRIM]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight ?? 0}
      >
        <View style={[styles.head, { paddingTop: Math.max(headerHeight ?? 0, insets.top) + SPACE.md }]}>
          <ScreenTitle title="CHAT" caption={turns.length ? `${turns.length} turns` : undefined} />
        </View>

        {turns.length === 0 ? (
          <View style={styles.empty}>
            <EmptyState
              testID="chat-empty"
              text="No conversation yet"
              hint="Say something below, or tap one of these."
            />
            <View style={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <Touchable
                  key={s}
                  testID={`suggest-${s}`}
                  accessibilityRole="button"
                  accessibilityLabel={s}
                  onPress={() => send(s)}
                  style={styles.chip}
                >
                  <Text style={styles.chipText}>{s}</Text>
                </Touchable>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={list}
            testID="chat-list"
            data={turns}
            inverted
            keyExtractor={(t, i) => `${t.at}-${i}`}
            contentContainerStyle={styles.listBody}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={thinking ? <Typing accent={accent} /> : null}
            renderItem={({ item }) => (
              <Bubble
                entry={item}
                accent={accent}
                // a long reply is easier to read as terminal output
                onPress={() =>
                  item.from === 'jarvis'
                    ? nav.navigate('CommandResult', { command: 'jarvis', output: item.text })
                    : undefined
                }
              />
            )}
          />
        )}

        <Glass radius={0} sheen style={[styles.composer, composerStyle]}>
          <CommandBar
            placeholder="Message Jarvis…"
            leadingIcon="sparkles"
            onSubmit={send}
            onVoice={() => toast.show('Voice is not wired up yet')}
          />
        </Glass>
      </KeyboardAvoidingView>
    </View>
  );
}

function Bubble({ entry, accent, onPress }: { entry: ChatEntry; accent: string; onPress?: () => void }) {
  const mine = entry.from === 'user';
  return (
    <Touchable
      testID={`turn-${entry.at}`}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${mine ? 'You' : 'Jarvis'}: ${entry.text}`}
      onPress={onPress}
      sink={onPress ? 0.01 : 0}
      style={[styles.turn, mine ? styles.turnMine : styles.turnTheirs]}
    >
      <View
        style={[
          styles.bubble,
          mine ? { backgroundColor: `${accent}1f`, borderColor: `${accent}44` } : styles.bubbleTheirs,
        ]}
      >
        <Text style={[styles.text, mine ? styles.textMine : null]}>{entry.text}</Text>
      </View>
      <Text style={styles.time}>{`${mine ? 'You' : 'Jarvis'} · ${clock(entry.at)}`}</Text>
    </Touchable>
  );
}

/** three dots while the desk is working, so a slow answer never looks dropped */
function Typing({ accent }: { accent: string }) {
  return (
    <View testID="chat-typing" style={[styles.turn, styles.turnTheirs]}>
      <View style={[styles.bubble, styles.bubbleTheirs, styles.typing]}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.typingDot, { backgroundColor: accent, opacity: 0.4 + i * 0.25 }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.bg },
  fill: { flex: 1 },
  head: { paddingHorizontal: SPACE.lg },
  empty: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACE.lg, gap: SPACE.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, justifyContent: 'center' },
  chip: {
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    backgroundColor: COLOR.blueDim,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  chipText: { ...TYPE.dataLabel, fontSize: 11, color: COLOR.white },
  listBody: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.md },
  turn: { marginBottom: SPACE.md, maxWidth: '86%' },
  turnMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  turnTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: {
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  bubbleTheirs: { backgroundColor: COLOR.panel, borderColor: COLOR.line },
  text: { ...TYPE.meta, fontSize: 13, lineHeight: 20, color: COLOR.white },
  textMine: { color: COLOR.white },
  time: { ...TYPE.dataLabel, fontSize: 9, color: COLOR.dim, marginTop: 4, letterSpacing: 1 },
  typing: { flexDirection: 'row', gap: 5, paddingVertical: SPACE.md + 2 },
  typingDot: { width: 6, height: 6, borderRadius: 3 },
  composer: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.sm },
});
