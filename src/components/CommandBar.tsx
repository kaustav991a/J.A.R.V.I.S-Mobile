import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLOR, SPACE, TYPE } from '../theme/tokens';

export type CommandBarProps = {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export function CommandBar({ onSubmit, disabled = false, placeholder = 'speak or type…' }: CommandBarProps) {
  const [text, setText] = useState('');

  const submit = () => {
    const trimmed = text.trim();
    if (disabled || !trimmed) return;
    onSubmit(trimmed);
    setText('');
  };

  return (
    <View style={[styles.bar, disabled && styles.disabled]}>
      <Text style={styles.caret}>▸</Text>
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
      />
      <Pressable testID="command-send" onPress={submit} disabled={disabled} hitSlop={8}>
        <Text style={styles.send}>SEND</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.cyan,
    backgroundColor: COLOR.panel,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  disabled: { opacity: 0.4 },
  caret: { ...TYPE.dataValue, color: COLOR.cyan },
  input: { flex: 1, ...TYPE.dataValue, color: COLOR.cyan, paddingVertical: SPACE.xs },
  send: { ...TYPE.panelTitle, color: COLOR.cyan },
});
