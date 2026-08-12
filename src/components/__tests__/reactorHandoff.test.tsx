import { Text } from 'react-native';
import { act, render, renderHook } from '@testing-library/react-native';
import { HandoffAnchor, ReactorHandoffProvider, useReactorHandoff } from '../ReactorHandoff';

const mount = async () =>
  await renderHook(() => useReactorHandoff(), { wrapper: ReactorHandoffProvider });

describe('ReactorHandoffProvider', () => {
  it('starts with neither reactor placed', async () => {
    const { result } = await mount();
    expect(result.current?.origin).toBeNull();
    expect(result.current?.target).toBeNull();
  });

  it('keeps the two reactors apart', async () => {
    const { result } = await mount();
    await act(async () => {
      result.current?.register('origin', { x: 10, y: 20, size: 300 });
      result.current?.register('target', { x: 300, y: 120, size: 84 });
    });
    expect(result.current?.origin).toEqual({ x: 10, y: 20, size: 300 });
    expect(result.current?.target).toEqual({ x: 300, y: 120, size: 84 });
  });

  it('ignores a re-post of the same frame', async () => {
    // every layout pass re-measures; re-rendering on each identical result would
    // restart the animation this exists to drive
    const { result } = await mount();
    await act(async () => {
      result.current?.register('target', { x: 300, y: 120, size: 84 });
    });
    const first = result.current?.target;
    await act(async () => {
      result.current?.register('target', { x: 300, y: 120, size: 84 });
    });
    expect(result.current?.target).toBe(first);
  });

  it('takes a genuinely moved frame', async () => {
    const { result } = await mount();
    await act(async () => {
      result.current?.register('target', { x: 300, y: 120, size: 84 });
    });
    await act(async () => {
      result.current?.register('target', { x: 300, y: 121, size: 84 });
    });
    expect(result.current?.target).toEqual({ x: 300, y: 121, size: 84 });
  });
});

describe('HandoffAnchor', () => {
  it('renders what it wraps, measured or not', async () => {
    const { getByText } = await render(
      <ReactorHandoffProvider>
        <HandoffAnchor id="target">
          <Text>ring</Text>
        </HandoffAnchor>
      </ReactorHandoffProvider>
    );
    expect(getByText('ring')).toBeTruthy();
  });

  it('works with no provider above it, rather than throwing', async () => {
    // a reactor rendered outside the provider simply never hands off
    const { getByText } = await render(
      <HandoffAnchor id="origin">
        <Text>ring</Text>
      </HandoffAnchor>
    );
    expect(getByText('ring')).toBeTruthy();
  });
});
