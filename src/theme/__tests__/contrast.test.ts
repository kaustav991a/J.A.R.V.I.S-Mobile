import { COLOR } from '../tokens';

/**
 * The contrast audit, which had never been run.
 *
 * `ROADMAP.md` carried "nothing has been checked with a screen reader, and
 * `COLOR.dim` on `COLOR.panel` needs a contrast audit" for days. This is that audit,
 * kept as a test rather than as a number in a document, because a palette is exactly
 * the kind of thing that gets nudged later by someone who never reads the document.
 *
 * **Alpha has to be composited first.** Half this palette is `rgba` — `panel` is
 * `rgba(10,24,48,0.72)` and `dim` is `rgba(198,222,255,0.55)` — so measuring the raw
 * channel values answers a question nobody asked. The first pass at this reported
 * 4.85 for dim-on-panel by ignoring alpha; the real figure is 4.78 over the page
 * floor and 4.68 over the navy crown, and the difference is the whole point of
 * measuring.
 *
 * The bar is **WCAG AA for normal text, 4.5:1**. Everything `dim` is used for is
 * 11–12px, which is normal text by that standard — there is no large-text exemption
 * available here.
 */
type Rgba = { rgb: [number, number, number]; a: number };

const parse = (c: string): Rgba => {
  if (c.startsWith('#')) {
    const h = c.slice(1);
    return { rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number], a: 1 };
  }
  const inside = c.match(/rgba?\(([^)]+)\)/);
  if (!inside) throw new Error(`cannot parse colour: ${c}`);
  const parts = inside[1].split(',').map((s) => parseFloat(s.trim()));
  return { rgb: [parts[0], parts[1], parts[2]], a: parts[3] === undefined ? 1 : parts[3] };
};

/** what the eye actually receives: the colour laid over what is behind it */
const over = (fg: string, bg: Rgba): Rgba => {
  const f = parse(fg);
  return { rgb: f.rgb.map((v, i) => v * f.a + bg.rgb[i] * (1 - f.a)) as [number, number, number], a: 1 };
};

const luminance = (c: Rgba): number => {
  const [r, g, b] = c.rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: Rgba, b: Rgba): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const AA_NORMAL = 4.5;

/** the two grounds a panel is ever seen against */
const GROUNDS = [
  { name: 'the page floor', panel: over(COLOR.panel, parse(COLOR.bg)) },
  { name: 'the navy crown behind the reactor', panel: over(COLOR.panel, parse(COLOR.navy)) },
];

describe('text on a panel, against both grounds it is ever seen on', () => {
  for (const ground of GROUNDS) {
    it(`keeps dim text legible over ${ground.name}`, () => {
      // the tightest pair in the app, and the most used: every caption, note,
      // timestamp and secondary line
      expect(contrast(over(COLOR.dim, ground.panel), ground.panel)).toBeGreaterThanOrEqual(AA_NORMAL);
    });

    it(`keeps every state colour legible over ${ground.name}`, () => {
      // the status panel says things in these, and a word nobody can read is the
      // same as the dot-only design it exists to avoid
      for (const c of [COLOR.white, COLOR.blue, COLOR.green, COLOR.red, COLOR.gold]) {
        expect(contrast(over(c, ground.panel), ground.panel)).toBeGreaterThanOrEqual(AA_NORMAL);
      }
    });
  }

  it('has almost no headroom on dim, which is why this test exists', () => {
    // 4.68 against a floor of 4.5. Darkening `panel`, lowering `dim`'s alpha, or
    // warming either one will breach it, and the failure would otherwise be invisible
    const ratio = contrast(over(COLOR.dim, GROUNDS[1].panel), GROUNDS[1].panel);
    expect(ratio).toBeLessThan(5);
  });

  it('can actually fail, so a pass means something', () => {
    // the helper proved against a pair that genuinely does not work: hairline
    // separator colour used as text would be unreadable, and it must measure as such
    expect(contrast(over(COLOR.line, GROUNDS[0].panel), GROUNDS[0].panel)).toBeLessThan(AA_NORMAL);
  });
});
