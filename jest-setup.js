// jest-setup.js
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
require('react-native-reanimated').setUpTests();
// gesture handler installs a native binding on mount; jest has no native side,
// so without this shim mounting <App /> throws where a device would not
require('react-native-gesture-handler/jestSetup');
// the safe-area provider renders nothing until native reports metrics, so in
// jest an unmocked provider swallows the whole app tree
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
// the chat log is persisted through AsyncStorage, whose native module is null under
// jest — importing it unmocked throws before any test runs. The package ships its
// own in-memory mock for exactly this.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
// expo-audio reaches for a native class at import time and throws on
// `undefined.prototype` under jest, which takes the whole suite down before a
// single test runs. Only the recorder is used here, and only its shape matters:
// the recording itself cannot be exercised without a microphone.
jest.mock('expo-audio', () => ({
  useAudioRecorder: () => ({
    prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
    record: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined),
    uri: null,
    isRecording: false,
  }),
  requestRecordingPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  getRecordingPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  RecordingPresets: {
    LOW_QUALITY: { extension: '.m4a' },
    HIGH_QUALITY: { extension: '.m4a' },
  },
}));
