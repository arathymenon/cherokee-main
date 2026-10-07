/**
 * Opens the #cart-dialog drawer when the URL hash is #cart.
 *
 * Lets /cart (templates/cart.liquid) redirect to the homepage with #cart and
 * have the cart drawer open on arrival. Also handles in-page links to #cart.
 *
 * Follows the same open pattern as cart-progress-bar.js / button-command.js:
 * a direct showModal() on the dialog.
 */

const CART_HASH = "#cart";

function openCartFromHash() {
  if (window.location.hash !== CART_HASH) return;

  const $cartDialog = document.getElementById("cart-dialog");
  if (!$cartDialog) return;

  // Strip the hash before opening so reload / back doesn't reopen the drawer.
  history.replaceState(null, "", window.location.pathname + window.location.search);

  if (!$cartDialog.open) $cartDialog.showModal();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", openCartFromHash);
} else {
  openCartFromHash();
}

window.addEventListener("hashchange", openCartFromHash);
