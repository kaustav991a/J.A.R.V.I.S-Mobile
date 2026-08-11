import { Component, ErrorInfo, PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { COLOR, RADIUS, SPACE, TYPE } from '../theme/tokens';

type State = { error: Error | null; stack: string };

/**
 * Shows a crash instead of dying of it.
 *
 * A release build has no red box: an unhandled render error takes the whole app
 * down, which from the outside looks like the app "just exits" — no message, no
 * clue which screen did it. This catches the error, keeps the process alive and
 * puts the message and component stack on screen where they can be read off a
 * phone and repeated back.
 *
 * It is a debugging surface, not a product one. It stays until crashes are
 * being reported properly (ROADMAP §5).
 */
export class ErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { error: null, stack: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // also goes to `npx expo start` / logcat, for when the screen is not enough
    console.error('[jarvis] render crash', error, info.componentStack);
    this.setState({ stack: info.componentStack ?? '' });
  }

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.root} testID="crash-screen">
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.title}>SOMETHING BROKE</Text>
          <Text style={styles.lead}>
            The app caught this instead of closing. Read it out and it can be fixed.
          </Text>
          <View style={styles.card}>
            <Text testID="crash-message" style={styles.message}>
              {error.message || String(error)}
            </Text>
          </View>
          {stack ? (
            <View style={styles.card}>
              <Text style={styles.stack}>{stack.trim().split('\n').slice(0, 12).join('\n')}</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.bg },
  body: { padding: SPACE.xl, paddingTop: 80, gap: SPACE.lg },
  title: { ...TYPE.wordmark, fontSize: 18, letterSpacing: 4, color: COLOR.red },
  lead: { ...TYPE.meta, fontSize: 13, color: COLOR.dim },
  card: {
    backgroundColor: 'rgba(4,14,32,0.9)',
    borderRadius: RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.line,
    padding: SPACE.lg,
  },
  message: { ...TYPE.meta, fontSize: 13, lineHeight: 20, color: COLOR.white },
  stack: { ...TYPE.meta, fontSize: 11, lineHeight: 17, color: COLOR.dim },
});
