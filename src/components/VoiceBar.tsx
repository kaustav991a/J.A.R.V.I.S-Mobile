import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Touchable } from './ui/Touchable';
import { COLOR, SPACE, TYPE } from '../theme/tokens';

/** how many bars the meter draws; enough to read as a level, few enough to stay cheap */
const BARS = 18;

const mmss = (ms: number): string => {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export type VoiceBarProps = {
  elapsedMs: number;
  /** 0..1, from the recorder's metering */
  level: number;
  /**
   * Hands-free: the finger has been lifted and recording continues. Changes what
   * the bar offers — a lifted finger cannot slide anywhere, so the gestures are
   * replaced by buttons.
   */
  locked: boolean;
  /** how far the finger has slid toward cancelling, 0..1 */
  cancelProgress: number;
  onCancel: () => void;
  onSend: () => void;
};

/**
 * What the composer becomes while recording.
 *
 * Everything here is feedback the previous version did not give: a mic capsule
 * turning green told you a recording had started but not that it was *hearing*
 * anything, nor for how long, nor how to stop without sending.
 *
 * The meter is driven by real metering (dBFS mapped over a -60 floor), so a bar
 * that does not move means the microphone is not picking you up — which is a fault
 * worth being able to see before you send twenty seconds of silence to a
 * transcriber.
 */
export function VoiceBar({ elapsedMs, level, locked, cancelProgress, onCancel, onSend }: VoiceBarProps) {
  // the tallest bars sit in the middle, so speech reads as a shape rather than a
  // row of equal blocks
  const shape = (i: number) => {
    const middle = 1 - Math.abs(i - (BARS - 1) / 2) / ((BARS - 1) / 2);
    return 4 + level * (4 + middle * 18);
  };

  const cancelling = cancelProgress > 0.15;

  return (
    <View testID="voice-bar" style={styles.row}>
      <Touchable
        testID="voice-cancel"
        accessibilityRole="button"
        accessibilityLabel="Cancel recording"
        hitSlop={12}
        onPress={onCancel}
      >
        <Ionicons name="trash-outline" size={22} color={cancelling ? COLOR.red : COLOR.dim} />
      </Touchable>

      <View style={styles.middle}>
        <View style={styles.timeRow}>
          <View style={[styles.dot, { opacity: locked ? 1 : 0.35 + level * 0.65 }]} />
          <Text testID="voice-elapsed" style={styles.time}>
            {mmss(elapsedMs)}
          </Text>
        </View>

        {/* the hint is the gesture that is actually available: a lifted finger
            cannot slide, so once locked it says what the buttons do instead */}
        <Text testID="voice-hint" style={[styles.hint, cancelling && { color: COLOR.red }]} numberOfLines={1}>
          {locked ? 'Hands free — tap send, or bin it' : cancelling ? 'Release to cancel' : '‹ slide to cancel · slide up to lock'}
        </Text>

        <View style={styles.meter}>
          {Array.from({ length: BARS }, (_, i) => (
            <View
              key={i}
              style={[
                styles.bar,
                { height: shape(i), backgroundColor: cancelling ? COLOR.red : COLOR.green },
              ]}
            />
          ))}
        </View>
      </View>

      {locked ? (
        <Touchable
          testID="voice-send"
          accessibilityRole="button"
          accessibilityLabel="Send recording"
          hitSlop={12}
          onPress={onSend}
        >
          <Ionicons name="arrow-up-circle" size={30} color={COLOR.green} />
        </Touchable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingLeft: SPACE.sm },
  middle: { flex: 1, gap: 2 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  dot: { width: 8, height: 8, borderRadius: 999, backgroundColor: COLOR.red },
  time: { ...TYPE.dataValue, fontSize: 15, color: COLOR.white },
  hint: { ...TYPE.dataLabel, color: COLOR.dim },
  meter: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 26, marginTop: 2 },
  bar: { width: 3, borderRadius: 999 },
});
