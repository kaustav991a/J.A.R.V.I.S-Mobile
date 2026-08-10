import { Endpoints, LinkMode } from './config';

export type ProbeDeps = {
  fetchImpl: typeof fetch;
  /** spec §3.1: the desk probe times out at 1500ms */
  lanTimeoutMs?: number;
  cloudTimeoutMs?: number;
};

async function reachable(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    return res.status === 200;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export const probeLan = (e: Endpoints, deps: ProbeDeps): Promise<boolean> =>
  reachable(`${e.deskBase}/api/health/summary`, deps.fetchImpl, deps.lanTimeoutMs ?? 1500);

export const probeCloud = async (e: Endpoints, deps: ProbeDeps): Promise<boolean> =>
  e.cloudBase ? reachable(`${e.cloudBase}/health`, deps.fetchImpl, deps.cloudTimeoutMs ?? 4000) : false;

/** LAN first, cloud second, dark last. Never probes the cloud if the desk answers. */
export async function chooseMode(e: Endpoints, deps: ProbeDeps): Promise<LinkMode> {
  if (await probeLan(e, deps)) return 'lan';
  if (await probeCloud(e, deps)) return 'cloud';
  return 'offline';
}
