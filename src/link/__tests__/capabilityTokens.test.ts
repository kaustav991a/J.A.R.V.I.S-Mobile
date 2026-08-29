import {
  CAPABILITIES,
  REFRESH_BEFORE_SECS,
  ensure,
  makeCapabilityProvider,
  mint,
  needsRefresh,
  readMinted,
  tokenFor,
  usable,
} from '../capabilityTokens';
import type { CapabilityTokens } from '../capabilityTokens';

/**
 * One token per door, instead of one secret for the whole house.
 *
 * The pairing token opened the socket, the push address, the commute schedule,
 * the fact store and the say-something route in one string, and nothing expired
 * — so any leak was a leak of everything, permanently. The gateway now derives a
 * short-lived token per capability from that master; this is the phone's half.
 *
 * **The rule every test here exists to protect: nothing in this file may cost
 * him a reply.** Every failure path falls back to the master, which the gateway
 * still accepts on every route. Security work that can lock him out of his own
 * assistant is not security work, and the fallbacks are the majority of the
 * cases below for that reason.
 */

const HOUR = 3600;
const CLOUD = 'https://gateway.example';

const minted = (over: Partial<CapabilityTokens> = {}): CapabilityTokens => ({
  tokens: { link: 'j1.link.x', push: 'j1.push.x', memory: 'j1.memory.x' },
  expiresAt: 1_000_000 + 30 * 24 * HOUR,
  origin: CLOUD,
  ...over,
});

const okResponse = (body: unknown) =>
  ({ ok: true, status: 200, text: async () => JSON.stringify(body) }) as unknown as Response;

describe('reading what the gateway minted', () => {
  it('keeps one token per capability, with the expiry the gateway stated', () => {
    const set = readMinted(
      { tokens: { link: 'a', push: 'b' }, expires_at: 1234, ttl_days: 30 },
      CLOUD
    );
    expect(set).toEqual({ tokens: { link: 'a', push: 'b' }, expiresAt: 1234, origin: CLOUD });
  });

  it('drops capabilities this build has never heard of rather than failing', () => {
    // a newer gateway may mint doors this app does not know about yet, and that
    // is not an error — it is a gateway ahead of a phone, which is the normal
    // direction for these two to be out of step
    const set = readMinted({ tokens: { link: 'a', teleport: 'b' }, expires_at: 9 }, CLOUD);
    expect(set?.tokens).toEqual({ link: 'a' });
  });

  it('refuses a reply with nothing usable in it, so the master stays in play', () => {
    expect(readMinted({ tokens: {}, expires_at: 9 }, CLOUD)).toBeNull();
    expect(readMinted({ tokens: { link: 'a' } }, CLOUD)).toBeNull();
    expect(readMinted({ tokens: { link: '  ' }, expires_at: 9 }, CLOUD)).toBeNull();
    expect(readMinted(null, CLOUD)).toBeNull();
    expect(readMinted('nope', CLOUD)).toBeNull();
  });
});

describe('when a stored set may still be used', () => {
  it('is refused once it has expired', () => {
    const set = minted({ expiresAt: 500 });
    expect(usable(set, CLOUD, 499)).toBe(true);
    expect(usable(set, CLOUD, 501)).toBe(false);
  });

  it('is refused when it came from a different gateway', () => {
    // these are derived from the gateway's own secret, so a set minted by one is
    // refused by another. Pointing the phone at a new URL used to produce a
    // refusal that looked like a broken feature
    expect(usable(minted(), 'https://somewhere.else', 1000)).toBe(false);
  });

  it('is re-minted before it lapses rather than at the moment it does', () => {
    const set = minted({ expiresAt: 1_000_000 });
    expect(needsRefresh(set, CLOUD, 1_000_000 - REFRESH_BEFORE_SECS - 1)).toBe(false);
    expect(needsRefresh(set, CLOUD, 1_000_000 - REFRESH_BEFORE_SECS + 1)).toBe(true);
    expect(needsRefresh(null, CLOUD, 0)).toBe(true);
  });
});

describe('minting', () => {
  it('presents the master, and only to the mint', async () => {
    const fetchImpl = jest.fn(async () => okResponse({ tokens: { link: 'a' }, expires_at: 99 }));
    const save = jest.fn(async () => {});
    await mint(CLOUD, 'the-master', { fetchImpl: fetchImpl as never, save });
    expect(fetchImpl).toHaveBeenCalledWith(
      `${CLOUD}/app-tokens`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer the-master' }),
      })
    );
    expect(save).toHaveBeenCalledWith({ tokens: { link: 'a' }, expiresAt: 99, origin: CLOUD });
  });

  it('treats a gateway that has never heard of capabilities as fine', async () => {
    // 404 is an older gateway, and an older gateway is a perfectly good one: it
    // still accepts the master on every route
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 404 }) as unknown as Response);
    expect(await mint(CLOUD, 'm', { fetchImpl: fetchImpl as never })).toBeNull();
  });

  it('treats an unreachable gateway as fine too', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new Error('network down');
    });
    expect(await mint(CLOUD, 'm', { fetchImpl: fetchImpl as never })).toBeNull();
  });
});

