import { render } from '@testing-library/react-native';
import { Reticle } from '../Reticle';
import { StatusOrb, statusColor } from '../StatusOrb';
import { COLOR } from '../../theme/tokens';

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
  it('renders and labels the current status', async () => {
    const { getByText } = await render(<StatusOrb status="online" />);
    expect(getByText('ONLINE')).toBeTruthy();
  });

  it('labels an alert state', async () => {
    const { getByText } = await render(<StatusOrb status="alert" />);
    expect(getByText('ALERT')).toBeTruthy();
  });
});
