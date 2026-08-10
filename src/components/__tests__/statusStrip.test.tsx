import { render } from '@testing-library/react-native';
import { StatusStrip } from '../StatusStrip';
import { COLOR } from '../../theme/tokens';

describe('StatusStrip', () => {
  it('uppercases the status and the activity', async () => {
    const { getByTestId } = await render(
      <StatusStrip status="online" activity="idle" mode="lan" linkStatus="open" />
    );
    expect(getByTestId('status-strip-status').props.children).toBe('ONLINE');
    expect(getByTestId('status-strip-activity').props.children).toBe('IDLE');
  });

  it('tints the status word from the status colour', async () => {
    const { getByTestId } = await render(
      <StatusStrip status="alert" activity="approval" mode="lan" linkStatus="open" />
    );
    expect(getByTestId('status-strip-status').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: COLOR.red })])
    );
  });

  it('carries the transport pill so cloud mode stays legible', async () => {
    const { getByText } = await render(
      <StatusStrip status="online" activity="idle" mode="cloud" linkStatus="open" />
    );
    expect(getByText(/CLOUD/)).toBeTruthy();
  });

  it('reads DARK when the link is down', async () => {
    const { getByText } = await render(
      <StatusStrip status="boot" activity="idle" mode="offline" linkStatus="closed" />
    );
    expect(getByText(/DARK/)).toBeTruthy();
  });
});
