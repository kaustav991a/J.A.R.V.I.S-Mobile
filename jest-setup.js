// jest-setup.js
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
require('react-native-reanimated').setUpTests();
// gesture handler installs a native binding on mount; jest has no native side,
// so without this shim mounting <App /> throws where a device would not
require('react-native-gesture-handler/jestSetup');
// the safe-area provider renders nothing until native reports metrics, so in
// jest an unmocked provider swallows the whole app tree
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
