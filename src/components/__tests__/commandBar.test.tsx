import { Keyboard } from 'react-native';
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

  it('renders a mic button and calls onVoice when it is pressed', async () => {
    const onVoice = jest.fn();
    const { getByTestId } = await render(<CommandBar onSubmit={jest.fn()} onVoice={onVoice} />);
    expect(getByTestId('mic-icon')).toBeTruthy();
    await fireEvent.press(getByTestId('command-voice'));
    expect(onVoice).toHaveBeenCalledTimes(1);
  });

  it('does not trigger voice capture while disabled', async () => {
    const onVoice = jest.fn();
    const { getByTestId } = await render(<CommandBar onSubmit={jest.fn()} onVoice={onVoice} disabled />);
    await fireEvent.press(getByTestId('command-voice'));
    expect(onVoice).not.toHaveBeenCalled();
  });

  it('renders without a voice handler wired up', async () => {
    const { getByTestId } = await render(<CommandBar onSubmit={jest.fn()} />);
    await fireEvent.press(getByTestId('command-voice'));
    expect(getByTestId('command-voice')).toBeTruthy();
  });

  describe('putting the keyboard away', () => {
    // the return key blurs the field on its own, so SEND has to as well or the
    // same action leaves the keyboard up or down depending which one you used
    const dismiss = () => jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});

    it('closes the keyboard when SEND is tapped', async () => {
      const spy = dismiss();
      const { getByTestId } = await render(<CommandBar onSubmit={jest.fn()} />);
      await fireEvent.changeText(getByTestId('command-input'), 'system status');
      await fireEvent.press(getByTestId('command-send'));
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('closes it on the return key too, by the same path', async () => {
      const spy = dismiss();
      const { getByTestId } = await render(<CommandBar onSubmit={jest.fn()} />);
      await fireEvent.changeText(getByTestId('command-input'), 'system status');
      await fireEvent(getByTestId('command-input'), 'submitEditing');
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('leaves the keyboard alone when there is nothing to send', async () => {
      const spy = dismiss();
      const { getByTestId } = await render(<CommandBar onSubmit={jest.fn()} />);
      await fireEvent.press(getByTestId('command-send'));
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
