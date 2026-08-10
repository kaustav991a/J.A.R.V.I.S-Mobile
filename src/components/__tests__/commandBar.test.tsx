import { render, fireEvent } from '@testing-library/react-native';
import { CommandBar } from '../CommandBar';

describe('CommandBar', () => {
  it('submits trimmed text and clears the field', async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = await render(<CommandBar onSubmit={onSubmit} />);
    const input = getByTestId('command-input');
    await fireEvent.changeText(input, '  lights on  ');
    await fireEvent(input, 'submitEditing');
    expect(onSubmit).toHaveBeenCalledWith('lights on');
    expect(input.props.value).toBe('');
  });

  it('submits when the send button is pressed', async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = await render(<CommandBar onSubmit={onSubmit} />);
    await fireEvent.changeText(getByTestId('command-input'), 'status report');
    await fireEvent.press(getByTestId('command-send'));
    expect(onSubmit).toHaveBeenCalledWith('status report');
  });

  it('ignores an empty or whitespace-only submit', async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = await render(<CommandBar onSubmit={onSubmit} />);
    await fireEvent(getByTestId('command-input'), 'submitEditing');
    await fireEvent.changeText(getByTestId('command-input'), '    ');
    await fireEvent.press(getByTestId('command-send'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit while disabled', async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = await render(<CommandBar onSubmit={onSubmit} disabled />);
    await fireEvent.changeText(getByTestId('command-input'), 'lights on');
    await fireEvent.press(getByTestId('command-send'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders the given placeholder', async () => {
    const { getByPlaceholderText } = await render(<CommandBar onSubmit={jest.fn()} placeholder="link lost" />);
    expect(getByPlaceholderText('link lost')).toBeTruthy();
  });
});
