import { COLOR, HUD_BEZIER, SPACE, FONT } from '../tokens';

describe('design tokens', () => {
  it('matches the desk HUD palette verbatim', () => {
    expect(COLOR.cyan).toBe('#00ffcc');
    expect(COLOR.cyanDim).toBe('rgba(0,255,204,0.1)');
    expect(COLOR.bg).toBe('#050505');
    expect(COLOR.panel).toBe('rgba(6,10,14,0.82)');
    expect(COLOR.red).toBe('#ff3366');
    expect(COLOR.green).toBe('#22ff88');
    expect(COLOR.gold).toBe('#ffd700');
    expect(COLOR.dim).toBe('rgba(255,255,255,0.55)');
  });

  it('shares the desk HUD easing curve', () => {
    expect(HUD_BEZIER).toEqual([0.16, 1, 0.3, 1]);
  });

  it('exposes a spacing scale and an Orbitron display font', () => {
    expect(SPACE.md).toBe(12);
    expect(FONT.display).toContain('Orbitron');
  });
});
