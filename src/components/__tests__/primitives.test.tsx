import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Panel } from '../Panel';
import { TransportPill } from '../TransportPill';
import { Scanline } from '../Scanline';
import { COLOR } from '../../theme/tokens';

describe('Panel', () => {
  it('renders its title uppercased and its children', async () => {
    const { getByText } = await render(
      <Panel title="vitals">
        <Text>CPU 34%</Text>
      </Panel>
    );
    expect(getByText('VITALS')).toBeTruthy();
    expect(getByText('CPU 34%')).toBeTruthy();
  });

  it('uses the cyan accent by default and honours an override', async () => {
    const a = await render(<Panel title="a" testID="p" />);
    expect(a.getByTestId('p-title').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: COLOR.cyan })])
    );
    const b = await render(<Panel title="b" testID="q" accent={COLOR.gold} />);
    expect(b.getByTestId('q-title').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: COLOR.gold })])
    );
  });
});

describe('TransportPill', () => {
  it('reads LAN when the desk link is open', async () => {
    const { getByText } = await render(<TransportPill mode="lan" status="open" />);
    expect(getByText(/LAN/)).toBeTruthy();
  });

  it('reads CLOUD in cloud mode', async () => {
    const { getByText } = await render(<TransportPill mode="cloud" status="open" />);
    expect(getByText(/CLOUD/)).toBeTruthy();
  });

  it('reads DARK when offline', async () => {
    const { getByText } = await render(<TransportPill mode="offline" status="closed" />);
    expect(getByText(/DARK/)).toBeTruthy();
  });

  it('shows a hollow dot until the socket is open', async () => {
    const closed = await render(<TransportPill mode="lan" status="connecting" />);
    expect(closed.getByText(/○/)).toBeTruthy();
    const open = await render(<TransportPill mode="lan" status="open" />);
    expect(open.getByText(/●/)).toBeTruthy();
  });

  it('colours cloud mode gold so a cloud session is never mistaken for lan', async () => {
    const { getByTestId } = await render(<TransportPill mode="cloud" status="open" />);
    expect(getByTestId('transport-pill-label').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: COLOR.gold })])
    );
  });
});

describe('Scanline', () => {
  it('renders without crashing', async () => {
    const { toJSON } = await render(<Scanline height={600} />);
    expect(toJSON()).toBeTruthy();
  });
});
