/**
 * <product-set-item> Web Component
 *
 * Thin per-card proxy on a set PDP. Two jobs only:
 *
 *  1. Collapse wiring: forwards the two visible collapse buttons (mobile +
 *     desktop) to a single source-of-truth <details>/<summary>, mirroring
 *     state back to every button's aria-expanded.
 *  2. State proxy: exposes this card's pick/variant state by delegating to
 *     its inner <product-fetcher>, which is the single source of truth (it
 *     tracks picks, reapplies them across swaps, and emits the bubbling
 *     product-fetcher:state-change that <product-set-group> listens for).
 *
 * All the former pick-tracking/reapply/state-JSON logic now lives in
 * scripts/components/product-fetcher.js and is shared by every buy path.
 *
 * Required descendants:
 *   - <product-fetcher>                    one per card
 *
 * Public API (delegates to inner <product-fetcher>):
 *   - .isComplete             boolean
 *   - .picksComplete          boolean
 *   - .variantId              string|null
 *   - .variantPrice           number|null  (cents)
 *   - .variantCompareAtPrice  number|null  (cents)
 *   - .variantOnSale          boolean
 *   - .variantAvailable       boolean
 *   - .variantFinalSale       boolean
 */
class ProductSetItem extends HTMLElement {
  connectedCallback() {
    this.#wireUpCollapse();
  }

  /** @returns {any} the card's inner <product-fetcher>, or null */
  get #fetcher() {
    return this.querySelector(":scope > product-fetcher");
  }

  get isComplete() {
    return Boolean(this.#fetcher?.isComplete);
  }

  get picksComplete() {
    return Boolean(this.#fetcher?.picksComplete);
  }

  get variantId() {
    return this.#fetcher?.variantId ?? null;
  }

  get variantPrice() {
    const price = this.#fetcher?.variantPrice;
    return typeof price === "number" ? price : null;
  }

  get variantCompareAtPrice() {
    const price = this.#fetcher?.variantCompareAtPrice;
    return typeof price === "number" ? price : null;
  }

  get variantOnSale() {
    return Boolean(this.#fetcher?.variantOnSale);
  }

  get variantAvailable() {
    return Boolean(this.#fetcher?.variantAvailable);
  }

  get variantFinalSale() {
    return Boolean(this.#fetcher?.variantFinalSale);
  }

  /**
   * Wire the two visible collapse buttons (mobile + desktop) to a single
   * source-of-truth <details> element. Both buttons forward clicks to the
   * hidden <summary> so <accordion-block> owns the animation. Native
   * `toggle` event mirrors state back to every button's aria-expanded.
   */
  #wireUpCollapse() {
    const $panel = this.querySelector("[data-product-set-item-panel]");
    if (!$panel) return;
    const $summary = $panel.querySelector(":scope > summary");
    const $buttons = this.querySelectorAll("[data-product-set-item-toggle]");
    if (!$summary || $buttons.length === 0) return;

    for (const $btn of $buttons) {
      $btn.addEventListener("click", () => $summary.click());
    }

    const sync = () => {
      const value = $panel.open ? "true" : "false";
      for (const $btn of $buttons) $btn.setAttribute("aria-expanded", value);
    };
    sync();
    $panel.addEventListener("toggle", sync);
  }
}

if (!customElements.get("product-set-item")) {
  customElements.define("product-set-item", ProductSetItem);
}
