import type { NavigatorScreenParams } from '@react-navigation/native';

export type StatusStackParams = {
  StatusHome: undefined;
  Connection: undefined;
};

export type ScriptsStackParams = {
  ScriptsHome: undefined;
  ScriptDetails: { id: string };
};

export type CommandsStackParams = {
  CommandsHome: undefined;
  CommandResult: { command: string; output: string };
};

export type SettingsStackParams = {
  SettingsHome: undefined;
  Appearance: undefined;
  About: undefined;
};

export type TabParams = {
  Status: NavigatorScreenParams<StatusStackParams>;
  Scripts: NavigatorScreenParams<ScriptsStackParams>;
  Commands: NavigatorScreenParams<CommandsStackParams>;
  Settings: NavigatorScreenParams<SettingsStackParams>;
};
