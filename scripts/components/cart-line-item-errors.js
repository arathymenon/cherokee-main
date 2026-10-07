// Overrides liquid-ajax-cart's native line error text with our copy and auto-hides
// it. When a cart change is rejected (HTTP 422 — e.g. trying to exceed available
// stock) the library writes the error message into the matching
// [data-ajax-cart-errors="<line key>"] and re-renders the cart section first, so by
// the time this public request-end handler runs the populated element is the fresh
// one. We swap in the element's localized data-max-qty-text and clear it after a
// few seconds. The library also clears all error elements on the next request.

const HIDE_DELAY_MS = 3000;
let hideTimer;

document.addEventListener("liquid-ajax-cart:request-end", (event) => {
  clearTimeout(hideTimer);

  if (event.detail?.requestState?.responseData?.status !== 422) return;

  // Scope to cart line errors only ([data-max-qty-text]); leave other
  // [data-ajax-cart-errors] containers (product form, sets) to their own copy.
  const selector = "[data-ajax-cart-errors][data-max-qty-text]";

  document.querySelectorAll(selector).forEach((el) => {
    if (el.textContent.trim()) el.textContent = el.getAttribute("data-max-qty-text");
  });

  hideTimer = setTimeout(() => {
    document.querySelectorAll(selector).forEach((el) => (el.textContent = ""));
  }, HIDE_DELAY_MS);
});
