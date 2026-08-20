/**
 * The small piece of markdown the brain actually writes, parsed.
 *
 * Seen on the device 2026-08-20: a reply from 08:29 had been sitting in the chat
 * reading `**10 mins**: Warm-up (dynamic stretches)` — punctuation showing —
 * because the model emits markdown and the bubble passed `entry.text` straight
 * into a `<Text>`. Every list the brain has ever sent looked like that.
 *
 * **Rendered rather than stripped**, and that was the whole decision. Telling the
 * persona "no markdown" fights a habit the model keeps reaching for, and it
 * throws away structure that is genuinely there: a workout list really is a list,
 * and a quoted command really is code. The asterisks are the problem, not what
 * they mark.
 *
 * **A deliberately small subset.** Bold, italic, inline code, fenced code, and
 * one level of bullets. No tables, links, headings or images — a full markdown
 * engine in a chat bubble is a dependency and a new class of layout bug, and
 * nothing in this conversation has ever needed one. If something turns up looking
 * wrong, add that one thing then.
 */

export type Span = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
};

export type Block =
  | { kind: 'para'; spans: Span[] }
  /** `marker` is what to draw in the gutter — a bullet, or the number as written */
  | { kind: 'bullet'; marker: string; spans: Span[] }
  /** fenced. `text` is verbatim: nothing inside a fence is markup */
  | { kind: 'code'; text: string };

const FENCE = /^\s*```/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*(\d{1,2}\.)\s+(.*)$/;

/**
 * Whether a delimiter at `i` can open a run.
 *
 * The rule that keeps `5*3` as arithmetic. An opener must be followed by
 * something that is not a space, and must not be preceded by a digit — otherwise
 * "5*3 sets" reads as an italic "3 sets" that nobody wrote, and a chat that
 * invents emphasis is worse than one that shows an asterisk.
 */
function canOpen(text: string, i: number, len: number): boolean {
  const after = text[i + len];
  if (after === undefined || after === ' ' || after === '\t') return false;
  const before = text[i - 1];
  if (before !== undefined && /\d/.test(before)) return false;
  return true;
}

/** A closer must not be preceded by a space, for the same reason in reverse. */
function canClose(text: string, i: number): boolean {
  const before = text[i - 1];
  return before !== undefined && before !== ' ' && before !== '\t';
}

/**
 * Find the closing delimiter for a run opened at `from`, or -1.
 *
 * -1 is the answer that matters. An unmatched `**` is not markup, it is a token
 * that has half arrived — `TypeLine` feeds this parser a growing prefix of every
 * reply, so mid-token is the normal state, not an error. The caller emits the
 * delimiter as literal text and moves on.
 */
function closerAt(text: string, from: number, delim: string): number {
  let i = from;
  while (i < text.length) {
    const at = text.indexOf(delim, i);
    if (at < 0) return -1;
    if (at > from && canClose(text, at)) return at;
    i = at + delim.length;
  }
  return -1;
}

/** Merge neighbours that carry the same marks, so prose stays one span. */
function pack(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const s of spans) {
    if (!s.text) continue;
    const last = out[out.length - 1];
    if (
      last &&
      !!last.bold === !!s.bold &&
      !!last.italic === !!s.italic &&
      !!last.code === !!s.code
    ) {
      last.text += s.text;
      continue;
    }
    out.push({ ...s });
  }
  return out;
}

/** One line of inline markup into spans. Never throws; worst case it is all text. */
function inline(line: string): Span[] {
  const spans: Span[] = [];
  let plain = '';
  let i = 0;

  const flush = () => {
    if (plain) spans.push({ text: plain });
    plain = '';
  };

  while (i < line.length) {
    const two = line.slice(i, i + 2);
    const one = line[i];

    // `**bold**` before `*italic*`, or the first star of a bold run would open an
    // italic and the pair would never match
    if (two === '**' && canOpen(line, i, 2)) {
      const end = closerAt(line, i + 2, '**');
      if (end > i + 2) {
        flush();
        spans.push({ text: line.slice(i + 2, end), bold: true });
        i = end + 2;
        continue;
      }
    }

    if (one === '*' && two !== '**' && canOpen(line, i, 1)) {
      const end = closerAt(line, i + 1, '*');
      if (end > i + 1) {
        flush();
        spans.push({ text: line.slice(i + 1, end), italic: true });
        i = end + 1;
        continue;
      }
    }

    if (one === '`') {
      const end = line.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        // verbatim: whatever is between backticks is what was meant, markup or not
        spans.push({ text: line.slice(i + 1, end), code: true });
        i = end + 1;
        continue;
      }
    }

    plain += one;
    i += 1;
  }
  flush();
  return pack(spans);
}

/**
 * Parse a reply into blocks.
 *
 * Total: every input is a document, including a half-arrived one. There is no
 * error case, because the caller renders this on every frame of a streaming
 * answer and a throw there would be a throw per frame.
 */
export function parseRich(text: string): Block[] {
  const src = (text ?? '').replace(/\r\n/g, '\n');
  if (!src.trim()) return [];

  const blocks: Block[] = [];
  const lines = src.split('\n');
  let i = 0;
  let para: string[] = [];

  const endPara = () => {
    if (!para.length) return;
    const joined = para.join(' ').trim();
    if (joined) blocks.push({ kind: 'para', spans: inline(joined) });
    para = [];
  };

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (FENCE.test(line)) {
      endPara();
      const body: string[] = [];
      i += 1;
      // An unclosed fence is still code. It is what a streaming reply looks like
      // halfway through one, and showing the command is more use than showing
      // three backticks and waiting.
      while (i < lines.length && !FENCE.test(lines[i] ?? '')) {
        body.push(lines[i] ?? '');
        i += 1;
      }
      i += 1;
      blocks.push({ kind: 'code', text: body.join('\n').replace(/\n+$/, '') });
      continue;
    }

    const numbered = NUMBERED.exec(line);
    if (numbered) {
      endPara();
      blocks.push({ kind: 'bullet', marker: numbered[1] ?? '1.', spans: inline(numbered[2] ?? '') });
      i += 1;
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      endPara();
      // one level only, and the marker is normalised: the model alternates between
      // `-` and `*` inside a single list and the reader should not have to see that
      blocks.push({ kind: 'bullet', marker: '•', spans: inline(bullet[1] ?? '') });
      i += 1;
      continue;
    }

    if (!line.trim()) {
      endPara();
      i += 1;
      continue;
    }

    para.push(line);
    i += 1;
  }
  endPara();
  return blocks;
}

/**
 * The same text with the markup taken out, for the screen reader.
 *
 * `ChatScreen.tsx` reads the bubble's text into an `accessibilityLabel`, and it
 * has to go on reading the words. Reading "star star ten mins star star" aloud
 * would be a regression dressed as a feature — and reading the parsed tree would
 * be worse, because the marks are not speakable at all.
 */
export function plainText(text: string): string {
  return parseRich(text)
    .map((b) => (b.kind === 'code' ? b.text : b.spans.map((s) => s.text).join('')))
    .join('\n');
}
