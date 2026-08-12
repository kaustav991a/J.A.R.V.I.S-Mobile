import { useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLOR, SPACE, TYPE, glowBox } from '../theme/tokens';
import { MicIcon } from './MicIcon';

export type CommandBarProps = {
  onSubmit: (text: string) => void;
  /** tapping the mic. Voice capture itself is not wired up yet. */
  onVoice?: () => void;
  /** tints the mic and lights its capsule while capture is running */
  listening?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** optional glyph before the field, e.g. the sparkle on the Home tab */
  leadingIcon?: keyof typeof Ionicons.glyphMap;
};

export function CommandBar({
  onSubmit,
  onVoice,
  listening = false,
  disabled = false,
  placeholder = 'Speak or type…',
  leadingIcon,
}: CommandBarProps) {
  const [text, setText] = useState('');
  const hasText = text.trim().length > 0;

  const submit = () => {
    const trimmed = text.trim();
    if (disabled || !trimmed) return;
    onSubmit(trimmed);
    setText('');
    // Sending from the return key blurs the field on its own — that is the
    // single-line TextInput default — but the SEND button never did, so the same
    // action left the keyboard up or down depending on which one you used.
    // Dismissing here makes both paths the one behaviour.
    Keyboard.dismiss();
  };

  const micColor = listening ? COLOR.green : COLOR.blue;

  return (
    <View style={[styles.bar, disabled && styles.disabled]}>
      {leadingIcon ? <Ionicons name={leadingIcon} size={17} color={COLOR.blue} /> : null}
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

      <Pressable
        testID="command-voice"
        accessibilityRole="button"
        accessibilityLabel="Voice command"
        onPress={onVoice}
        disabled={disabled}
        hitSlop={10}
        style={[styles.mic, listening && { borderColor: COLOR.green }, listening && glowBox(COLOR.green, 10)]}
      >
        <MicIcon color={micColor} active={listening} />
      </Pressable>

      <Pressable
        testID="command-send"
        accessibilityRole="button"
        accessibilityLabel="Send command"
        onPress={submit}
        disabled={disabled}
        hitSlop={10}
      >
        <Text style={[styles.send, !hasText && styles.sendIdle]}>SEND</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
