import { render } from '@testing-library/react-native';
import { ArcReactor } from '../ArcReactor';
import { statusColor } from '../../theme/status';
import { COLOR } from '../../theme/tokens';

describe('statusColor', () => {
  it('is blue for the resting states', () => {
    expect(statusColor('online')).toBe(COLOR.blue);
    expect(statusColor('listening')).toBe(COLOR.blue);
  });

  it('is gold while the agent is working', () => {
    expect(statusColor('thinking')).toBe(COLOR.gold);
    expect(statusColor('agent')).toBe(COLOR.gold);
  });

  it('is red for alarm states', () => {
    expect(statusColor('alert')).toBe(COLOR.red);
    expect(statusColor('lockdown')).toBe(COLOR.red);
  });

  it('is green while speaking', () => {
    expect(statusColor('speaking')).toBe(COLOR.green);
  });

  it('falls back to dim for anything it does not know', () => {
    expect(statusColor('boot')).toBe(COLOR.dim);
    expect(statusColor('who knows')).toBe(COLOR.dim);
  });
});

describe('ArcReactor', () => {
  it('renders the ring stack and the wordmark', async () => {
    const { getByTestId } = await render(<ArcReactor size={240} status="online" />);
    expect(getByTestId('arc-reactor')).toBeTruthy();
    expect(getByTestId('arc-reactor-bloom')).toBeTruthy();
    expect(getByTestId('arc-reactor-ring')).toBeTruthy();
    expect(getByTestId('arc-reactor-sweep')).toBeTruthy();
    expect(getByTestId('arc-reactor-wordmark').props.children).toBe('JARVIS');
  });

  it('honours a custom label', async () => {
    const { getByTestId } = await render(<ArcReactor size={200} status="online" label="ONLINE" />);
    expect(getByTestId('arc-reactor-wordmark').props.children).toBe('ONLINE');
  });

  it('sizes itself from the size prop', async () => {
    const { getByTestId } = await render(<ArcReactor size={180} status="alert" />);
    expect(getByTestId('arc-reactor').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ width: 180, height: 180 })])
    );
  });

  it('renders every status without crashing', async () => {
    for (const status of ['online', 'thinking', 'speaking', 'alert', 'boot']) {
      const { toJSON } = await render(<ArcReactor size={120} status={status} />);
      expect(toJSON()).toBeTruthy();
    }
  });
});
