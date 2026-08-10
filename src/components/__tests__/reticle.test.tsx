import { render } from '@testing-library/react-native';
import { processColor } from 'react-native';
import { Reticle } from '../Reticle';
import { StatusOrb, statusColor } from '../StatusOrb';
import { COLOR } from '../../theme/tokens';

/** react-native-svg's extractBrush wraps a resolved fill color as this shape. */
const brush = (color: string) => ({ type: 0, payload: processColor(color) });

describe('statusColor', () => {
  it('is cyan for healthy states', () => {
    expect(statusColor('online')).toBe(COLOR.cyan);
    expect(statusColor('listening')).toBe(COLOR.cyan);
  });

  it('is gold while the agent is working or awaiting approval', () => {
    expect(statusColor('thinking')).toBe(COLOR.gold);
    expect(statusColor('agent')).toBe(COLOR.gold);
  });

  it('is red for alert and lockdown', () => {
    expect(statusColor('alert')).toBe(COLOR.red);
    expect(statusColor('lockdown')).toBe(COLOR.red);
  });

  it('is green while speaking', () => {
    expect(statusColor('speaking')).toBe(COLOR.green);
  });

  it('falls back to dim for anything unrecognised', () => {
    expect(statusColor('boot')).toBe(COLOR.dim);
    expect(statusColor('who knows')).toBe(COLOR.dim);
  });
});

describe('Reticle', () => {
  it('renders at the requested size', async () => {
    const { getByTestId } = await render(<Reticle size={180} status="online" />);
    expect(getByTestId('reticle')).toBeTruthy();
  });
});

describe('StatusOrb', () => {
  it('renders its luminous circles', async () => {
    const { getByTestId } = await render(<StatusOrb status="online" />);
    expect(getByTestId('status-orb')).toBeTruthy();
  });

  it('takes the online status color on its circles', async () => {
    const { getByTestId } = await render(<StatusOrb status="online" />);
    expect(getByTestId('status-orb-core').props.fill).toEqual(brush(statusColor('online')));
    expect(getByTestId('status-orb-halo').props.fill).toEqual(brush(statusColor('online')));
  });

  it('recolors its circles for an alert state', async () => {
    const { getByTestId } = await render(<StatusOrb status="alert" />);
    expect(getByTestId('status-orb-core').props.fill).toEqual(brush(statusColor('alert')));
    expect(getByTestId('status-orb-halo').props.fill).toEqual(brush(statusColor('alert')));
  });
});
