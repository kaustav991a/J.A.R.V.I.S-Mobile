import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { COLOR, FONT, SPACE } from '../../theme/tokens';
import { parseRich } from '../../lib/rich';
import type { Block, Span } from '../../lib/rich';

/**
 * The brain's markdown, rendered.
 *
 * Lives here rather than in `Atoms.tsx` on purpose: nothing outside the chat
 * needs it, and a chat concern that moves into the shared atoms becomes a global
 * one that every screen then has an opinion about.
 *
 * **The outermost element is a single `<Text>`.** That is load-bearing, not
 * stylistic: text selection in the bubble survives a tree of nested `<Text>` and
 * does not survive a `<View>` of `<Text>`s — the bubble is selectable today and
 * must stay so. The only things that break out into `<View>`s are the two that
 * genuinely cannot be inline, a fenced block and a bullet's gutter, and both are
 * rendered as separate blocks rather than inside the paragraph flow.
 */

function marksFor(span: Span): TextStyle | null {
  if (span.code) return styles.code;
  if (span.bold && span.italic) return styles.boldItalic;
  if (span.bold) return styles.bold;
  if (span.italic) return styles.italic;
  return null;
}

function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((s, i) => (
        // index keys: spans are positional and the whole line re-renders as the
        // reply streams in, so there is no identity to preserve
        <Text key={i} style={marksFor(s)}>
          {s.text}
        </Text>
      ))}
    </>
  );
}

/**
 * A fenced block, and the reason it scrolls.
 *
 * The brain quotes commands — `adb shell dumpsys jobscheduler` is longer than any
 * phone is wide. Wrapping one across four lines makes it unreadable and unusable,
 * and letting it size the bubble pushes the whole conversation off screen. So the
 * block scrolls inside itself and nothing outside it moves.
 */
function CodeBlock({ text }: { text: string }) {
  return (
    <View style={styles.fence}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text style={styles.fenceText}>{text}</Text>
      </ScrollView>
    </View>
  );
}

function BlockView({ block, base }: { block: Block; base: StyleProp<TextStyle> }) {
  if (block.kind === 'code') return <CodeBlock text={block.text} />;
  if (block.kind === 'bullet') {
    return (
      <View style={styles.bulletRow}>
        <Text style={[base, styles.marker]}>{block.marker}</Text>
        <Text style={[base, styles.bulletBody]}>
          <Spans spans={block.spans} />
        </Text>
      </View>
    );
  }
  return (
    <Text style={base}>
      <Spans spans={block.spans} />
    </Text>
  );
}

export function RichText({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const blocks = parseRich(text);
  const base = style ?? null;

  // Nothing to lay out. An empty reply is not this component's problem to
  // announce — the caller decides what an absence means.
  if (!blocks.length) return null;

  /**
   * The common case is one paragraph, and it stays one `<Text>`.
   *
   * Worth the branch: an ordinary reply is a sentence, and wrapping every one of
   * those in a `<View>` would cost the bubble its selection behaviour for the
   * sake of a list it does not contain.
   */
  if (blocks.length === 1 && blocks[0]?.kind === 'para') {
    return <BlockView block={blocks[0]} base={base} />;
  }

  return (
    <View style={styles.stack}>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} base={base} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.xs },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  boldItalic: { fontWeight: '700', fontStyle: 'italic' },
  /**
   * Inline code is tinted rather than boxed. A background on an inline `<Text>`
   * draws a rectangle that ignores the line box on Android and clips against the
   * line above it — the colour carries the distinction on its own, and the accent
   * is already this app's "this is a value" signal.
   */
  code: { fontFamily: FONT.data, color: COLOR.blueBright },
  bulletRow: { flexDirection: 'row', gap: SPACE.xs },
  // fixed width so the text edges of consecutive bullets line up, and the number
  // in "10." does not push its line further right than "1." does
  marker: { minWidth: 18, color: COLOR.blue },
  bulletBody: { flex: 1 },
  fence: {
    backgroundColor: COLOR.blueDim,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xs,
  },
  fenceText: { fontFamily: FONT.data, fontSize: 12, lineHeight: 18, color: COLOR.blueBright },
});
