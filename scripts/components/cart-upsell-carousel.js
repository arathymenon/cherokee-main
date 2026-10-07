/**
 * Cart "You might also like" refetch hook.
 *
 * The <html-fetcher id="cart-upsell-carousel-fetcher"> host in cart-dialog.liquid is a
 * liquid-ajax-cart static element, so it is preserved (not re-rendered) across
 * cart mutations. This listener refetches its recommendations via the Section
 * Rendering API only when a *new* product becomes the most recently added item
 * — quantity bumps / removals leave the carousel untouched (no flicker).
 *
 * Mirrors the liquid-ajax-cart:request-end pattern used in cart-progress-bar.js.
 */
document.addEventListener("liquid-ajax-cart:request-end", (event) => {
  const { requestState } = event.detail;
  if (requestState.requestType !== "add" || !requestState.responseData?.ok) {
    return;
  }

  const $fetcher = document.getElementById("cart-upsell-carousel-fetcher");
  if (!$fetcher) return;

  // cart.items is ordered newest-first, so [0] is the most recently added.
  const lastProductId = window.liquidAjaxCart?.cart?.items?.[0]?.product_id;
  if (!lastProductId) return;

  if (String(lastProductId) === $fetcher.dataset.loadedPid) return;

  const url = new URL($fetcher.getAttribute("href"), window.location.origin);
  url.searchParams.set("product_id", lastProductId);
  const href = url.pathname + url.search;

  $fetcher.dataset.loadedPid = String(lastProductId);
  $fetcher.setAttribute("href", href);
  $fetcher.renderURL(href);
});

/**
 * Upsell-card price toggle: show the price range until every option is
 * picked, then the resolved variant's price. Both branches are
 * server-rendered inside the card's variant swap area (cart-upsell-card
 * snippet); pick completeness only exists client-side because Shopify
 * auto-resolves a full variant even for partial option_values. Mirrors the
 * data-pdp-price toggle in main-product.liquid.
 */
document.addEventListener("product-fetcher:state-change", (event) => {
  const $fetcher = event.target;
  if (!($fetcher instanceof HTMLElement)) return;
  const $wrap = $fetcher.querySelector("[data-upsell-price]");
  if (!$wrap) return;
  const $fresh = $wrap.querySelector("[data-upsell-price-fresh]");
  const $variant = $wrap.querySelector("[data-upsell-price-variant]");
  if (!$fresh || !$variant) return;
  const showVariant = Boolean(event.detail?.picksComplete);
  $fresh.hidden = showVariant;
  $variant.hidden = !showVariant;
});
