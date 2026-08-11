import { render, waitFor } from '@testing-library/react-native';
import { TypeLine } from '../TypeLine';

describe('TypeLine', () => {
  it('starts empty and fills the line in', async () => {
    const { getByTestId } = await render(<TypeLine testID="line" text="Hi you" speed={1} delay={0} />);
    expect(getByTestId('line').props.children).toBe('');
    await waitFor(() => expect(getByTestId('line').props.children).toBe('Hi you'));
  });

  it('shows the whole line at once when animations are off', async () => {
    const { getByTestId } = await render(<TypeLine testID="line" text="Hi you" enabled={false} />);
    expect(getByTestId('line').props.children).toBe('Hi you');
  });

  it('restarts cleanly when the text changes mid-run', async () => {
    const { getByTestId, rerender } = await render(<TypeLine testID="line" text="morning" speed={2} delay={0} />);
    await rerender(<TypeLine testID="line" text="evening" speed={1} delay={0} />);
    await waitFor(() => expect(getByTestId('line').props.children).toBe('evening'));
  });
});
