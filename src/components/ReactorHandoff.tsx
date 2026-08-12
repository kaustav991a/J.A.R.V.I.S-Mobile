import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';

/** a reactor's centre and diameter, in window coordinates */
export type ReactorFrame = { x: number; y: number; size: number };

export type Handoff = {
  /** where Home's small reactor is sitting, once it has laid out */
  target: ReactorFrame | null;
  register: (id: 'target' | 'origin', frame: ReactorFrame | null) => void;
  origin: ReactorFrame | null;
};

const HandoffContext = createContext<Handoff | null>(null);

/**
 * Lets the launch screen hand its reactor to Home's rather than cutting to it.
 *
 * The two reactors are in different trees — one is an overlay, the other is a
 * screen inside the navigator — so there is no shared-element API to lean on.
 * Instead each measures itself in *window* coordinates and posts the result
 * here, which is a frame of reference they both share.
 *
 * Home is already mounted and laid out behind the overlay, so its measurement is
 * available by the time the launch screen needs it.
 */
export function ReactorHandoffProvider({ children }: PropsWithChildren) {
  const [target, setTarget] = useState<ReactorFrame | null>(null);
  const [origin, setOrigin] = useState<ReactorFrame | null>(null);

  const register = useCallback((id: 'target' | 'origin', frame: ReactorFrame | null) => {
    const set = id === 'target' ? setTarget : setOrigin;
    // identical frames are re-posted on every layout pass; re-rendering the tree
    // on each one would restart the very animation this exists to drive
    set((prev) => {
      if (prev === frame) return prev;
      if (prev && frame && prev.x === frame.x && prev.y === frame.y && prev.size === frame.size) return prev;
      return frame;
    });
  }, []);

  const value = useMemo<Handoff>(() => ({ target, origin, register }), [target, origin, register]);
  return <HandoffContext.Provider value={value}>{children}</HandoffContext.Provider>;
}

/** null-safe: a reactor outside the provider simply never hands off */
export function useReactorHandoff(): Handoff | null {
  return useContext(HandoffContext);
}

/**
 * Wraps a reactor and reports where it ended up.
 *
 * `collapsable={false}` is load-bearing on Android: a plain View with no styling
 * of its own can be flattened out of the native hierarchy, and a flattened View
 * measures as nothing.
 */
export function HandoffAnchor({ id, children }: PropsWithChildren<{ id: 'target' | 'origin' }>) {
  const ref = useRef<View>(null);
  const handoff = useReactorHandoff();

  const measure = useCallback(() => {
    if (!handoff) return;
    ref.current?.measureInWindow((x, y, w, h) => {
      // a zero measurement means the view is not on screen yet; posting it would
      // aim the handoff at the top-left corner
      if (!w || !h) return;
      handoff.register(id, { x: x + w / 2, y: y + h / 2, size: w });
    });
  }, [handoff, id]);

  return (
    <View ref={ref} onLayout={measure} collapsable={false}>
      {children}
    </View>
  );
}
