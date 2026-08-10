import { render } from '@testing-library/react-native';
import { VitalsPanel } from '../VitalsPanel';
import { TracePanel } from '../TracePanel';
import type { TraceEntry } from '../../state/types';

describe('VitalsPanel', () => {
  it('renders cpu and memory readouts', async () => {
    const { getByText } = await render(<VitalsPanel telemetry={{ cpu: 34, mem: 61 }} />);
    expect(getByText('CPU')).toBeTruthy();
    expect(getByText('34%')).toBeTruthy();
    expect(getByText('MEM')).toBeTruthy();
    expect(getByText('61%')).toBeTruthy();
  });

  it('shows a dash for metrics the backend did not send', async () => {
    const { getByTestId } = await render(<VitalsPanel telemetry={{ cpu: 34 }} />);
    expect(getByTestId('vital-mem').props.children).toBe('—');
  });

  it('renders a waiting state before any telemetry arrives', async () => {
    const { getByText } = await render(<VitalsPanel telemetry={null} />);
    expect(getByText(/AWAITING/i)).toBeTruthy();
  });
});

describe('TracePanel', () => {
  const entry = (event: string, at: number): TraceEntry => ({ goal: 'tidy downloads', event, detail: 'listing', step: 1, at });

  it('renders trace events newest last', async () => {
    const { getByText } = await render(<TracePanel trace={[entry('thinking', 1), entry('plan', 2)]} />);
    expect(getByText(/thinking/)).toBeTruthy();
    expect(getByText(/plan/)).toBeTruthy();
  });

  it('shows the goal once at the top', async () => {
    const { getAllByText } = await render(<TracePanel trace={[entry('thinking', 1), entry('plan', 2)]} />);
    expect(getAllByText(/tidy downloads/)).toHaveLength(1);
  });

  it('renders an idle line when the agent has done nothing', async () => {
    const { getByText } = await render(<TracePanel trace={[]} />);
    expect(getByText(/IDLE/i)).toBeTruthy();
  });
});
