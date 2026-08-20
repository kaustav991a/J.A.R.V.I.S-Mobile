import { ReactNode, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { COLOR, SPACE, TYPE } from '../../theme/tokens';
import { Touchable } from './Touchable';

export type ScreenTitleProps = {
  title: string;
  /** the small line under it, e.g. "5 SAVED" */
  caption?: string;
  /**
   * Leave the caption's own case alone.
   *
   * The default shouts, which is right for the labels this was built for —
   * "100 TURNS", "4 SCRIPTS" — and wrong for a sentence. Chat's opening line went
   * out uppercased on 2026-08-20 and read as a system alarm rather than as
   * someone speaking, which is the opposite of what it is for.
   */
  captionCase?: 'upper' | 'as-written';
  /**
   * Shows the back chevron. Defaults to whether THIS stack has somewhere to go.
   *
   * Not `navigation.canGoBack()`, which was the original and was wrong on every
   * tab root. That method answers for this navigator **or any parent**, and the
   * parent here is the tab navigator — which can always "go back" to whichever
   * tab was looked at before. So Chat, Scripts, Reports and Settings all drew a
   * chevron, and pressing it left the tab entirely: reported on 2026-08-20 as
   * "clicking back from chat goes to the script page", which is exactly what it
   * did, because Scripts is the first tab.
   *
   * A tab root is a root. The stack's own index is the only thing that says so.
   */
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
export function ScreenTitle({
  title,
  caption,
  captionCase = 'upper',
  back,
  trailing,
  testID,
}: ScreenTitleProps) {
  const nav = useNavigation();

  /**
   * Whether the closest navigator has anything to pop, read from its own state.
   *
   * `useNavigationState` was the obvious tool and is the wrong one here: it
   * throws outright when there is a `NavigationContainer` but no navigator inside
   * it, which is how several screens are mounted under test — a component that
   * cannot be rendered without a full navigator is a component that is hard to
   * test, and this one only wants a number.
   *
   * So the index comes off the navigation object, and the listener keeps it
   * honest: a push does not necessarily re-render the screen underneath, so
   * without subscribing the chevron could be a frame stale in either direction.
   */
  const [deeperThanRoot, setDeeperThanRoot] = useState(() => (nav.getState?.()?.index ?? 0) > 0);
  useEffect(() => {
    const read = () => setDeeperThanRoot((nav.getState?.()?.index ?? 0) > 0);
    read();
    // `addListener` is absent on the stubs some suites pass in; there is nothing
    // to subscribe to in that case and the initial read is the whole answer
    return nav.addListener?.('state', read);
  }, [nav]);

  const showBack = back ?? deeperThanRoot;

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
      {caption ? (
        <Text style={[styles.caption, captionCase === 'as-written' && styles.captionSentence]}>
          {captionCase === 'as-written' ? caption : caption.toUpperCase()}
        </Text>
      ) : null}
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
  // A label can afford wide tracking; a sentence cannot. At 1.5 the line wrapped
  // to two on a 6-inch phone and read as spaced-out signage rather than prose.
  captionSentence: { letterSpacing: 0.2, fontSize: 11, lineHeight: 16 },
});
