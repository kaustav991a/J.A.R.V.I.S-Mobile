import { useEffect, useRef, useState } from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';

export type TypeLineProps = {
  text: string;
  style?: StyleProp<TextStyle>;
  /** ms between characters */
  speed?: number;
  /** ms to wait before the first character */
  delay?: number;
  /** false types nothing and shows the whole line, for the animations toggle */
  enabled?: boolean;
  testID?: string;
};

/**
 * A line that types itself out, one character at a time.
 *
 * It runs on a plain interval rather than on reanimated: the thing being
 * animated is the string itself, not a style, so there is nothing for the UI
 * thread to interpolate.
 */
export function TypeLine({ text, style, speed = 45, delay = 250, enabled = true, testID }: TypeLineProps) {
  const [shown, setShown] = useState(enabled ? '' : text);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];

    if (!enabled) {
      setShown(text);
      return;
    }

    setShown('');
    // one timer per character, so a changed `text` mid-run cannot interleave
    for (let i = 1; i <= text.length; i++) {
      timers.current.push(setTimeout(() => setShown(text.slice(0, i)), delay + i * speed));
    }

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [text, speed, delay, enabled]);

  return (
    <Text testID={testID} style={style} numberOfLines={1}>
      {shown}
    </Text>
  );
}