describe('ensure', () => {
  it('does not mint when the stored set is current', async () => {
    const fetchImpl = jest.fn();
    const set = minted({ expiresAt: 2_000_000 });
    const got = await ensure(CLOUD, 'm', {
      fetchImpl: fetchImpl as never,
      now: () => 1_000_000 * 1000,
      load: async () => set,
    });
    expect(got).toBe(set);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('mints when the stored set is close to lapsing', async () => {
    const fetchImpl = jest.fn(async () => okResponse({ tokens: { link: 'fresh' }, expires_at: 9e9 }));
    const got = await ensure(CLOUD, 'm', {
      fetchImpl: fetchImpl as never,
      now: () => 1_000_000 * 1000,
      load: async () => minted({ expiresAt: 1_000_000 + HOUR }),
      save: async () => {},
    });
    expect(fetchImpl).toHaveBeenCalled();
    expect(got?.tokens.link).toBe('fresh');
  });

  it('keeps a set that is still valid when the re-mint fails', async () => {
    // two days left beats nothing, and the master is still under both
    const stored = minted({ expiresAt: 1_000_000 + 2 * 24 * HOUR });
    const got = await ensure(CLOUD, 'm', {
      fetchImpl: (async () => {
        throw new Error('offline');
      }) as never,
      now: () => 1_000_000 * 1000,
      load: async () => stored,
    });
    expect(got).toBe(stored);
  });

  it('returns nothing when there is no gateway or no master to mint with', async () => {
    expect(await ensure(null, 'm')).toBeNull();
    expect(await ensure(CLOUD, null)).toBeNull();
  });
});

describe('the shared provider', () => {
  it('hands each door its own token', async () => {
    const p = makeCapabilityProvider(CLOUD, 'm', {
      now: () => 1_000_000 * 1000,
      load: async () => minted({ expiresAt: 9e9 }),
    });
    expect(await p.token('push')).toBe('j1.push.x');
    expect(await p.token('link')).toBe('j1.link.x');
  });

  it('returns null for a door the gateway did not mint, so the master is used', async () => {
    const p = makeCapabilityProvider(CLOUD, 'm', {
      now: () => 1_000_000 * 1000,
      load: async () => minted({ expiresAt: 9e9 }),
    });
    expect(await p.token('say')).toBeNull();
  });

  it('mints once for four requests fired together', async () => {
    // a screen that asks four things at startup must not start four exchanges,
    // and worse, must not end up with four sets disagreeing about which is current
    const fetchImpl = jest.fn(async () => okResponse({ tokens: { memory: 'one' }, expires_at: 9e9 }));
    const p = makeCapabilityProvider(CLOUD, 'm', {
      fetchImpl: fetchImpl as never,
      now: () => 1_000_000 * 1000,
      load: async () => null,
      save: async () => {},
    });
    const all = await Promise.all([
      p.token('memory'),
      p.token('memory'),
      p.token('memory'),
      p.token('memory'),
    ]);
    expect(all).toEqual(['one', 'one', 'one', 'one']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('re-mints on demand, which is what an expired reply asks for', async () => {
    let n = 0;
    const fetchImpl = jest.fn(async () =>
      okResponse({ tokens: { memory: `mint-${++n}` }, expires_at: 9e9 })
    );
    const p = makeCapabilityProvider(CLOUD, 'm', {
      fetchImpl: fetchImpl as never,
      now: () => 1_000_000 * 1000,
      load: async () => null,
      save: async () => {},
    });
    expect(await p.token('memory')).toBe('mint-1');
    await p.refresh();
    expect(await p.token('memory')).toBe('mint-2');
  });

  it('says null rather than throwing when there is no gateway at all', async () => {
    const p = makeCapabilityProvider(null, 'm');
    expect(await p.token('link')).toBeNull();
    expect(await p.refresh()).toBeNull();
  });
});

describe('the shape of the thing', () => {
  it('names exactly the five doors the gateway gates', () => {
    // if the gateway grows a sixth, this is the line that has to move, and it
    // moving is the reminder that the app has to be taught the new door
    expect([...CAPABILITIES]).toEqual(['link', 'push', 'state', 'memory', 'say']);
  });

  it('hands out nothing from an expired set, rather than a token that will 401', () => {
    expect(tokenFor(minted({ expiresAt: 5 }), 'push', CLOUD, 10)).toBeNull();
  });
});
