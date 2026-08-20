import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { CommandBar } from '../CommandBar';
import { hudReducer, initialHudState } from '../../state/hudReducer';

/**
 * Composing a photo before it is sent.
 *
 * The camera button used to send on the shutter — `sendPhoto(result.shot, '')` —
 * so there was no way to ask anything specific about a picture and no way to
 * notice you had photographed the wrong thing. The gateway has always accepted a
 * caption; the phone never offered one.
 *
 * The second half matters as much and is easier to overlook: the bubble said only
 * "Photo". Verifying the reasoning-leak fix on 2026-08-20 meant screenshotting
 * the chat, and the answer could be read but never checked against what had
 * actually been sent. The word "Photo" is not a record of anything.
 */
describe('the compose bar with something attached', () => {
  /**
   * The whole point of the change. A photo with no caption is still the common
   * case — the fast path has to stay open, or this becomes a step people work
   * around by not sending photos.
   */
  it('sends with an empty field when something is attached', async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = await render(
      <CommandBar onSubmit={onSubmit} allowEmptySubmit attachment={<Text>draft</Text>} />
    );
    await fireEvent.press(getByTestId('command-send'));
    expect(onSubmit).toHaveBeenCalledWith('');
  });

  it('still refuses an empty field when nothing is attached', async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = await render(<CommandBar onSubmit={onSubmit} />);
    await fireEvent.press(getByTestId('command-send'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('passes the typed caption along with the attachment', async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = await render(
      <CommandBar onSubmit={onSubmit} allowEmptySubmit attachment={<Text>draft</Text>} />
    );
    await fireEvent.changeText(getByTestId('command-input'), '  what is this part  ');
    await fireEvent.press(getByTestId('command-send'));
    expect(onSubmit).toHaveBeenCalledWith('what is this part');
  });

  it('shows the attachment above the field', async () => {
    const { getByText } = await render(
      <CommandBar onSubmit={jest.fn()} attachment={<Text>draft</Text>} />
    );
    expect(getByText('draft')).toBeTruthy();
  });

  /**
   * Every other screen in the app passes no attachment, and the bar they get must
   * be the one they had — the row is keyed and its children are matched by key
   * across renders, so an extra wrapper is not free.
   */
  it('is unchanged for the screens that attach nothing', async () => {
    const onSubmit = jest.fn();
    const { getByTestId } = await render(<CommandBar onSubmit={onSubmit} />);
    await fireEvent.changeText(getByTestId('command-input'), 'lights on');
    await fireEvent.press(getByTestId('command-send'));
    expect(onSubmit).toHaveBeenCalledWith('lights on');
  });
});

describe('what the chat remembers about a photo', () => {
  it('keeps the picture beside the words', () => {
    const next = hudReducer(initialHudState, {
      type: 'local_command',
      text: '📷 what is this part',
      at: 1000,
      image: 'file:///cache/shot.jpg',
    });
    expect(next.chat[next.chat.length - 1]).toEqual({
      from: 'user',
      text: '📷 what is this part',
      at: 1000,
      image: 'file:///cache/shot.jpg',
    });
  });

  /**
   * An ordinary typed command carries no image and must not grow a key holding
   * `undefined` — the chat is persisted, and every entry ever written would then
   * round-trip a field that means nothing.
   */
  it('leaves an ordinary command alone', () => {
    const next = hudReducer(initialHudState, { type: 'local_command', text: 'lights on', at: 1000 });
    expect(next.chat[next.chat.length - 1]).toEqual({ from: 'user', text: 'lights on', at: 1000 });
  });
});
