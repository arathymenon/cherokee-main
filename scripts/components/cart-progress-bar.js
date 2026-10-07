const $cartDialog = document.getElementById("cart-dialog");
const $progressBar = document.getElementById("cart-progress");

// Hide the progress bar on initial load if the cart is empty
if ($progressBar && parseFloat($progressBar.getAttribute("current")) === 0) {
  $progressBar.hidden = true;
}

document.addEventListener("liquid-ajax-cart:request-end", (event) => {
  const { requestState } = event.detail;

  // Open the cart dialog when an item is added to the cart
  if (requestState.requestType === "add" && requestState.responseData?.ok) {
    $cartDialog.showModal();
  }

  const cart = window.liquidAjaxCart?.cart;
  if (cart && $progressBar) {
    $progressBar.hidden = cart.item_count === 0;
    $progressBar.setCurrentAmount(cart.total_price / 100);
  }
});
