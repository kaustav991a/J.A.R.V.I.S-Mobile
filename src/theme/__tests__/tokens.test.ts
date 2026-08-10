import { COLOR, HUD_BEZIER, SCRIM, SPACE, FONT, TYPE } from '../tokens';

describe('design tokens', () => {
  it('pins the arc-reactor palette so nobody "tidies" a hex value', () => {
    expect(COLOR.blue).toBe('#3ea6ff');
    expect(COLOR.blueBright).toBe('#9bdcff');
    expect(COLOR.blueDeep).toBe('#0b63ff');
    expect(COLOR.blueDim).toBe('rgba(62,166,255,0.12)');
    expect(COLOR.bg).toBe('#020814');
    expect(COLOR.navy).toBe('#0a1b3d');
    expect(COLOR.panel).toBe('rgba(10,24,48,0.72)');
    expect(COLOR.red).toBe('#ff4d6a');
    expect(COLOR.green).toBe('#3ce6a5');
    expect(COLOR.gold).toBe('#ffbf47');
    expect(COLOR.dim).toBe('rgba(198,222,255,0.55)');
  });

  it('has no cyan left from the desk HUD palette', () => {
    expect(JSON.stringify(COLOR)).not.toContain('00ffcc');
    expect(COLOR).not.toHaveProperty('cyan');
  });

  it('shares the desk HUD easing curve', () => {
    expect(HUD_BEZIER).toEqual([0.16, 1, 0.3, 1]);
  });

  it('descends the canvas gradient from navy to near-black', () => {
    expect(SCRIM).toEqual(['#0a1b3d', '#051129', '#01060f']);
  });

  it('exposes a spacing scale and an Orbitron display font', () => {
    expect(SPACE.md).toBe(12);
    expect(FONT.display).toContain('Orbitron');
  });

  it('carries a wordmark and strip step in the type scale', () => {
    expect(TYPE.wordmark.fontFamily).toBe(FONT.display);
    expect(TYPE.wordmark.letterSpacing).toBe(10);
    expect(TYPE.strip.fontFamily).toBe(FONT.data);
  });
});
