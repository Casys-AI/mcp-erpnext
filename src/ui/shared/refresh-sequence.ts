/** Generations reject stale responses while forced refreshes coalesce. */
export interface UiRefreshSequence {
  generation: number;
  inFlight: number | null;
  pendingForced: boolean;
}

export interface UiRefreshStart {
  state: UiRefreshSequence;
  generation: number | null;
}

export interface UiRefreshCompletion {
  state: UiRefreshSequence;
  accept: boolean;
  runPending: boolean;
}

export function createUiRefreshSequence(): UiRefreshSequence {
  return { generation: 0, inFlight: null, pendingForced: false };
}

/** A forced request immediately invalidates any response already in flight. */
export function beginUiRefresh(
  state: UiRefreshSequence,
  options: { force?: boolean } = {},
): UiRefreshStart {
  if (state.inFlight !== null) {
    if (!options.force) return { state, generation: null };
    return {
      state: {
        ...state,
        generation: state.generation + 1,
        pendingForced: true,
      },
      generation: null,
    };
  }

  const generation = state.generation + 1;
  return {
    state: { generation, inFlight: generation, pendingForced: false },
    generation,
  };
}

/** A spontaneous host payload supersedes refreshes already in flight. */
export function invalidateUiRefresh(
  state: UiRefreshSequence,
): UiRefreshSequence {
  return { ...state, generation: state.generation + 1 };
}

export function completeUiRefresh(
  state: UiRefreshSequence,
  generation: number,
): UiRefreshCompletion {
  if (state.inFlight !== generation) {
    return { state, accept: false, runPending: false };
  }
  return {
    state: { ...state, inFlight: null },
    accept: state.generation === generation,
    runPending: state.pendingForced,
  };
}
