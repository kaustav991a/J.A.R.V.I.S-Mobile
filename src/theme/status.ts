import { COLOR } from './tokens';

const BLUE = ['online', 'listening', 'idle', 'ready'];
const GOLD = ['thinking', 'agent', 'agent_step', 'parked', 'working'];
const RED = ['alert', 'lockdown', 'error', 'security'];
const GREEN = ['speaking', 'done', 'confirmed'];

/**
 * The reactor, the status strip and the transport pill all tint from this one
 * function, so a status word can never mean two colours in two places.
 */
export function statusColor(status: string): string {
  if (BLUE.includes(status)) return COLOR.blue;
  if (GOLD.includes(status)) return COLOR.gold;
  if (RED.includes(status)) return COLOR.red;
  if (GREEN.includes(status)) return COLOR.green;
  return COLOR.dim;
}
