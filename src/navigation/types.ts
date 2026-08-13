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
  Places: undefined;
  About: undefined;
};

export type TabParams = {
  Home: NavigatorScreenParams<HomeStackParams>;
  Scripts: NavigatorScreenParams<ScriptsStackParams>;
  Commands: NavigatorScreenParams<CommandsStackParams>;
  Reports: NavigatorScreenParams<ReportsStackParams>;
  Settings: NavigatorScreenParams<SettingsStackParams>;
};
