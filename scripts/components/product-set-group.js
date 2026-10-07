/**
 * <product-set-group> Web Component
 *
 * Thin aggregator for a set PDP. Wraps multiple <product-set-item>
 * children (one per component product) and:
 *
 * 1. Reflects set pricing near the wrapper title: a combined price range until
 *    both components are fully picked, then the selected total with a compare-at
 *    strike-through, plus a Sale badge when a selected variant is on sale.
 * 2. Enables the set Add-to-Cart button when every <product-set-item>
 *    reports .isComplete = true.
 * 3. On ATC click, reads each item's .variantId and submits a multi-item
 *    payload via window.liquidAjaxCart.add so the existing cart-progress-bar.js
 *    listener auto-opens the cart.
 *
 * Per-card state (picks, reapply-on-swap, state JSON reads, completion) lives
 * in each card's <product-fetcher>, which bubbles product-fetcher:state-change.
 * <product-set-item> is a thin proxy exposing those reads per card.
 *
 * Required descendants:
 *   - <product-set-item>                 one per component
 *   - [data-product-set-atc]             Add-to-Cart button (always present)
 *   - [data-product-set-price-fresh]     optional combined range, shown until
 *                                        both components are fully picked
 *   - [data-product-set-price-complete]  optional selected total (+ compare-at
 *                                        strike-through), shown once fully picked
 *   - [data-product-set-sale-badge]      optional Sale badge, shown when a
 *                                        selected component variant is on sale
 *
 * ATC payload uses the generalized cart group scheme:
 *   - _group_id        UUID linking members of this group
 *   - _group_role      'parent' on the first item, 'child' on the rest
 *   - _cart_template   'set' (parent only — names the cart-line-item-* snippet)
 *   - _sort_order      '1', '2', … (controls render order inside the group)
 *   - _set_title       wrapper product title (parent only — used by the cart to
 *                      label the grouped line items as a single named set)
 *   - _set_handle      wrapper product handle (parent only — used by the cart
 *                      to link back to the original set PDP at /products/:handle)
 *   - _ProductID_set   wrapper product ID on every member so Admin / OMS can
 *                      identify the originating set product on the order
 *                      (underscore-prefixed = hidden from checkout / cart UI)
 */
import { createGroupId, formatMoney } from "../utilities/helpers.js";

const attributes = {
  atc: "data-product-set-atc",
  priceFresh: "data-product-set-price-fresh",
  priceComplete: "data-product-set-price-complete",
  saleBadge: "data-product-set-sale-badge",
};

class ProductSetGroup extends HTMLElement {
  /** @type {HTMLButtonElement | null} */
  #$atc = null;
  /** @type {HTMLElement | null} */
  #$priceFresh = null;
  /** @type {HTMLElement | null} */
  #$priceComplete = null;
  /** @type {HTMLElement | null} */
  #$saleBadge = null;

  connectedCallback() {
    this.#$atc = this.querySelector(`[${attributes.atc}]`);
    this.#$priceFresh = this.querySelector(`[${attributes.priceFresh}]`);
    this.#$priceComplete = this.querySelector(`[${attributes.priceComplete}]`);
    this.#$saleBadge = this.querySelector(`[${attributes.saleBadge}]`);

    // Each card's <product-fetcher> owns pick state and emits this (bubbles).
    this.addEventListener("product-fetcher:state-change", this.#recompute.bind(this));
    this.#$atc?.addEventListener("click", this.#handleAtcClick.bind(this));

    this.#recompute();
  }

  /** @returns {HTMLElement[]} */
  #items() {
    return Array.from(this.querySelectorAll("product-set-item"));
  }

  #recompute() {
    const items = this.#items();
    if (items.length === 0) return;

    const allPicked = items.every(($i) => $i.picksComplete);
    const allComplete = items.every(($i) => $i.isComplete);
    // A nil variantId with full picks means the picked combo has no variant
    // record — keep the range rather than total a phantom price.
    const hasVariantIds = items.every(($i) => typeof $i.variantId === "string" && $i.variantId);
    const showComplete = allPicked && hasVariantIds;

    // ATC: enabled only when every component is a fully-picked, available variant.
    if (this.#$atc) this.#$atc.disabled = !allComplete;

    // Price: show the combined range until both components are fully picked,
    // then the selected total (+ compare-at strike-through). Keys off
    // picksComplete, mirroring the standard PDP's fresh→variant toggle.
    if (this.#$priceFresh) this.#$priceFresh.hidden = showComplete;
    if (this.#$priceComplete) {
      this.#$priceComplete.hidden = !showComplete;
      if (showComplete) {
        const totalCents = items.reduce((sum, $i) => sum + ($i.variantPrice || 0), 0);
        // Combined compare-at: fall back to each item's price when it has no
        // compare-at (not on sale), so the total only exceeds the sale total
        // when at least one selected component is actually discounted.
        const compareCents = items.reduce(
          (sum, $i) => sum + ($i.variantCompareAtPrice ?? $i.variantPrice ?? 0),
          0
        );
        this.#$priceComplete.innerHTML =
          compareCents > totalCents
            ? `<s class="text-grey-dark">${formatMoney(
                compareCents
              )}</s> <span class="font-medium fs-body-lg">${formatMoney(totalCents)}</span>`
            : `<span class="font-medium fs-body-lg">${formatMoney(totalCents)}</span>`;
      }
    }

    // Sale badge — only once fully picked AND a selected component variant is
    // flagged on sale (variant.metafields.meta.sale), mirroring the standard PDP.
    if (this.#$saleBadge) {
      this.#$saleBadge.hidden = !(showComplete && items.some(($i) => $i.variantOnSale));
    }
  }

  /** @param {MouseEvent} event */
  #handleAtcClick(event) {
    event.preventDefault();
    if (!this.#$atc || this.#$atc.disabled) return;
    if (!window.liquidAjaxCart) {
      console.error("[product-set-group] liquid-ajax-cart not loaded.");
      return;
    }

    const items = this.#items();
    const variantIds = items.map(($i) => $i.variantId);
    if (variantIds.some((id) => !id)) {
      console.error("[product-set-group] Tried to add to cart with incomplete state.", variantIds);
      return;
    }

    const groupId = createGroupId();
    const setId = this.getAttribute("set-id") || "";
    const setTitle = this.getAttribute("set-title") || "";
    const setHandle = this.getAttribute("set-handle") || "";
    const setProperty = setId ? { _ProductID_set: setId } : {};

    const payloadItems = items.map(($item, i) => ({
      id: $item.variantId,
      quantity: 1,
      properties: {
        _group_id: groupId,
        _group_role: i === 0 ? "parent" : "child",
        _sort_order: String(i + 1),
        ...setProperty,
        ...(i === 0 ? { _cart_template: "set", _set_title: setTitle, _set_handle: setHandle } : {}),
        ...($item.variantFinalSale ? { _final_sale: "true" } : {}),
      },
    }));

    this.#$atc.setAttribute("processing", "");
    window.liquidAjaxCart.add(
      { items: payloadItems },
      { lastCallback: () => this.#$atc?.removeAttribute("processing") }
    );
  }
}

if (!customElements.get("product-set-group")) {
  customElements.define("product-set-group", ProductSetGroup);
}
