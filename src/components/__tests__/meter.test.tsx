import { render } from '@testing-library/react-native';
import { Meter } from '../Meter';

describe('Meter', () => {
  it('fills no segments at 0', async () => {
    const { getAllByTestId, queryAllByTestId } = await render(<Meter value={0} segments={10} />);
    expect(queryAllByTestId('meter-segment-filled')).toHaveLength(0);
    expect(getAllByTestId('meter-segment-empty')).toHaveLength(10);
  });

  it('fills all segments at 100', async () => {
    const { getAllByTestId, queryAllByTestId } = await render(<Meter value={100} segments={10} />);
    expect(getAllByTestId('meter-segment-filled')).toHaveLength(10);
    expect(queryAllByTestId('meter-segment-empty')).toHaveLength(0);
  });

  it('fills half the segments at 50', async () => {
    const { getAllByTestId } = await render(<Meter value={50} segments={10} />);
    expect(getAllByTestId('meter-segment-filled')).toHaveLength(5);
    expect(getAllByTestId('meter-segment-empty')).toHaveLength(5);
  });

  it('clamps values above 100', async () => {
    const { getAllByTestId, queryAllByTestId } = await render(<Meter value={140} segments={10} />);
    expect(getAllByTestId('meter-segment-filled')).toHaveLength(10);
    expect(queryAllByTestId('meter-segment-empty')).toHaveLength(0);
  });

  it('clamps values below 0', async () => {
    const { getAllByTestId, queryAllByTestId } = await render(<Meter value={-25} segments={10} />);
    expect(queryAllByTestId('meter-segment-filled')).toHaveLength(0);
    expect(getAllByTestId('meter-segment-empty')).toHaveLength(10);
  });

  it('clamps non-finite input to empty', async () => {
    const { queryAllByTestId, getAllByTestId } = await render(<Meter value={NaN} segments={10} />);
    expect(queryAllByTestId('meter-segment-filled')).toHaveLength(0);
    expect(getAllByTestId('meter-segment-empty')).toHaveLength(10);
  });
});
