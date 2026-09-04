import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * The tab navigator's id. A nested screen asks for this navigator by name —
 * `getParent(TABS_ID)` — so a tab jump can never be delivered to the stack the
 * screen happens to sit in.
 */
export const TABS_ID = 'tabs';

export type HomeStackParams = {
  HomeMain: undefined;
  Connection: undefined;
  Activity: undefined;
};

export type ScriptsStackParams = {
  ScriptsHome: undefined;
  ScriptDetails: { id: string };
};

export type CommandsStackParams = {
  CommandsHome: undefined;
  CommandResult: { command: string; output: string };
};

export type ReportsStackParams = {
  ReportsHome: undefined;
};

export type SettingsStackParams = {
  SettingsHome: undefined;
  /**
   * The same screen the Home stack carries. Connection is two things at once —
   * configuration, which belongs here, and urgent status, which belongs a tap
   * from Home — and registering it in both stacks is what stops either route
   * throwing the user into the other tab.
   */
  Connection: undefined;
  Appearance: undefined;
  Security: undefined;
  /**
   * What he can do today, and what is not built yet.
   *
   * The chat answers the same question without a round trip; this is the version
   * you find by browsing rather than by suspecting there is an answer.
   */
  Capabilities: undefined;
  Places: undefined;
  /**
   * A Google Timeline export, read once and never copied.
   *
   * Under Settings rather than inside Places, because it is a one-off act rather
   * than a setting: nothing on this screen changes what the app does tomorrow, it
   * changes what the app knows about last year.
   */
  Import: undefined;
  /** what the cloud brain holds as true about him, and the way to correct it */
  Memory: undefined;
  /**
   * What this phone has observed about its own use.
   *
   * Deliberately a different screen from Memory: that one holds what he has
   * *told* J.A.R.V.I.S. and lives on the gateway, this one holds what the phone
   * has *watched* and never leaves the device.
   */
  Journal: undefined;
  /** what version is running, and the one button that moves it forward */
  Updates: undefined;
  /** the last few JavaScript crashes, read off the phone instead of off a cable */
  Diagnostics: undefined;
  About: undefined;
};

export type TabParams = {
  Home: NavigatorScreenParams<HomeStackParams>;
  Scripts: NavigatorScreenParams<ScriptsStackParams>;
  Commands: NavigatorScreenParams<CommandsStackParams>;
  Reports: NavigatorScreenParams<ReportsStackParams>;
  Settings: NavigatorScreenParams<SettingsStackParams>;
};
