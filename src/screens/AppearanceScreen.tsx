import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Slider } from '../components/ui/Slider';
import { Screen, SectionLabel } from '../components/ui/Atoms';
import { ScreenTitle } from '../components/ui/ScreenTitle';
import { COLOR, SPACE, TYPE } from '../theme/tokens';
import { ACCENTS, AccentKey, ThemeChoice, useAppearance } from '../theme/appearance';

const THEMES: ReadonlyArray<{ key: ThemeChoice; label: string }> = [
  { key: 'dark', label: 'Dark' },
  { key: 'system', label: 'System' },
];

export function AppearanceScreen() {
  const { theme, setTheme, accentKey, setAccentKey, accent, glow, setGlow, animations, setAnimations } =
    useAppearance();

  return (
    <Screen testID="appearance-screen">
      <ScreenTitle title="APPEARANCE" />
      <SectionLabel>Theme</SectionLabel>
      <View style={styles.group}>
        {THEMES.map((t, i) => {
          const selected = theme === t.key;
          return (
            <Pressable
              key={t.key}
              testID={`theme-${t.key}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setTheme(t.key)}
              style={[styles.row, i < THEMES.length - 1 && styles.divided]}
            >
              <Ionicons
                name={selected ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={selected ? accent : COLOR.dim}
              />
              <Text style={styles.rowLabel}>{t.label}</Text>
              {selected ? <Ionicons name="checkmark-circle" size={18} color={accent} /> : null}
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.note}>The app is dark by design; System is kept for parity and behaves the same.</Text>

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
