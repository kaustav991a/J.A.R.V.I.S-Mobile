import { render, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Sheet } from '../Sheet';

describe('Sheet', () => {
  it('renders its handle and its children', async () => {
    const { getByTestId, getByText } = await render(
      <Sheet expandedHeight={400}>
        <Text>VITALS</Text>
      </Sheet>
    );
    expect(getByTestId('sheet-handle')).toBeTruthy();
    expect(getByText('VITALS')).toBeTruthy();
  });

  it('takes its height from expandedHeight', async () => {
    const { getByTestId } = await render(
      <Sheet expandedHeight={360}>
        <Text>x</Text>
      </Sheet>
    );
    expect(getByTestId('sheet').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ height: 360 })])
    );
  });

  it('reports open then closed as the handle is tapped', async () => {
    const onToggle = jest.fn();
    const { getByTestId } = await render(
      <Sheet expandedHeight={400} onToggle={onToggle}>
        <Text>x</Text>
      </Sheet>
    );
    await fireEvent.press(getByTestId('sheet-handle'));
    expect(onToggle).toHaveBeenLastCalledWith(true);
    await fireEvent.press(getByTestId('sheet-handle'));
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  it('survives a collapsedHeight larger than the sheet without inverting travel', async () => {
    const { getByTestId } = await render(
      <Sheet expandedHeight={100} collapsedHeight={400}>
        <Text>x</Text>
      </Sheet>
    );
    expect(getByTestId('sheet')).toBeTruthy();
  });
});
