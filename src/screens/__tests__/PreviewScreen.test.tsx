import { render } from '@testing-library/react-native';
import { PreviewScreen } from '../PreviewScreen';

describe('PreviewScreen', () => {
  it('renders the header brand and the fixture governance action', async () => {
    const { getByText } = await render(<PreviewScreen />);
    expect(getByText('◦ J.A.R.V.I.S')).toBeTruthy();
    expect(getByText('delete 3 files')).toBeTruthy();
  });
});
