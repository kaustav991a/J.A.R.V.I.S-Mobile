/**
 * Fixture data for the screens whose backend routes are not reachable from
 * this machine. Scripts map to the backend's `/api/tasks`, recent commands to
 * `/api/backdoor`; both are swapped for live data when the desk backend gains
 * the app-facing surface described in the design's §6.
 */

export type Script = {
  id: string;
  name: string;
  /** human phrasing of when it last ran, e.g. "2h ago" */
  lastRun: string;
  description: string;
  /** outcome of the last run */
  outcome: 'success' | 'failed' | 'never';
};

export const SCRIPTS: Script[] = [
  {
    id: 'daily-report',
    name: 'Daily Report',
    lastRun: '2h ago',
    description: 'Generates daily report and sends summary to your email.',
    outcome: 'success',
  },
  {
    id: 'system-cleanup',
    name: 'System Cleanup',
    lastRun: '1d ago',
    description: 'Clears temp files, empties the recycle bin and trims logs.',
    outcome: 'success',
  },
  {
    id: 'data-backup',
    name: 'Data Backup',
    lastRun: '3d ago',
    description: 'Mirrors the working directory to the external drive.',
    outcome: 'success',
  },
  {
    id: 'email-summary',
    name: 'Email Summary',
    lastRun: '5h ago',
    description: 'Summarises unread mail and posts the digest to the desk HUD.',
    outcome: 'success',
  },
  {
    id: 'website-monitor',
    name: 'Website Monitor',
    lastRun: '12h ago',
    description: 'Polls the monitored hosts and reports any non-200 response.',
    outcome: 'failed',
  },
];

export const RECENT_COMMANDS: string[] = [
  'system status',
  'open browser',
  'take screenshot',
  'list files',
  'shutdown in 10 min',
];

/** stand-in for what `/api/backdoor` will echo back for `system status` */
export const SAMPLE_RESULT = `System Status
-------------
CPU Usage      : 23%
Memory Usage   : 45%
Disk Usage     : 62%
Uptime         : 3d 14h 22m
OS             : Windows 11

All systems operational.`;

export const APP_VERSION = '1.0.0';
