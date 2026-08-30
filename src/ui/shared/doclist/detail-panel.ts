/** Id DOM partage par une ligne de doclist et son panneau de detail inline. */
export function doclistDetailPanelId(rowId: string): string {
  return `doclist-row-${encodeURIComponent(rowId)}-detail`;
}
