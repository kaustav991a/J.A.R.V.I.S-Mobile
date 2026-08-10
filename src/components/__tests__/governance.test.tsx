import { render, fireEvent } from '@testing-library/react-native';
import { GovernancePanel } from '../GovernancePanel';
import type { ParkedAction } from '../../state/types';

const parked = (over: Partial<ParkedAction> = {}): ParkedAction => ({
  id: 'a1',
  goal: 'tidy downloads',
  action: 'delete 3 files',
  detail: 'setup_old.exe, node_v12.msi, tmp.iso',
  risk: 'high',
  at: 1000,
  resolving: false,
  ...over,
});

describe('GovernancePanel', () => {
  it('renders nothing when there is nothing parked', async () => {
    const result = await render(<GovernancePanel parked={[]} onDecide={jest.fn()} />);
    expect(result.toJSON()).toBeNull();
  });

  it('shows the action, its goal and its detail', async () => {
    const { getByText } = await render(<GovernancePanel parked={[parked()]} onDecide={jest.fn()} />);
    expect(getByText('delete 3 files')).toBeTruthy();
    expect(getByText(/tidy downloads/)).toBeTruthy();
    expect(getByText(/setup_old.exe/)).toBeTruthy();
  });

  it('calls onDecide with approved=true when ALLOW is pressed', async () => {
    const onDecide = jest.fn();
    const { getByTestId } = await render(<GovernancePanel parked={[parked()]} onDecide={onDecide} />);
    fireEvent.press(getByTestId('allow-a1'));
    expect(onDecide).toHaveBeenCalledWith('a1', true);
  });

  it('calls onDecide with approved=false when DENY is pressed', async () => {
    const onDecide = jest.fn();
    const { getByTestId } = await render(<GovernancePanel parked={[parked()]} onDecide={onDecide} />);
    fireEvent.press(getByTestId('deny-a1'));
    expect(onDecide).toHaveBeenCalledWith('a1', false);
  });

  it('renders one card per parked action', async () => {
    const { getByTestId } = await render(
      <GovernancePanel parked={[parked(), parked({ id: 'a2', action: 'reboot pc' })]} onDecide={jest.fn()} />
    );
    expect(getByTestId('parked-a1')).toBeTruthy();
    expect(getByTestId('parked-a2')).toBeTruthy();
  });

  it('does not fire onDecide twice while an action is resolving', async () => {
    const onDecide = jest.fn();
    const { getByTestId } = await render(<GovernancePanel parked={[parked({ resolving: true })]} onDecide={onDecide} />);
    fireEvent.press(getByTestId('allow-a1'));
    expect(onDecide).not.toHaveBeenCalled();
  });

  it('does not fire onDecide when the whole panel is disabled', async () => {
    const onDecide = jest.fn();
    const { getByTestId } = await render(<GovernancePanel parked={[parked()]} onDecide={onDecide} disabled />);
    fireEvent.press(getByTestId('deny-a1'));
    expect(onDecide).not.toHaveBeenCalled();
  });

  it('labels a resolving action as sending', async () => {
    const { getByText } = await render(<GovernancePanel parked={[parked({ resolving: true })]} onDecide={jest.fn()} />);
    expect(getByText(/SENDING/i)).toBeTruthy();
  });
});
