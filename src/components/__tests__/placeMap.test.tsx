import { fireEvent, render } from '@testing-library/react-native';

import { PlaceMap } from '../PlaceMap';
import { AppearanceProvider } from '../../theme/appearance';

/**
 * The drawing that answers "can I see the radius and the overlapped area".
 *
 * The arithmetic is pinned in `lib/__tests__/placeMap.test.ts`; these are about the
 * two things the picture has to say out loud, because a diagram nobody can interpret
 * is decoration: that the circles overlap, and that having nothing to draw is a state
 * with words rather than an empty box.
 */

const place = (label: string, lat: number, lon: number) => ({
  id: label.toLowerCase(),
  label,
  lat,
  lon,
  area: '',
});

const HOME = place('Home', 22.75, 88.37);
/** about 150 m away, which is the reported case */
const AREA = place('My area', 22.75135, 88.37);
const OFFICE = place('Office', 22.58, 88.43);

const mount = (ui: React.ReactElement) => render(<AppearanceProvider>{ui}</AppearanceProvider>);

/** the caption is assembled from parts, so read it as the sentence it renders as */
const captionOf = (node: { props: Record<string, unknown> }): string =>
  ([] as unknown[]).concat(node.props.children as unknown).join('');

describe('the place map', () => {
  it('says so when two circles overlap, rather than leaving it to be measured by eye', async () => {
    const { findByTestId } = await mount(<PlaceMap places={[HOME, AREA]} fix={null} />);
    expect(captionOf(await findByTestId('place-map-caption'))).toContain('overlap');
  });

  it('explains the circles when nothing overlaps', async () => {
    const { findByTestId } = await mount(<PlaceMap places={[HOME, OFFICE]} fix={null} />);
    expect(captionOf(await findByTestId('place-map-caption'))).toContain('how close');
  });

  it('draws the reading and its error when there is one', async () => {
    const { findByTestId } = await mount(
      <PlaceMap places={[HOME]} fix={{ lat: 22.75, lon: 88.37, accuracy: 30 }} />
    );
    expect(await findByTestId('place-map-accuracy')).toBeTruthy();
  });

  it('says how many places were too far to draw, rather than dropping them quietly', async () => {
    // reported from the office: ten places across forty kilometres drew as dots
    const { findByTestId } = await mount(<PlaceMap places={[HOME, AREA, OFFICE]} fix={null} />);
    expect(captionOf(await findByTestId('place-map-caption'))).toContain('too far away');
  });

  it('says what to do when there is nothing to draw', async () => {
    // an empty box reads as a broken panel, which is the confusion this app keeps closing
    const { findByTestId } = await mount(<PlaceMap places={[]} fix={null} />);
    expect(await findByTestId('place-map-empty')).toBeTruthy();
  });
});

describe('the reading pulses, and stops when asked to', () => {
  it('draws a sonar ring over the reading', async () => {
    const { findByTestId } = await mount(
      <PlaceMap places={[HOME]} fix={{ lat: 22.75, lon: 88.37, accuracy: 20 }} />
    );
    expect(await findByTestId('place-map-pulse')).toBeTruthy();
  });

  it('has nothing to pulse when there is no reading', async () => {
    const { queryByTestId } = await mount(<PlaceMap places={[HOME]} fix={null} />);
    expect(queryByTestId('place-map-pulse')).toBeNull();
  });
});

describe('roads under the circles', () => {
  it('draws map tiles when it knows where to centre them', async () => {
    const { findAllByTestId } = await mount(
      <PlaceMap places={[HOME]} fix={{ lat: 22.75, lon: 88.37, accuracy: 20 }} />
    );
    expect((await findAllByTestId('place-map-tile')).length).toBeGreaterThan(0);
  });

  it('credits OpenStreetMap, because the licence asks and the servers are donated', async () => {
    const { findByTestId } = await mount(
      <PlaceMap places={[HOME]} fix={{ lat: 22.75, lon: 88.37, accuracy: 20 }} />
    );
    expect(captionOf(await findByTestId('place-map-credit'))).toContain('OpenStreetMap');
  });
});

describe('the tilted view', () => {
  const HERE = { lat: 22.75, lon: 88.37, accuracy: 12, altitude: 24, altitudeAccuracy: 30 };

  it('offers the tilt, and starts flat', async () => {
    // flat answers the overlap question; tilted, the circles are ellipses and cannot
    // be compared by eye — so the default is the one that measures
    const { findByTestId, queryByTestId } = await mount(<PlaceMap places={[HOME]} fix={HERE} />);
    expect(await findByTestId('place-map-tilt')).toBeTruthy();
    expect(queryByTestId('place-map-height-band')).toBeNull();
  });

  it('draws the height as a band once tilted', async () => {
    const { findByTestId } = await mount(<PlaceMap places={[HOME]} fix={HERE} />);
    fireEvent.press(await findByTestId('place-map-tilt'));
    expect(await findByTestId('place-map-height-band')).toBeTruthy();
  });
});
