import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Line, Rect, Text as SvgText } from 'react-native-svg';

import { labelAt, mapPlot } from '../lib/placeMap';
import { tilesFor } from '../lib/tiles';
import type { KnownPlace } from '../lib/knownPlaces';
import { COLOR, RADIUS, SPACE, TYPE } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';

/**
 * Your named places, drawn to scale, with the circles the app matches on.
 *
 * **This exists because of a specific confusion**, and it is a diagnostic rather than
 * a map: Home and a named area about 150 metres apart, each inside the other's match
 * circle, so walking between them never changed what the app said. Tiles would answer
 * a different question. What was actually asked — *can I see the radius and the
 * overlapped area* — is a question about proportion, and proportion is drawing.
 *
 * `react-native-svg` rather than a map component, and that is not a compromise: it is
 * already a dependency, so this ships over the air, where every real map on Android is
 * a native module and therefore a new build. It also draws the one thing a map would
 * not — the radius itself.
 *
 * The dashed circle is the reading's own error. When it is wider than the gap between
 * two places, the app refuses to name either, and this is where you can see why.
 */
export function PlaceMap({
  places,
  fix,
  size = 260,
}: {
  places: KnownPlace[];
  fix: { lat: number; lon: number; accuracy?: number; altitude?: number; altitudeAccuracy?: number } | null;
  size?: number;
}) {
  const { accent, animations } = useAppearance();
  /**
   * Flat by default, and that is not timidity.
   *
   * The tilt is what makes a height visible, and it costs the thing this panel was
   * built to answer: tilted, the match circles become ellipses, and two ellipses
   * cannot be compared by eye the way two circles can. So the overlap question keeps
   * the flat view, and the tilt is a look.
   */
  const [tilt, setTilt] = useState(false);
  const plot = mapPlot({ places, fix, size, tilt });

  /**
   * The sonar ring under the reading, on a View rather than an SVG attribute.
   *
   * `useAnimatedProps` on a `react-native-svg` shape silently does nothing on this
   * stack — reanimated 4 with svg 15 — and falls back to the static props with no
   * error at all. `ArcReactor` paid for that with an ignition nobody ever saw. A
   * plain absolutely-positioned View animates reliably, so the ring is one of those
   * sitting over the canvas at the reading's coordinates.
   */
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (!animations) return;
    pulse.value = 0;
    pulse.value = withRepeat(
      withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) }),
      -1,
      false
    );
  }, [animations, pulse]);

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - pulse.value),
    transform: [{ scale: 0.4 + pulse.value * 2.2 }],
  }));

  if (!plot.places.length && !plot.you) {
    return (
      <View style={styles.empty} testID="place-map-empty">
        <Text style={styles.caption}>
          Nothing to draw yet. Name a place on the Places screen and it appears here, with the
          circle the app matches on.
        </Text>
      </View>
    );
  }

  /**
   * Roads under the circles.
   *
   * Centred on the same point the plot is centred on and scaled to the same metres
   * per pixel, so the streets sit under the markers rather than beside them. Tiles
   * are raster PNGs over the network: with no signal there are simply no roads, and
   * the drawing that matters — the circles and the reading — is unaffected.
   */
  const centre = fix ?? places[0] ?? null;
  const view = centre
    ? tilesFor({ centre, metresPerPixel: plot.metresPerPixel, size })
    : null;

  /** a scale bar of a round number of metres, so the drawing can be measured by eye */
  const barM = plot.metresPerPixel * size > 600 ? 200 : 50;
  const barPx = barM / plot.metresPerPixel;

  return (
    <View testID="place-map">
      <View style={[styles.frame, { width: size, height: size }]}>
        {view?.tiles.map((t) => (
          <Image
            key={`${t.z}-${t.x}-${t.y}`}
            testID="place-map-tile"
            source={{ uri: t.url }}
            style={{
              position: 'absolute',
              left: t.left,
              top: t.top,
              width: view.tileSize,
              height: view.tileSize,
              // a dark basemap belongs at nearly full strength: it was turned down to
              // a third only because the light one fought the app
              opacity: 0.85,
            }}
          />
        ))}

      <Svg width={size} height={size}>
        {plot.places.map((p) => (
          <Ellipse
            key={`ring-${p.label}`}
            cx={p.x}
            cy={p.y}
            rx={p.r}
            ry={p.r * plot.groundSquash}
            fill={accent}
            fillOpacity={0.07}
            stroke={accent}
            strokeOpacity={0.35}
            strokeWidth={1}
          />
        ))}
        {plot.you ? (
          <Circle
            testID="place-map-accuracy"
            cx={plot.you.x}
            cy={plot.you.y - (tilt ? plot.you.lift : 0)}
            r={plot.you.r}
            fill={COLOR.green}
            fillOpacity={0.08}
            stroke={COLOR.green}
            strokeOpacity={0.5}
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        ) : null}
        {plot.places.map((p) => (
          <Circle key={`dot-${p.label}`} cx={p.x} cy={p.y} r={3.5} fill={accent} />
        ))}
        {plot.places.map((p) => {
          // a label centred on a circle at the edge is clipped, not wrapped: the phone
          // rendered "Sector V Metro Station" as "or V Metro Station"
          const label = labelAt(p.x, size);
          return (
            <SvgText
              key={`label-${p.label}`}
              x={label.x}
              y={p.y - 9}
              fill={COLOR.white}
              fontSize={10}
              textAnchor={label.anchor}
            >
              {p.label}
            </SvgText>
          );
        })}
        {plot.you && tilt && plot.you.lift > 0 ? (
          <>
            {/* the stalk, from the ground up to the reading */}
            <Line
              x1={plot.you.x}
              y1={plot.you.y}
              x2={plot.you.x}
              y2={plot.you.y - plot.you.lift}
              stroke={COLOR.green}
              strokeOpacity={0.5}
              strokeDasharray="2 3"
            />
            {/*
              The error, drawn as the band it is.

              GPS vertical error runs one and a half to three times the horizontal, so
              this band is usually taller than a building. That is the finding, not a
              flaw in the drawing: a floor is three metres and lives inside it.
            */}
            <Rect
              testID="place-map-height-band"
              x={plot.you.x - 5}
              y={plot.you.y - plot.you.lift - plot.you.liftError}
              width={10}
              height={Math.max(plot.you.liftError * 2, 2)}
              fill={COLOR.green}
              fillOpacity={0.14}
            />
            {/* where the ground under you is, so the height has something to be above */}
            <Ellipse
              cx={plot.you.x}
              cy={plot.you.y}
              rx={5}
              ry={5 * plot.groundSquash}
              fill={COLOR.green}
              fillOpacity={0.3}
            />
          </>
        ) : null}
        {plot.you ? (
          <Circle
            cx={plot.you.x}
            cy={plot.you.y - (tilt ? plot.you.lift : 0)}
            r={4.5}
            fill={COLOR.green}
          />
        ) : null}
        {/* the scale bar, bottom left, so the circles are a measurement */}
        <Line
          x1={10}
          y1={size - 12}
          x2={10 + barPx}
          y2={size - 12}
          stroke={COLOR.dim}
          strokeWidth={2}
        />
        <SvgText x={10} y={size - 18} fill={COLOR.dim} fontSize={9}>
          {`${barM} m`}
        </SvgText>
      </Svg>
      </View>

      {/*
        Over the canvas rather than inside it, and only when animation is allowed:
        a toggle in Appearance that stops the reactor must stop this too, or it is
        a setting that half works.
      */}
      {plot.you && animations ? (
        <Animated.View
          testID="place-map-pulse"
          pointerEvents="none"
          style={[
            styles.pulse,
            { left: plot.you.x - PULSE_PX, top: plot.you.y - PULSE_PX },
            ringStyle,
          ]}
        />
      ) : null}

      <Pressable
        testID="place-map-tilt"
        accessibilityRole="button"
        accessibilityLabel={tilt ? 'Lay the map flat' : 'Tilt the map to show height'}
        hitSlop={8}
        onPress={() => setTilt((on) => !on)}
        style={({ pressed }) => [styles.tilt, pressed ? styles.pressed : null]}
      >
        <Text style={[styles.tiltText, { color: accent }]}>{tilt ? 'FLAT' : '3D'}</Text>
      </Pressable>

      <Text testID="place-map-caption" style={styles.caption}>
        {plot.overlapping
          ? 'Two of these circles overlap. Standing in the overlap, the app cannot tell which place you are at — and says nothing rather than guessing.'
          : 'Each circle is how close you must be for the app to call it that place. The dashed ring is how sure this reading is.'}
        {plot.hidden > 0
          ? ` ${plot.hidden} other named ${plot.hidden === 1 ? 'place is' : 'places are'} too far away to draw at this scale.`
          : ''}
      </Text>
      {/*
        Height, and what it cannot tell you.

        Asked as "we are on the sixth floor, can we do anything about it". GPS puts
        vertical error at roughly one and a half to three times the horizontal, so a
        reading good to 15 m on the ground is good to perhaps 40 in height — against
        a floor of about three. Saying the number and its error is the honest form of
        no; printing a floor from it would be inventing one.
      */}
      {typeof fix?.altitude === 'number' ? (
        <Text testID="place-map-height" style={styles.credit}>
          {`About ${Math.round(fix.altitude)} m above sea level` +
            (typeof fix.altitudeAccuracy === 'number'
              ? `, give or take ${Math.round(fix.altitudeAccuracy)} — too loose to name a floor.`
              : '.')}
        </Text>
      ) : null}
      {view?.tiles.length ? (
        <Text testID="place-map-credit" style={styles.credit}>
          {`Roads ${view.attribution}`}
        </Text>
      ) : null}
    </View>
  );
}

/** the resting radius of the sonar ring, in pixels, before it is scaled */
const PULSE_PX = 14;

const styles = StyleSheet.create({
  pulse: {
    position: 'absolute',
    width: PULSE_PX * 2,
    height: PULSE_PX * 2,
    borderRadius: PULSE_PX,
    borderWidth: 1.5,
    borderColor: COLOR.green,
  },
  empty: {
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    padding: SPACE.lg,
  },
  caption: { ...TYPE.meta, fontSize: 11, lineHeight: 17, color: COLOR.dim, marginTop: SPACE.sm },
  /** the tiles are clipped to the canvas, or they spill across the whole screen */
  frame: { overflow: 'hidden', borderRadius: RADIUS.lg, backgroundColor: 'rgba(4,14,32,0.6)' },
  credit: { ...TYPE.meta, fontSize: 9, color: COLOR.dim, marginTop: 2 },
  tilt: { position: 'absolute', right: 8, top: 8, paddingHorizontal: 8, paddingVertical: 4 },
  tiltText: { ...TYPE.dataLabel, fontSize: 10, letterSpacing: 1.5 },
  pressed: { opacity: 0.55 },
});
