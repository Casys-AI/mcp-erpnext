import { useEffect, useRef } from "preact/hooks";
import {
  type ClickIntentArbiter,
  createClickIntentArbiter,
} from "./click-intent.ts";

/** Une instance stable par composant, dont les clics en attente sont nettoyés. */
export function useClickIntent(): ClickIntentArbiter {
  const arbiterRef = useRef<ClickIntentArbiter | null>(null);
  if (arbiterRef.current === null) {
    arbiterRef.current = createClickIntentArbiter();
  }
  const arbiter = arbiterRef.current;

  useEffect(() => () => arbiter.cancelAll(), [arbiter]);
  return arbiter;
}
