import { useEffect, useRef, useState } from 'react';

/**
 * `active`, held true for at least `minMs` once it turns on — so a busy state
 * that ends almost immediately is still seen instead of blinking.
 */
export function useMinDuration(active: boolean, minMs: number): boolean {
  const [held, setHeld] = useState(active);
  const since = useRef(0);
  useEffect(() => {
    if (active) {
      since.current = Date.now();
      setHeld(true);
      return;
    }
    const left = minMs - (Date.now() - since.current);
    if (left <= 0) {
      setHeld(false);
      return;
    }
    const id = setTimeout(() => setHeld(false), left);
    return () => clearTimeout(id);
  }, [active, minMs]);
  return active || held;
}
