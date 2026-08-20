import { useEffect, useRef, useState } from 'react';
import { revealSteps, stepFor } from '../../lib/reveal';

/**
 * A string that arrives in pieces, once.
 *
 * **Once** is the whole difficulty. This screen stays mounted for the life of the
 * app and the chat re-renders on every incoming frame, every tab change and every
 * keystroke in the compose bar — so a naive reveal would replay itself constantly,
 * and old turns would type themselves out again every time the list scrolled. The
 * ref remembers which text has already been shown in full and refuses to pace it
 * a second time.
 *
 * One interval, cleared on unmount and on finishing. `TypeLine` sets one timeout
 * per character, which is right for a nine-word splash line and would be four
 * hundred timers for a reply.
 */
export function useReveal(text: string, active: boolean): string {
  /**
   * Texts already delivered whole. Not a boolean: two replies can be in flight
   * across a re-render, and "have I finished" has to be a question about a
   * particular string rather than about the component.
   */
  const done = useRef<Set<string>>(new Set());
  const [shown, setShown] = useState(() => (active ? '' : text));

  useEffect(() => {
    if (!active || !text || done.current.has(text)) {
      setShown(text);
      return;
    }

    const steps = revealSteps(text);
    if (steps.length <= 1) {
      done.current.add(text);
      setShown(text);
      return;
    }

    const wait = stepFor(steps.length);
    let i = 0;
    setShown(steps[0] ?? '');

    const id = setInterval(() => {
      i += 1;
      if (i >= steps.length) {
        clearInterval(id);
        // recorded before the last paint, so a re-render arriving in the same
        // tick cannot restart what has just finished
        done.current.add(text);
        setShown(text);
        return;
      }
      setShown(steps[i] ?? text);
    }, wait);

    return () => {
      clearInterval(id);
      /**
       * Interrupted means finished, not abandoned.
       *
       * Leaving it unmarked would restart the reveal from the beginning the next
       * time this text rendered — and the commonest interruption is a tab change
       * mid-answer, so the reply would type itself out again on return. Snapping
       * to the whole text is also the honest thing: the answer had arrived, only
       * the animation was cut short.
       */
      done.current.add(text);
      setShown(text);
    };
  }, [text, active]);

  return shown;
}
