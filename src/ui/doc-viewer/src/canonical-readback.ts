/**
 * A root snapshot may only clear its stale marker when it was accepted after
 * the mutation that invalidated it. Failed and pre-mutation reads do not
 * advance the fresh-event clock.
 */
export function canonicalReadbackSupersedesMutation(
  mutationBaseline: number | null,
  rootFreshEvent: number,
): boolean {
  return mutationBaseline !== null && rootFreshEvent > mutationBaseline;
}
