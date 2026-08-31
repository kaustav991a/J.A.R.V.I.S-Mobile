import { PHOTO_MARK, captionOf, photoTurnText } from '../photoTurn';

/**
 * The caption on a photo turn, recoverable from the turn itself.
 *
 * A photo that fails to send is the most expensive thing to lose in this app: it
 * cost a walk to wherever the picture was taken, and the caption cost the typing.
 * Retrying one means rebuilding the send from what the chat log kept — which is the
 * marker, the caption, and a local uri — so the marker has to be removable again
 * without taking the caption's own words with it.
 *
 * One place owns the marker for the same reason `shareFacts` owns its ledger: it is
 * written by the send path and read by the retry, and two spellings of it would fail
 * silently, leaving the caption with a stray emoji or the retry with none.
 */

describe('the text a photo turn carries', () => {
  it('marks a photo with no caption so the log still says one was sent', () => {
    expect(photoTurnText('')).toBe(`${PHOTO_MARK} Photo`);
  });

  it('keeps the caption beside the marker', () => {
    expect(photoTurnText('the whiteboard')).toBe(`${PHOTO_MARK} the whiteboard`);
  });

  it('trims what was typed, so a stray space is not stored as a caption', () => {
    expect(photoTurnText('  the whiteboard  ')).toBe(`${PHOTO_MARK} the whiteboard`);
  });
});

describe('reading the caption back off a turn', () => {
  it('gives back exactly what was captioned', () => {
    expect(captionOf(photoTurnText('the whiteboard'))).toBe('the whiteboard');
  });

  it('gives back nothing for a photo that never had one', () => {
    // `Photo` is the marker's own word, not something anybody typed — retrying with
    // it as the caption would put a word in his mouth
    expect(captionOf(photoTurnText(''))).toBe('');
  });

  it('leaves a caption that happens to mention a photo alone', () => {
    expect(captionOf(photoTurnText('Photo of the rig'))).toBe('Photo of the rig');
  });

  it('answers for a turn that is not a photo at all', () => {
    expect(captionOf('lock the desk')).toBe('lock the desk');
  });
});
