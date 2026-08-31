import { reshoot } from '../vision';

/**
 * Rebuilding a photo's bytes from the copy the chat kept.
 *
 * A photo that failed to send is the most expensive thing this app can lose — it
 * cost a walk to wherever the picture was taken — and until now it was unrecoverable
 * for a dull reason: the send carried base64 to the socket and kept only a `uri` in
 * the log, so the retry had a picture on screen and no bytes to send.
 *
 * The shrink is the same one the original send used rather than a second path, so a
 * retried photo is byte-for-byte the size the socket was sized for. **Null, never a
 * throw:** the uri points into a cache Android may have cleared, which is a photo
 * that cannot be re-sent and must be said out loud rather than crashed on.
 */

// the `mock` prefix is not styling: jest hoists `jest.mock` above the file's own
// consts, and only names beginning with it may be referenced from a mock factory
const mockSave = jest.fn();
const mockResize = jest.fn();

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({
      resize: mockResize,
      renderAsync: () => Promise.resolve({ saveAsync: mockSave }),
    }),
  },
}));

jest.mock('expo-image-picker', () => ({}));

beforeEach(() => {
  mockSave.mockReset();
  mockResize.mockClear();
});

describe('re-encoding a photo already on disk', () => {
  it('hands back the bytes and the shrunk copy', async () => {
    mockSave.mockResolvedValue({ base64: 'AAAA', uri: 'file:///cache/small.jpg' });
    expect(await reshoot('file:///cache/original.jpg')).toEqual({
      base64: 'AAAA',
      uri: 'file:///cache/small.jpg',
    });
  });

  it('shrinks to the same long edge the first send used', async () => {
    // a retry that skipped the resize would put a 4 MB frame on a socket sized for
    // 200 KB, which is the failure the original shrink exists to prevent
    mockSave.mockResolvedValue({ base64: 'AAAA', uri: 'file:///cache/small.jpg' });
    await reshoot('file:///cache/original.jpg');
    expect(mockResize).toHaveBeenCalledWith({ width: 1280, height: null });
  });

  it('answers null when the file is gone, rather than throwing', async () => {
    // the uri points into a cache Android is entitled to clear
    mockSave.mockRejectedValue(new Error('ENOENT'));
    expect(await reshoot('file:///cache/gone.jpg')).toBeNull();
  });

  it('answers null when the encode comes back with no bytes', async () => {
    mockSave.mockResolvedValue({ uri: 'file:///cache/small.jpg' });
    expect(await reshoot('file:///cache/original.jpg')).toBeNull();
  });
});
