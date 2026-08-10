import { COLOR } from './tokens';

const RESTING = ['online', 'listening', 'idle', 'ready'];
const GOLD = ['thinking', 'agent', 'agent_step', 'parked', 'working'];
const RED = ['alert', 'lockdown', 'error', 'security'];
const GREEN = ['speaking', 'done', 'confirmed'];

/**
 * The reactor, the status strip and the transport pill all tint from this one
 * function, so a status word can never mean two colours in two places.
 *
 * Resting states take the user's chosen accent; the signal states keep their
 * fixed meaning, because "alert" must be red whatever the accent is set to.
 */
export function statusColor(status: string, accent: string = COLOR.blue): string {
  if (RESTING.includes(status)) return accent;
  if (GOLD.includes(status)) return COLOR.gold;
  if (RED.includes(status)) return COLOR.red;
  if (GREEN.includes(status)) return COLOR.green;
  return COLOR.dim;
}
