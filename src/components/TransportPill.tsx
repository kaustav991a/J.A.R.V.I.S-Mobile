import { StyleSheet, Text, View } from 'react-native';
import { COLOR, FONT, SPACE } from '../theme/tokens';
import type { LinkMode, LinkStatus } from '../link/config';

const LABEL: Record<LinkMode, string> = { lan: 'LAN', cloud: 'CLOUD', offline: 'DARK' };

/** cloud is gold, not cyan: a cloud session holds no PC-control powers and the
 *  user must never read it as a full desk link. */
const TINT: Record<LinkMode, string> = { lan: COLOR.cyan, cloud: COLOR.gold, offline: COLOR.dim };

export function TransportPill({ mode, status }: { mode: LinkMode; status: LinkStatus }) {
  const color = TINT[mode];
  const dot = status === 'open' ? '●' : '○';
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text testID="transport-pill-label" style={[styles.label, { color }]}>
        {`${LABEL[mode]} ${dot}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 2,
    backgroundColor: COLOR.cyanDim,
  },
  label: { fontFamily: FONT.data, fontSize: 10, letterSpacing: 1.5 },
});
