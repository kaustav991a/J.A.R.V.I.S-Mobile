import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLOR, RADIUS, SPACE, TYPE } from '../theme/tokens';
import { useAppearance } from '../theme/appearance';
import { useJarvis } from '../state/JarvisProvider';
import { Touchable } from './ui/Touchable';

export type QuickMenuProps = {
  visible: boolean;
  onClose: () => void;
  /** the sheet closes first, then the caller navigates */
  onGo: (to: 'connection' | 'appearance' | 'about') => void;
};

/**
 * What the hamburger opens: the three switches worth reaching without leaving
 * Home, and the three screens worth jumping to.
 *
 * It deliberately is not a second copy of the Settings tab — a drawer that
 * mirrors a tab teaches the user that two controls do the same thing. It holds
 * only state they may want to change *while looking at the HUD*.
 */
export function QuickMenu({ visible, onClose, onGo }: QuickMenuProps) {
  const insets = useSafeAreaInsets();
  const { accent, animations, setAnimations, glow, setGlow } = useAppearance();
  const { connected, connecting, mode, demo, setDemo } = useJarvis();

  const link = connecting ? 'Connecting' : connected ? `Linked over ${mode.toUpperCase()}` : 'No desk link';
  const linkTint = connected ? COLOR.green : connecting ? COLOR.gold : COLOR.red;

  const go = (to: 'connection' | 'appearance' | 'about') => {
    onClose();
    onGo(to);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable testID="quick-menu-scrim" style={styles.scrim} onPress={onClose} accessibilityLabel="Close menu" />
      <View style={[styles.sheet, { paddingTop: insets.top + SPACE.lg }]} testID="quick-menu">
        <View style={styles.head}>
          <Text style={styles.title}>JARVIS</Text>
          <View style={styles.linkRow}>
            <View style={[styles.dot, { backgroundColor: linkTint }]} />
            <Text style={styles.link}>{link}</Text>
          </View>
        </View>

        <View style={styles.group}>
          <Row
            icon="pulse-outline"
            label="Demo data"
            hint="Fills the app from a stand-in desk"
            trailing={
              <Switch
                testID="quick-demo"
                value={demo}
                onValueChange={setDemo}
                trackColor={{ true: accent, false: COLOR.line }}
                thumbColor={COLOR.white}
              />
            }
          />
          <Row
            icon="sparkles-outline"
            label="Animations"
            hint="Also the reduced-motion switch"
            trailing={
              <Switch
                testID="quick-animations"
                value={animations}
                onValueChange={setAnimations}
                trackColor={{ true: accent, false: COLOR.line }}
                thumbColor={COLOR.white}
              />
            }
          />
          <Row
            icon="flashlight-outline"
            label="Glow"
            hint={`${Math.round(glow * 100)}%`}
            last
            trailing={
              <Touchable
                testID="quick-glow"
                accessibilityRole="button"
                accessibilityLabel="Cycle glow"
                onPress={() => setGlow(glow >= 0.9 ? 0.2 : Math.min(1, glow + 0.2))}
                style={[styles.stepper, { borderColor: accent }]}
              >
                <Ionicons name="add" size={16} color={accent} />
              </Touchable>
            }
          />
        </View>

        <View style={styles.group}>
          <Jump icon="link-outline" label="Connection" onPress={() => go('connection')} />
          <Jump icon="color-palette-outline" label="Appearance" onPress={() => go('appearance')} />
          <Jump icon="information-circle-outline" label="About" onPress={() => go('about')} last />
        </View>

        <Touchable
          testID="quick-menu-close"
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={styles.close}
        >
          <Text style={styles.closeText}>CLOSE</Text>
        </Touchable>
      </View>
    </Modal>
  );
}

function Row({
  icon,
  label,
  hint,
  trailing,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  trailing: React.ReactNode;
  last?: boolean;
}) {
  const { accent } = useAppearance();
  return (
    <View style={[styles.row, !last && styles.divided]}>
      <Ionicons name={icon} size={19} color={accent} style={styles.rowIcon} />
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}

function Jump({
  icon,
  label,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  last?: boolean;
}) {
  const { accent } = useAppearance();
  return (
    <Touchable
      testID={`quick-${label.toLowerCase()}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      sink={0}
      style={[styles.row, !last && styles.divided]}
    >
      <Ionicons name={icon} size={19} color={accent} style={styles.rowIcon} />
      <Text style={[styles.rowLabel, styles.rowText]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={COLOR.dim} />
    </Touchable>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(1,6,15,0.72)' },
  sheet: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: '82%',
    maxWidth: 330,
    backgroundColor: 'rgba(6,16,36,0.98)',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: COLOR.line,
    paddingHorizontal: SPACE.lg,
    gap: SPACE.lg,
  },
  head: { gap: SPACE.sm, paddingBottom: SPACE.sm },
  title: { ...TYPE.wordmark, fontSize: 20, letterSpacing: 6, color: COLOR.white },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  dot: { width: 7, height: 7, borderRadius: 4 },
  link: { ...TYPE.meta, fontSize: 12, color: COLOR.dim },
  group: {
    backgroundColor: COLOR.panel,
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, minHeight: 54 },
  divided: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLOR.line },
  rowIcon: { marginRight: SPACE.md },
  rowText: { flex: 1 },
  rowLabel: { ...TYPE.dataValue, fontSize: 14, color: COLOR.white },
  rowHint: { ...TYPE.meta, fontSize: 11, color: COLOR.dim, marginTop: 2 },
  stepper: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: { alignItems: 'center', paddingVertical: SPACE.md },
  closeText: { ...TYPE.dataLabel, color: COLOR.dim, letterSpacing: 2 },
});
