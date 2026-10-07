/**
 * Comparison column prefetch cache (Phase 2).
 *
 * Shared between <compare-bar> (warms the cache when a product is added) and
 * <comparison-modal> (paints instantly from the cache, then revalidates with a
 * fresh fetch on open). One column = the `comparison-table-column` section
 * rendered for a single product via the Section Rendering API.
 *
 * Stale-while-revalidate: `get()` returns whatever was prefetched (may be stale);
 * `fetchFresh()` always hits the network and refreshes the cache.
 */

import { shopifyRoot } from "./helpers.js";

const SECTION_ID = "comparison-table-column";
const cache = new Map(); // handle -> HTML string
const inflight = new Map(); // handle -> Promise (prefetch in progress)

function columnUrl(handle) {
  const url = new URL(`${shopifyRoot()}products/${handle}`, window.location.origin);
  url.searchParams.set("section_id", SECTION_ID);
  return url;
}

async function request(handle) {
  const res = await fetch(columnUrl(handle));
  if (!res.ok) throw new Error(`comparison column ${handle}: ${res.status}`);
  return res.text();
}

/** Cached column HTML for a handle, or null if not prefetched yet. */
export function get(handle) {
  return cache.get(handle) || null;
}

/** Best-effort background warm of the cache. Never rejects. */
export function prefetch(handle) {
  if (!handle || cache.has(handle) || inflight.has(handle)) return;
  const promise = request(handle)
    .then((html) => {
      cache.set(handle, html);
    })
    .catch(() => {
      /* best-effort: a failed prefetch is retried by fetchFresh on open */
    })
    .finally(() => {
      inflight.delete(handle);
    });
  inflight.set(handle, promise);
}

/** Always fetch fresh, update the cache, and return the HTML. Throws on failure. */
export async function fetchFresh(handle) {
  const html = await request(handle);
  cache.set(handle, html);
  return html;
}

/** Forget a handle (e.g. after it is removed from the comparison). */
export function drop(handle) {
  cache.delete(handle);
  inflight.delete(handle);
}
