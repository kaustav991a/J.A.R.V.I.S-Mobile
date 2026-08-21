import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Slider } from '../components/ui/Slider';
import { Screen, SectionLabel } from '../components/ui/Atoms';
import { ScreenTitle } from '../components/ui/ScreenTitle';
import { COLOR, SPACE, TYPE } from '../theme/tokens';
import { ACCENTS, AccentKey, useAppearance } from '../theme/appearance';

export function AppearanceScreen() {
  const { accentKey, setAccentKey, accent, glow, setGlow, animations, setAnimations } =
    useAppearance();

  return (
    <Screen testID="appearance-screen">
      <ScreenTitle title="APPEARANCE" />
      {/*
        The theme picker is gone, and that is the decision rather than a deferral.

        It offered Dark and System, and System behaved identically — the screen even
        said so in a note underneath. A control that cannot change anything is worse
        than an absent one: it invites a tap, answers nothing, and quietly teaches
        that the rest of this screen might be decoration too.

        The instrument look IS the product here, so a light variant is not owed. If
        a real user asks for one, it comes back as a theme that does something.
      */}
      <SectionLabel>Accent colour</SectionLabel>
      <View style={styles.swatches}>
        {(Object.keys(ACCENTS) as AccentKey[]).map((key) => {
          const selected = accentKey === key;
          return (
            <Pressable
              key={key}
              testID={`accent-${key}`}
              accessibilityRole="radio"
              accessibilityLabel={key}
              accessibilityState={{ selected }}
              onPress={() => setAccentKey(key)}
              style={[styles.swatch, { backgroundColor: ACCENTS[key] }, selected && styles.swatchOn]}
            >
              {selected ? <Ionicons name="checkmark" size={18} color={COLOR.bg} /> : null}
            </Pressable>
          );
        })}
      </View>

      <SectionLabel>Glow intensity</SectionLabel>
      <Slider testID="glow-slider" value={glow} onChange={setGlow} />

      <SectionLabel>Animation</SectionLabel>
      <View style={styles.group}>
        <View style={styles.row}>
          <Text style={[styles.rowLabel, styles.rowLabelLead]}>Enable animations</Text>
          <Switch
            testID="animations-switch"
            value={animations}
            onValueChange={setAnimations}
            trackColor={{ true: accent, false: COLOR.line }}
            thumbColor={COLOR.white}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: COLOR.panel,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md + 2,
  },
  divided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLOR.line },
  rowLabel: { ...TYPE.dataValue, fontSize: 14, color: COLOR.white },
  rowLabelLead: { flex: 1 },
  note: { ...TYPE.dataLabel, color: COLOR.dim, opacity: 0.7, marginTop: SPACE.sm },
  swatches: { flexDirection: 'row', gap: SPACE.md },
  swatch: { width: 38, height: 38, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  swatchOn: { borderWidth: 2, borderColor: COLOR.white },
  slider: { width: '100%', height: 40 },
});
