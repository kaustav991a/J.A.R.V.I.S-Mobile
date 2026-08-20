import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { COLOR, SPACE, TYPE, glowBox } from '../theme/tokens';
import { MicIcon } from './MicIcon';
import { Touchable } from './ui/Touchable';
import { VoiceBar } from './VoiceBar';
import { CANCEL_SLIDE_PX, LOCK_SLIDE_PX } from '../lib/voice';

export type CommandBarProps = {
  onSubmit: (text: string) => void;
  /**
   * Something staged above the field — today, a photo waiting to be sent.
   *
   * Rendered inside this component rather than beside it so the draft and the
   * caption box are visibly one thing. A preview floating above a separate bar
   * reads as a notification about a photo, not as a photo you are writing about.
   */
  attachment?: ReactNode;
  /**
   * Let SEND fire with nothing typed.
   *
   * Only true when something is attached, and it is what keeps the fast path
   * open: a photo with no caption is still the common case, and if the change
   * that added captions also made a caption compulsory, people would go back to
   * not sending photos.
   */
  allowEmptySubmit?: boolean;
  /**
   * Text to put back into the field, once.
   *
   * This bar owns its field and clears it on submit, which is right for every
   * other send. A photo whose send failed is the one case where the caption has
   * to survive having been submitted — losing a typed question to a dropped
   * socket would be worse than the immediate send it replaced.
   */
  restoreText?: string | null;
  onRestored?: () => void;
  /** tapping the mic, where there is nothing to hold — e.g. a screen with no recorder */
  onVoice?: () => void;
  /**
   * Hold to record, release to send.
   *
   * A press pair rather than a tap toggle: a recording left running because the
   * second tap missed is a live microphone the user believes is off. A press that
   * ends when the finger lifts cannot be left on. When these are given, `onVoice`
   * is ignored.
   */
  onVoiceStart?: () => void;
  onVoiceEnd?: () => void;
  /**
   * Live recording state. When `active`, this bar becomes the recorder — see the
   * branch in the body. Supplied by whoever owns the recorder, since the timer and
   * the meter come from it.
   */
  voice?: {
    active: boolean;
    locked: boolean;
    elapsedMs: number;
    level: number;
    cancelProgress: number;
    onCancel: () => void;
    onSend: () => void;
  };
  /** the finger moved while holding the mic — drives lock and cancel */
  onVoiceMove?: (dx: number, dy: number) => void;
  /** tints the mic and lights its capsule while capture is running */
  listening?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** optional glyph before the field, e.g. the sparkle on the Home tab */
  leadingIcon?: keyof typeof Ionicons.glyphMap;
  /**
   * Offer a camera in place of the leading glyph. Absent on screens that have
   * nothing to do with photos, which is most of them.
   */
  onCamera?: () => void;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function CommandBar({
  onSubmit,
  onVoice,
  onVoiceStart,
  onVoiceEnd,
  onVoiceMove,
  voice,
  listening = false,
  disabled = false,
  placeholder = 'Speak or type…',
  leadingIcon,
  onCamera,
  attachment,
  allowEmptySubmit = false,
  restoreText,
  onRestored,
}: CommandBarProps) {
  const [text, setText] = useState('');

  /**
   * Put a caption back after a failed send.
   *
   * `onRestored` fires so the owner can drop it — without that the effect would
   * re-fill the field on every render that followed, and typing over it would be
   * undone a keystroke later.
   */
  useEffect(() => {
    if (restoreText === null || restoreText === undefined) return;
    setText(restoreText);
    onRestored?.();
  }, [restoreText, onRestored]);
  const hasText = text.trim().length > 0 || allowEmptySubmit;
  const holdToTalk = Boolean(onVoiceStart && onVoiceEnd);

  const submit = () => {
    const trimmed = text.trim();
    if (disabled) return;
    if (!trimmed && !allowEmptySubmit) return;
    onSubmit(trimmed);
    setText('');
    // Sending from the return key blurs the field on its own — that is the
    // single-line TextInput default — but the SEND button never did, so the same
    // action left the keyboard up or down depending on which one you used.
    // Dismissing here makes both paths the one behaviour.
    Keyboard.dismiss();
  };

  const micColor = listening ? COLOR.green : COLOR.blue;

  /**
   * The mic follows the finger.
   *
   * The gesture worked without this and felt stiff, because nothing moved: the
   * thresholds were invisible until they fired. Dragging the icon makes the travel
   * its own progress indicator — you can see how much further to go, and see it
   * stop when the gesture has committed.
   *
   * Assigned directly rather than through `withTiming` while dragging: a tween
   * between finger positions is a lag, not a smoothing. The spring is only for the
   * return, where there is no finger left to follow.
   */
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const micStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }, { translateY: dragY.value }],
  }));

  const settleMic = () => {
    origin.current = null;
    dragX.value = withSpring(0, { damping: 18, stiffness: 220 });
    dragY.value = withSpring(0, { damping: 18, stiffness: 220 });
  };

  const trackTouch = (x: number, y: number) => {
    if (!origin.current) origin.current = { x, y };
    const dx = x - origin.current.x;
    const dy = y - origin.current.y;
    // only the two directions that mean something, and never past the threshold
    dragX.value = Math.max(-CANCEL_SLIDE_PX, Math.min(0, dx));
    dragY.value = Math.max(-LOCK_SLIDE_PX, Math.min(0, dy));
    onVoiceMove?.(x, y);
  };

  /**
   * While recording, the composer *is* the recorder.
   *
   * Leaving the text field in place and only tinting the mic said a recording had
   * started and nothing else — not how long, not whether the mic could hear
   * anything, not how to stop without sending. The whole row is given over to that
   * instead, which is also what makes room for the cancel and lock targets.
   */
  const recordingNow = Boolean(voice?.active);

  /**
   * One tree for both states, and the mic keeps its place in it.
   *
   * The recorder UI used to be an early `return`, which unmounted this Pressable —
   * and with it went the touch it owned. Releasing sent nothing and the slides
   * reported nothing, because `onPressOut` and `onTouchMove` belong to a view that
   * no longer existed. Only the bin button worked, since it was part of the
   * replacement.
   *
   * So the middle of the bar changes and the mic does not. The keys are what
   * guarantee that: React matches keyed children across renders regardless of how
   * many siblings appear or vanish beside them.
   */
  /**
   * The bar itself, always inside the same wrapper.
   *
   * The wrapper is unconditional and that is deliberate, having first been
   * written the other way round. Returning the bare row when nothing is attached
   * and a wrapped row when something is changes the element at the root, so React
   * reconciles the old bar's children — the field, the mic, the send — against
   * the new wrapper's, finds nothing matching, and remounts the lot. Attaching a
   * photo would have torn down and rebuilt the text field it sits above, taking
   * focus with it.
   *
   * Constant shape instead: `attachment` is a child that goes from null to an
   * element, which mounts one thing and leaves the row alone.
   */
  const row = (
    <View style={[styles.bar, disabled && styles.disabled, recordingNow && styles.recording]}>
      {recordingNow && voice ? (
        <VoiceBar
          key="middle"
          elapsedMs={voice.elapsedMs}
          level={voice.level}
          locked={voice.locked}
          cancelProgress={voice.cancelProgress}
          onCancel={voice.onCancel}
          onSend={voice.onSend}
        />
      ) : (
        <View key="middle" style={styles.typing}>
          {/* The camera takes the leading glyph's place rather than adding a
              fourth thing to the row: a bar with an icon, a field, a camera and a
              mic has no room left for the field, which is what people came for.
              Screens that pass no `onCamera` keep the plain sparkle. */}
          {onCamera ? (
            <Touchable
              testID="command-camera"
              accessibilityRole="button"
              accessibilityLabel="Send a photo"
              hitSlop={10}
              disabled={disabled}
              onPress={onCamera}
            >
              <Ionicons name="camera-outline" size={19} color={COLOR.blue} />
            </Touchable>
          ) : leadingIcon ? (
            <Ionicons name={leadingIcon} size={17} color={COLOR.blue} />
          ) : null}
          <TextInput
            testID="command-input"
            style={styles.input}
            value={text}
            onChangeText={setText}
            onSubmitEditing={submit}
            placeholder={placeholder}
            placeholderTextColor={COLOR.dim}
            editable={!disabled}
            returnKeyType="send"
            autoCapitalize="none"
            autoCorrect={false}
            selectionColor={COLOR.blue}
          />
        </View>
      )}

      <AnimatedPressable
        key="mic"
        testID="command-voice"
        accessibilityRole="button"
        accessibilityLabel={holdToTalk ? 'Hold to speak' : 'Voice command'}
        // `onPressOut` fires when the finger lifts *or* leaves the button, so a
        // drag away still ends the recording rather than leaving the mic live
        onPressIn={holdToTalk ? onVoiceStart : undefined}
        onPressOut={
          holdToTalk
            ? () => {
                settleMic();
                onVoiceEnd?.();
              }
            : undefined
        }
        onPress={holdToTalk ? undefined : onVoice}
        // Where the slide gestures are read. `onTouchMove` rather than a
        // gesture-handler Pan: the press already belongs to this Pressable, and a
        // Pan competing for the same touch turns a quick hold into neither a press
        // nor a pan. The coordinates are absolute, so the owner does its own
        // arithmetic against where the finger started.
        onTouchMove={
          holdToTalk && onVoiceMove
            ? (e) => trackTouch(e.nativeEvent.pageX, e.nativeEvent.pageY)
            : undefined
        }
        disabled={disabled}
        hitSlop={10}
        /**
         * The press must survive the finger wandering.
         *
         * `onPressOut` fires as soon as the touch leaves the button, so sliding
         * left to cancel — 96px away — ended the press long before the gesture
         * reached its threshold, and the clip sent itself. This keeps the press
         * alive across the whole area the slides use: generously left, where cancel
         * lives, and well above, where lock does.
         */
        pressRetentionOffset={{ top: 160, bottom: 80, left: 220, right: 120 }}
        style={[styles.mic, listening && { borderColor: COLOR.green }, listening && glowBox(COLOR.green, 10), micStyle]}
      >
        <MicIcon color={micColor} active={listening} />
      </AnimatedPressable>

      {recordingNow ? null : (
        <Pressable
          key="send"
          testID="command-send"
          accessibilityRole="button"
          accessibilityLabel="Send command"
          onPress={submit}
          disabled={disabled}
          hitSlop={10}
        >
          <Text style={[styles.send, !hasText && styles.sendIdle]}>SEND</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={styles.stacked}>
      {attachment}
      {row}
    </View>
  );
}

const styles = StyleSheet.create({
  stacked: { alignSelf: 'stretch' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    backgroundColor: COLOR.panel,
    paddingLeft: SPACE.lg,
    paddingRight: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  recording: { paddingLeft: SPACE.sm, paddingRight: SPACE.md },
  typing: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  disabled: { opacity: 0.4 },
  input: {
    flex: 1,
    ...TYPE.dataValue,
    color: COLOR.white,
    paddingVertical: SPACE.xs,
  },
  mic: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    backgroundColor: COLOR.blueDim,
  },
  send: { ...TYPE.panelTitle, color: COLOR.blue },
  sendIdle: { color: COLOR.dim },
});
