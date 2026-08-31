import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * Taking a photo for J.A.R.V.I.S. to look at.
 *
 * The gateway already has a vision model and a `see()` that keeps the same rolling
 * memory as a text turn, so the only thing missing was a way to hand it a picture.
 *
 * `expo-image-picker` rather than `expo-camera`: the camera the phone already has
 * is better than one drawn here, it comes with a review-and-retake step for free,
 * and the same module opens the gallery — which is half of what "image support"
 * means in practice. A custom viewfinder would be a screen to build and maintain
 * for no gain.
 */

/**
 * The long edge, in pixels, and the JPEG quality.
 *
 * **This is the part that matters.** A 12MP capture off this phone is around 4 MB,
 * which is ~5.5 MB once base64 has added its third, and it travels as a single
 * WebSocket text frame — so an unshrunk photo either bounces off a frame limit or
 * sits on a mobile uplink long enough for the socket to be dropped underneath it.
 * 1280px on the long edge at 0.65 lands under 200 KB and is more resolution than
 * the vision model uses.
 */
const LONG_EDGE = 1280;
const QUALITY = 0.65;

export type Shot = {
  /** JPEG bytes, base64, no data-URI prefix — the gateway adds that */
  base64: string;
  /** local uri of the shrunk copy, for showing it in the chat log */
  uri: string;
};

export type Source = 'camera' | 'library';

/**
 * Ask for the one permission this source needs, and no more.
 *
 * The library and the camera are separate grants, and asking for both to use one
 * of them is how an app ends up holding permissions it never exercises.
 */
async function allowed(source: Source): Promise<boolean> {
  try {
    const { granted } =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    return granted;
  } catch {
    return false;
  }
}

/**
 * Shrink to something a socket can carry, and hand back base64.
 *
 * The contextual API, not `manipulateAsync` — that is deprecated in SDK 57, and
 * this project has paid for guessing at Expo APIs from memory before.
 *
 * Height is left null so the aspect ratio is kept: passing both edges stretches a
 * portrait photo, and a distorted photo is a worse answer than a smaller one.
 */
export async function shrink(uri: string): Promise<Shot | null> {
  try {
    const context = ImageManipulator.manipulate(uri);
    context.resize({ width: LONG_EDGE, height: null });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: QUALITY,
      base64: true,
    });
    return saved.base64 ? { base64: saved.base64, uri: saved.uri } : null;
  } catch {
    return null;
  }
}

export type ShotResult =
  | { ok: true; shot: Shot }
  /** cancelled is not a failure and must not raise anything on screen */
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; problem: string };

/**
 * Take or choose a photo, shrink it, and return it ready to send.
 *
 * Every failure is named rather than collapsed into null: "permission is off",
 * "could not read that image" and "you changed your mind" want three different
 * responses on screen, and one null cannot tell them apart.
 */
export async function takeShot(source: Source): Promise<ShotResult> {
  if (!(await allowed(source))) {
    return {
      ok: false,
      cancelled: false,
      problem: source === 'camera' ? 'Camera permission is off' : 'Photo permission is off',
    };
  }

  let picked: ImagePicker.ImagePickerResult;
  try {
    // no allowsEditing: a forced crop step on the way to asking "what is this"
    // gets in the way, and the model wants the whole frame
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', quality: 1 };
    picked =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
  } catch {
    return { ok: false, cancelled: false, problem: 'Could not open the camera' };
  }

  if (picked.canceled) return { ok: false, cancelled: true };
  const asset = picked.assets?.[0];
  if (!asset?.uri) return { ok: false, cancelled: false, problem: 'That photo came back empty' };

  const shot = await shrink(asset.uri);
  if (!shot) return { ok: false, cancelled: false, problem: 'Could not read that photo' };
  return { ok: true, shot };
}

/**
 * Rebuild a photo's bytes from the shrunk copy the chat kept.
 *
 * For retrying a send that failed. The original `takeShot` handed the socket base64
 * and handed the log a `uri`, so a failed photo turn had a picture on screen and
 * nothing to re-send — the most expensive thing in this app to lose, since it cost a
 * walk to wherever the picture was taken.
 *
 * The same `shrink` the first send used, deliberately: a retry that skipped it would
 * put a full-size frame on a socket that was sized for 200 KB, which is the failure
 * the resize exists to prevent. Re-encoding an already-shrunk JPEG costs a little
 * quality and nothing else that matters at 1280px.
 *
 * Null when the file is gone. The uri points into a cache Android is entitled to
 * clear, which is a photo that genuinely cannot be re-sent and has to be said out
 * loud rather than retried forever.
 */
export const reshoot = (uri: string): Promise<Shot | null> => shrink(uri);
