import { CLIP_FORMAT, METER_FLOOR_DB, MIN_CLIP_MS, RECORDING, meterLevel } from '../voice';

describe('meterLevel', () => {
  it('maps dBFS onto something a bar can be drawn from', () => {
    // metering arrives as decibels below full scale: 0 is clipping, and a quiet
    // room sits near the floor. Drawn from the raw negative logarithm the bar
    // barely moves while someone is talking.
    expect(meterLevel(0)).toBe(1);
    expect(meterLevel(METER_FLOOR_DB)).toBe(0);
    expect(meterLevel(METER_FLOOR_DB / 2)).toBeCloseTo(0.5, 5);
  });

  it('clamps rather than drawing off the end of the meter', () => {
    expect(meterLevel(12)).toBe(1);
    expect(meterLevel(-200)).toBe(0);
  });

  it('reads a missing level as silence, not as a spike', () => {
    // the first status can arrive before metering does, and a bar slammed to full
    // on undefined would look like the mic hearing something it has not heard
    expect(meterLevel(undefined)).toBe(0);
    expect(meterLevel(NaN)).toBe(0);
    expect(meterLevel(Infinity)).toBe(0);
  });
});

describe('the recording options', () => {
  it('asks for metering, or the level meter is decorative', () => {
    expect(RECORDING.isMeteringEnabled).toBe(true);
  });

  it('tells the gateway the format it is actually recording', () => {
    // The envelope names the format so the gateway can name its temp file for
    // Whisper. If the recorder's extension and `CLIP_FORMAT` ever disagree,
    // transcription degrades silently — there is no error, just a worse result.
    //
    // Asserting they match rather than asserting m4a: `expo-audio` is mocked here,
    // so a literal would only be checking the mock. This checks our own two halves
    // against each other, which is the part that can drift.
    expect(RECORDING.extension?.replace('.', '')).toBe(CLIP_FORMAT);
  });

  it('drops a clip too short to be speech', () => {
    // a mis-tap's worth of room noise, which Whisper answers with either nothing
    // or an invented sentence
    expect(MIN_CLIP_MS).toBeGreaterThanOrEqual(500);
  });
});
