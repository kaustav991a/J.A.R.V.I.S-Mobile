import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { COLOR, SPACE, TYPE } from '../../theme/tokens';
import { Touchable } from './Touchable';

export type ScreenTitleProps = {
  title: string;
  /** the small line under it, e.g. "5 SAVED" */
  caption?: string;
  /** shows the back chevron; defaults to whatever the stack can do */
  back?: boolean;
  /** an action at the right edge */
  trailing?: ReactNode;
  testID?: string;
};

/**
 * The screen's own title, set in the display face at a size a navigator header
 * cannot reach. Headers are off across the app: a 14px centred header title
 * over a screen whose own content shouts is a hierarchy with two heads.
 */
export function ScreenTitle({ title, caption, back, trailing, testID }: ScreenTitleProps) {
  const nav = useNavigation();
  const showBack = back ?? nav.canGoBack();

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {showBack ? (
          <Touchable
            testID="screen-back"
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={12}
            onPress={() => nav.goBack()}
            style={styles.back}
          >
            <Ionicons name="chevron-back" size={22} color={COLOR.white} />
          </Touchable>
        ) : null}
        <Text testID={testID} style={styles.title} numberOfLines={1}>
          {title.toUpperCase()}
        </Text>
        <View style={styles.trailing}>{trailing}</View>
      </View>
      {caption ? <Text style={styles.caption}>{caption.toUpperCase()}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: SPACE.lg },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 34 },
  back: { marginRight: SPACE.sm, marginLeft: -4 },
  title: { ...TYPE.wordmark, fontSize: 22, letterSpacing: 3, color: COLOR.white, flex: 1 },
  trailing: { marginLeft: SPACE.md },
  caption: { ...TYPE.dataLabel, color: COLOR.dim, letterSpacing: 1.5, marginTop: SPACE.sm },
});
