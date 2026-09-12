import { useEffect, useRef } from "preact/hooks";
import {
  type ClickIntentArbiter,
  createClickIntentArbiter,
} from "./click-intent.ts";

/** Cleanup cancels future detail callbacks; already claimed undo keeps running. */
export function useClickIntent(): ClickIntentArbiter {
  const arbiterRef = useRef<ClickIntentArbiter | null>(null);
  if (arbiterRef.current === null) {
    arbiterRef.current = createClickIntentArbiter();
  }
  const arbiter = arbiterRef.current;

  useEffect(() => () => arbiter.cancelAll(), [arbiter]);
  return arbiter;
}
