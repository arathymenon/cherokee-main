// Quick-shop dialog glue. Pick/variant/add-button state is owned by the
// dialog's <product-fetcher> (see product-fetcher.js); this file only:
//   1. closes the dialog after a successful add, and
//   2. toggles the "from" price vs the selected-variant price from the
//      bubbling product-fetcher:state-change event.
const quickShopDialog = document.getElementById("quick-shop-dialog");
const quickShopComponent = quickShopDialog?.closest("openable-component");

if (quickShopComponent) {
  quickShopDialog.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;

    const link = event.target.closest("a[data-product-color-link]");
    if (!link || !quickShopDialog.contains(link)) return;

    const productFetcher = link.closest("product-fetcher");
    const colorOption = productFetcher?.querySelector("product-option[data-product-color-option]");
    const colorId = colorOption?.selectedValue?.id;
    const rawHref = link.getAttribute("href");
    if (!colorId || !rawHref) return;

    const url = new URL(rawHref, window.location.origin);
    url.searchParams.set("option_values", colorId);
    link.setAttribute("href", `${url.pathname}${url.search}${url.hash}`);
  });

  document.addEventListener("liquid-ajax-cart:request-end", (event) => {
    const { requestState } = event.detail;
    if (
      requestState.requestType === "add" &&
      requestState.responseData?.ok &&
      quickShopDialog.open
    ) {
      quickShopComponent.close();
    }
  });

  /** @param {boolean} hasSelectedVariant */
  const syncPriceState = (hasSelectedVariant) => {
    const price = quickShopDialog.querySelector("[data-quick-shop-price]");
    if (!price) return;
    const freshPrice = price.querySelector("[data-quick-shop-price-fresh]");
    const variantPrice = price.querySelector("[data-quick-shop-price-variant]");
    if (!freshPrice || !variantPrice) return;
    freshPrice.hidden = hasSelectedVariant;
    variantPrice.hidden = !hasSelectedVariant;
  };

  quickShopDialog.addEventListener("product-fetcher:state-change", (event) => {
    syncPriceState(Boolean(event.detail?.isComplete));
  });

  quickShopDialog.addEventListener("close", () => {
    syncPriceState(false);
  });
}
