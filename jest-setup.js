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
  useAudioRecorderState: () => ({ isRecording: false, durationMillis: 0, metering: -60, canRecord: true }),
  requestRecordingPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  getRecordingPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  RecordingPresets: {
    LOW_QUALITY: { extension: '.m4a' },
    HIGH_QUALITY: { extension: '.m4a' },
  },
}));

/**
 * A real SQLite for the journal tests, rather than a mock that agrees with them.
 *
 * jest-expo automocks expo-sqlite's native side, so `NativeDatabase` is not a
 * constructor and every query throws before it runs. Mocking the *store* instead
 * would be the wrong repair: the whole value of those tests is that the schema,
 * the composite primary key, the `ON CONFLICT` upserts and the retention delete
 * are exercised by an actual SQL engine.
 *
 * Node 24 ships one — `node:sqlite` — so this adapter maps expo-sqlite's async
 * surface onto it. Same SQL, same semantics, no native build and no new
 * dependency.
 */
jest.mock('expo-sqlite', () => {
  const { DatabaseSync } = require('node:sqlite');
  // expo takes bind parameters either as varargs or as one array; node:sqlite
  // takes varargs only, so a lone array argument is spread back out
  const bind = (params) => (params.length === 1 && Array.isArray(params[0]) ? params[0] : params);
  // node:sqlite hands back null-prototype rows, and `changes` can be a bigint
  const plain = (row) => (row == null ? null : { ...row });

  return {
    openDatabaseAsync: async () => {
      // always in memory, whatever the name: nothing here should touch a real
      // file, and the one-connection-per-name caching being tested lives in the
      // store above this
      const db = new DatabaseSync(':memory:');
      return {
        execAsync: async (sql) => db.exec(sql),
        runAsync: async (sql, ...params) => {
          const r = db.prepare(sql).run(...bind(params));
          return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
        },
        getAllAsync: async (sql, ...params) => db.prepare(sql).all(...bind(params)).map(plain),
        getFirstAsync: async (sql, ...params) => plain(db.prepare(sql).get(...bind(params))),
        /**
         * Real transactions and real prepared statements, because the store uses
         * both — and it uses them for a reason the device taught: a commit per
         * row turned a first sync into a four-minute crawl.
         */
        withTransactionAsync: async (task) => {
          db.exec('BEGIN');
          try {
            await task();
            db.exec('COMMIT');
          } catch (e) {
            db.exec('ROLLBACK');
            throw e;
          }
        },
        prepareAsync: async (sql) => {
          const st = db.prepare(sql);
          // node:sqlite matches named parameters without their prefix, and expo
          // binds them with one — so `$at` is handed over as `at`
          const strip = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/^[$:@]/, ''), v]));
          return {
            executeAsync: async (params) => {
              const r = st.run(Array.isArray(params) ? params : strip(params ?? {}));
              return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
            },
            finalizeAsync: async () => {},
          };
        },
        closeAsync: async () => db.close(),
      };
    },
  };
});

/**
 * The usage-stats native module, which by definition cannot exist under jest.
 *
 * `requireNativeModule` throws at import time off-device, so without this the
 * journal's source layer takes the suite down before a test runs. Nothing above
 * `source.ts` uses this mock — they all take a `fakeSource` — so it only has to
 * be importable, and the real behaviour is checked on the phone.
 */
jest.mock('./modules/usage-stats', () => ({
  ping: () => 'usage-stats native alive',
  permission: () => 'granted',
  openSettings: () => true,
  queryDaily: async () => [],
  queryEvents: async () => [],
}));

/**
 * expo-updates, which must never run in a test.
 *
 * Installing it made the App smoke test take 92 SECONDS to mount, up from under
 * a second, and fail its 5s timeout whenever the machine was busy. The runtime
 * checks for an update on startup, and with no update server reachable under
 * jest that check sits there waiting. Nothing in this app imports it directly —
 * it is Expo's own startup integration — so the mock only has to exist.
 */
jest.mock('expo-updates', () => ({
  isEnabled: false,
  channel: null,
  runtimeVersion: 'test',
  updateId: null,
  checkForUpdateAsync: jest.fn().mockResolvedValue({ isAvailable: false }),
  fetchUpdateAsync: jest.fn().mockResolvedValue({ isNew: false }),
  reloadAsync: jest.fn().mockResolvedValue(undefined),
  useUpdates: jest.fn(() => ({ isUpdateAvailable: false, isUpdatePending: false })),
}));
