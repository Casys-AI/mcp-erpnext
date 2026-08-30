/** @jsxImportSource preact */
/**
 * Squelette de chargement.
 *
 * Reproduit la charpente réelle — filet dégradé, en-tête, lignes — plutôt
 * qu'un message : la vue ne bouge pas quand les données arrivent.
 */

import { Skeleton, ViewerShell } from "~/shared/ui";
import { useHostContext } from "~/shared/host-context-hook";
import { viewerBoundsStyle } from "~/shared/viewer-bounds.ts";

export function LoadingSkeleton({ embedded = false }: { embedded?: boolean }) {
  const host = useHostContext();
  const content = (
    <>
      <div class="flex items-center gap-3 border-b border-line px-4 py-[13px]">
        <Skeleton class="h-[17px] w-40" />
        <Skeleton class="h-[17px] w-8" />
      </div>
      <div class="flex gap-1.5 border-b border-line px-4 py-2.5">
        {[48, 72, 64, 68].map((width) => (
          <Skeleton key={width} class="h-[19px]" style={{ width }} />
        ))}
      </div>
      <div class="flex flex-col">
        {Array.from(
          { length: 8 },
          (_, index) => (
            <div key={index} class="border-b border-line-soft px-4 py-2">
              <Skeleton class="h-[15px]" style={{ opacity: 1 - index * 0.1 }} />
            </div>
          ),
        )}
      </div>
    </>
  );
  if (embedded) {
    return <div class="min-h-0 flex-1 bg-surface">{content}</div>;
  }
  return (
    <ViewerShell style={viewerBoundsStyle(host.containerDimensions)}>
      {content}
    </ViewerShell>
  );
}
