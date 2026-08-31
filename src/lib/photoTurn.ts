/**
 * The text a photo turn carries in the chat log, and how to read it back.
 *
 * A photo turn is a line of text with a picture attached, because the log is text
 * and the picture may not survive — Android is entitled to clear the cache the uri
 * points into, and the record of *having sent one* has to outlive the file.
 *
 * This exists as its own module because the marker is now written by one path and
 * read by another: the send composes it, and a failed send's retry takes it apart
 * again to recover the caption somebody typed. Two spellings of the same marker
 * would fail silently — a stray emoji left on the caption, or a retry that sends the
 * word "Photo" as though it had been typed.
 */

/** the one place this emoji is written, and the only place it is matched */
export const PHOTO_MARK = '📷';

/** the marker's own word for a photo nobody captioned; never treated as a caption */
const UNCAPTIONED = 'Photo';

export function photoTurnText(caption: string): string {
  const said = caption.trim();
  return `${PHOTO_MARK} ${said || UNCAPTIONED}`;
}

/**
 * The caption a photo turn was sent with, or empty for one that had none.
 *
 * Empty rather than `Photo` for the uncaptioned case: that word is the marker's,
 * not his, and a retry that sent it would be putting a word in his mouth — the same
 * rule the transcript path follows about who is recorded as having said what.
 */
export function captionOf(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith(PHOTO_MARK)) return trimmed;
  const rest = trimmed.slice(PHOTO_MARK.length).trim();
  return rest === UNCAPTIONED ? '' : rest;
}
