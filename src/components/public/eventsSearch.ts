/**
 * Header search → /events hand-off. The header pushes `/events?q=` for a fresh visit;
 * when /events is already mounted it also fires this window event, because the page
 * reads `?q=` only on mount.
 */
export const EVENTS_SEARCH_EVENT = "mp:events-search";

export function announceEventsSearch(term: string) {
  window.dispatchEvent(new CustomEvent(EVENTS_SEARCH_EVENT, { detail: term }));
}
