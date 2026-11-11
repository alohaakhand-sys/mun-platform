/**
 * Open the standalone committee-doc reader in a named popup — same pattern as the
 * chair console's projector popup (window.open with a stable name, so re-clicking
 * focuses the existing window instead of stacking new ones).
 */
export function openDocReader(eventId: string, docId: string): Window | null {
  return window.open(
    `/docs/${eventId}/${docId}`,
    `mun-doc-${docId}`,
    "popup,width=1000,height=920",
  );
}
