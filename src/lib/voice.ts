import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from 'expo-audio';
import type { RecordingOptions } from 'expo-audio';

/**
 * Recording a clip for the far end to transcribe.
 *
 * The gateway already does the hard half: it takes a clip, runs it through the
 * same Groq Whisper path Telegram voice notes use — multilingual, Bengali and
 * Benglish included — and sends the transcript back as its own frame, which the
 * reducer logs as *him* speaking. This file is the microphone that was missing.
 *
 * `LOW_QUALITY` on purpose. This is speech going to a transcriber, not music: 64
 * kbps mono-ish m4a is what Whisper wants anyway, and the clip is the largest
 * thing this socket ever carries. `HIGH_QUALITY` doubles the bytes for accuracy
 * nobody can hear.
 */
export const RECORDING: RecordingOptions = RecordingPresets.LOW_QUALITY;

/** what the gateway is told the clip is; must match the recorder's extension */
export const CLIP_FORMAT = 'm4a';

export type VoiceClip = { base64: string; format: string };

/**
 * Ask for the microphone, and put the audio session into record mode.
 *
 * Returns false rather than throwing when the permission is refused or the native
 * module is absent — a phone that cannot record still has a keyboard, and the mic
 * button says so instead of the app falling over.
 */
export async function prepareToRecord(): Promise<boolean> {
  try {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) return false;
    // without this Android records at a whisper on some devices, and iOS refuses
    // to record at all while the session is in playback mode
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a recorded file into base64.
 *
 * Through `fetch` and `FileReader` rather than `expo-file-system`, which is not a
 * dependency: a `file://` URI is fetchable in React Native, and `readAsDataURL`
 * gives base64 without pulling in another native module for one read.
 *
 * Base64 rather than the binary frame `LinkMachine.sendVoice` also supports. It is
 * a third larger on the wire, and worth it: the envelope carries the format
 * explicitly, so the gateway names the temp file correctly for Whisper instead of
 * guessing from bytes. The binary path stays available for a transport that cannot
 * hold a large string.
 */
export async function readClip(uri: string): Promise<VoiceClip | null> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('could not read the clip'));
      reader.onloadend = () => resolve(String(reader.result ?? ''));
      reader.readAsDataURL(blob);
    });
    // data:audio/m4a;base64,AAAA… — only the payload goes on the wire
    const comma = dataUrl.indexOf(',');
    const base64 = comma === -1 ? '' : dataUrl.slice(comma + 1);
    return base64 ? { base64, format: CLIP_FORMAT } : null;
  } catch {
    return null;
  }
}

/**
 * The shortest clip worth sending, in milliseconds.
 *
 * A tap that lands as a press-and-release produces a few hundred milliseconds of
 * room noise, which Whisper answers with either nothing or an invented sentence.
 * Below this the clip is dropped and the user is told, rather than J.A.R.V.I.S.
 * being asked a question nobody put to him.
 */
export const MIN_CLIP_MS = 700;
