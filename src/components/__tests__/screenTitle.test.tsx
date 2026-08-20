import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Touchable } from '../ui/Touchable';
import { ScreenTitle } from '../ui/ScreenTitle';

/**
 * The back chevron, and the bug it caused on every tab root.
 *
 * Reported from the device 2026-08-20: "clicking on back from chat window, going
 * to script page." Which is exactly what it did. `ScreenTitle` defaulted to
 * `navigation.canGoBack()`, and that method answers for this navigator **or any
 * parent** — the parent being the tab navigator, which can always go back to
 * whichever tab was looked at before. So Chat drew a chevron it should never have
 * had, and pressing it left the tab entirely, landing on Scripts because Scripts
 * is the first tab.
 *
 * A tab root is a root. Pinned in real navigators rather than against a mock,
 * because the whole bug was about which navigator was answering.
 */

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function Root() {
  return <ScreenTitle title="CHAT" testID="title" />;
}

function Deeper() {
  return <ScreenTitle title="RESULT" testID="title" />;
}

/** Chat's real shape: a stack inside a tab, sitting on the stack's first screen. */
function ChatStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CommandsHome" component={Root} />
      <Stack.Screen name="CommandResult" component={Deeper} />
    </Stack.Navigator>
  );
}

describe('the back chevron', () => {
  it('is absent on a tab root, however much tab history there is', async () => {
    const { queryByTestId, getByText } = await render(
      <NavigationContainer>
        <Tabs.Navigator screenOptions={{ headerShown: false }}>
          <Tabs.Screen name="Scripts">{() => <Text>scripts</Text>}</Tabs.Screen>
          <Tabs.Screen name="Commands" component={ChatStack} />
        </Tabs.Navigator>
      </NavigationContainer>
    );
    // move to the other tab and back, so the tab navigator definitely has history
    await fireEvent.press(getByText('Scripts'));
    await fireEvent.press(getByText('Commands'));
    await waitFor(() => expect(queryByTestId('title')).toBeTruthy());
    expect(queryByTestId('screen-back')).toBeNull();
  });

  it('appears once the stack itself has been pushed onto', async () => {
    function Pusher({ navigation }: { navigation: { navigate: (n: string) => void } }) {
      return (
        <>
          <ScreenTitle title="CHAT" testID="title" />
          <Touchable testID="go" onPress={() => navigation.navigate('CommandResult')}>
            <Text>go</Text>
          </Touchable>
        </>
      );
    }
    const { queryByTestId, getByTestId } = await render(
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {/* eslint-disable-next-line react/no-unstable-nested-components */}
          <Stack.Screen name="CommandsHome" component={Pusher as never} />
          <Stack.Screen name="CommandResult" component={Deeper} />
        </Stack.Navigator>
      </NavigationContainer>
    );
    expect(queryByTestId('screen-back')).toBeNull();
    await fireEvent.press(getByTestId('go'));
    await waitFor(() => expect(queryByTestId('screen-back')).toBeTruthy());
  });
});

/**
 * The caption's case, and the other thing the device showed that day.
 *
 * The situation line went out as `3:05 PM, SIR. YOU ARE AT BIDHANNAGAR…`, which
 * reads as a system alarm rather than as someone speaking — the opposite of what
 * the line is for. Uppercase is right for the labels this was built for and wrong
 * for prose.
 */
describe('the caption', () => {
  const inNavigator = (node: React.ReactElement) =>
    render(
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Only">{() => node}</Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    );

  it('shouts a label, which is what a label is for', async () => {
    const { getByText } = await inNavigator(<ScreenTitle title="SCRIPTS" caption="4 saved" />);
    await waitFor(() => expect(getByText('4 SAVED')).toBeTruthy());
  });

  it('leaves a sentence exactly as written', async () => {
    const line = '3:05 PM, sir. You are at Home.';
    const { getByText } = await inNavigator(
      <ScreenTitle title="CHAT" caption={line} captionCase="as-written" />
    );
    await waitFor(() => expect(getByText(line)).toBeTruthy());
  });
});
