import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Touchable } from '../ui/Touchable';
import { ToastProvider, useToast } from '../ui/Toast';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/Atoms';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function Trigger({ tone }: { tone?: 'good' | 'bad' }) {
  const toast = useToast();
  return (
    <Touchable testID="fire" accessibilityRole="button" onPress={() => toast.show('Running Daily Report', tone)}>
      <Text>fire</Text>
    </Touchable>
  );
}

describe('Touchable', () => {
  it('fires its press', async () => {
    const onPress = jest.fn();
    const { getByTestId } = await render(
      <Touchable testID="t" accessibilityRole="button" onPress={onPress}>
        <Text>tap</Text>
      </Touchable>
    );
    fireEvent.press(getByTestId('t'));
    expect(onPress).toHaveBeenCalled();
  });

  it('still forwards a caller onPressIn while running its own', async () => {
    const onPressIn = jest.fn();
    const { getByTestId } = await render(
      <Touchable testID="t" accessibilityRole="button" onPressIn={onPressIn}>
        <Text>tap</Text>
      </Touchable>
    );
    fireEvent(getByTestId('t'), 'pressIn');
    // the press animation owns an act scope; waiting on it keeps this test's
    // scope from leaking into the next one
    await waitFor(() => expect(onPressIn).toHaveBeenCalled());
  });

  it('does not fire when disabled', async () => {
    const onPress = jest.fn();
    const { getByTestId } = await render(
      <Touchable testID="t" accessibilityRole="button" disabled onPress={onPress}>
        <Text>tap</Text>
      </Touchable>
    );
    fireEvent.press(getByTestId('t'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Toast', () => {
  it('shows what was asked for', async () => {
    const { getByTestId } = await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <ToastProvider>
          <Trigger tone="good" />
        </ToastProvider>
      </SafeAreaProvider>
    );
    fireEvent.press(getByTestId('fire'));
    await waitFor(() => expect(getByTestId('toast-text').props.children).toBe('Running Daily Report'));
  });

  it('is a no-op outside a provider, so a bare component still renders', async () => {
    const { getByTestId } = await render(<Trigger />);
    fireEvent.press(getByTestId('fire'));
    expect(getByTestId('fire')).toBeTruthy();
  });
});

describe('Button', () => {
  it('blocks the press while busy', async () => {
    const onPress = jest.fn();
    const { getByTestId } = await render(<Button testID="b" label="CONNECT" busy onPress={onPress} />);
    fireEvent.press(getByTestId('b'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('EmptyState', () => {
  it('says what belongs here and how to start', async () => {
    const { getByTestId, getByText } = await render(
      <EmptyState testID="empty" text="No commands yet" hint="Type one above." />
    );
    expect(getByTestId('empty').props.children).toBe('No commands yet');
    expect(getByText('Type one above.')).toBeTruthy();
  });
});
