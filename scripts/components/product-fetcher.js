/**
 * <product-fetcher> Web Component
 *
 * Manages AJAX-powered product variant and grouped-product switching on a
 * Shopify product page. When a user selects a different option (via a child
 * <product-option> element), this component fetches the updated section HTML
 * from Shopify's Section Rendering API and swaps the relevant parts of the
 * page — price, images, add-to-cart state, etc. — without a full reload.
 *
 * Supports two switching modes:
 *   - Variant switching: when the selected option stays within the same product,
 *     only targeted areas (`data-product-fetcher-area="variant"`) are swapped.
 *   - Grouped product switching: when the option points to a different product
 *     URL, the entire fetcher element is replaced — unless the
 *     `preserve-options` attribute is set, in which case grouped switches also
 *     use the targeted area swap so markup outside the areas (e.g. a product
 *     card's swatch row, keeping its order and checked state) survives.
 *
 * Additional features:
 *   - Prefetches HTML on option hover for faster perceived switching.
 *   - Optionally updates the browser URL and page title (when `update-url` is set).
 *   - Uses the View Transitions API for smooth visual swaps.
 *   - Reads product/variant state from a JSON script tag marked with
 *     `data-product-fetcher-state`.
 *
 * Attributes:
 *   - section    — Shopify section ID (auto-detected from parent if omitted).
 *   - sapi-id    — Unique ID for targeting when multiple fetchers exist.
 *   - update-url — When present, updates the browser URL and page title on switch.
 *   - preserve-options — When present, grouped-product switches swap targeted
 *     areas instead of replacing the whole element.
 *
 * Events listened for:
 *   - product-option:change — triggers a fetch and content swap.
 *   - product-option:hover  — triggers a prefetch for faster UX.
 *
 * Client-owned option-pick state:
 *   Shopify always resolves a product URL to a FULL variant — even when
 *   option_values is partial or absent — and populates selected_variant /
 *   value.selected from that auto-resolved variant. SAPI responses therefore
 *   come back with every option position rendered as selected, regardless of
 *   what the shopper actually picked. This component is the single source of
 *   truth for real picks: it seeds from the first server render, records
 *   user picks, and reconciles the DOM after every swap — re-applying picked
 *   positions and clearing the ones the server auto-selected. It gates its
 *   own buy form and emits a state event so thin consumers
 *   (product-set-group, quick-shop) need no pick logic.
 *
 * Events dispatched:
 *   - product-fetcher:rendered — fired after a successful swap so external
 *     scripts (e.g. Yotpo) can re-init against the new DOM.
 *   - product-fetcher:state-change — fired on connect, on pick, and after
 *     each swap. detail: { isComplete, picksComplete, variantId,
 *     variantPrice, variantAvailable, picks: Map<position, valueId> }.
 *     picksComplete is true when every option position has a pick,
 *     independent of variant availability; isComplete additionally
 *     requires the resolved variant to be available.
 *
 * Public API (read): isComplete, variantId, variantPrice, variantAvailable, publicData.
 *
 * @example
 * <product-fetcher section="main-product" update-url>
 *   <script type="application/json" data-product-fetcher-state>
 *     { "product": { "url": "/products/shirt" }, "variant": { "id": "123" } }
 *   </script>
 *   <product-option data-product-fetcher-option-group="main">...</product-option>
 *   <div data-product-fetcher-area="variant"><!-- price, buy button, etc. --></div>
 * </product-fetcher>
 */
import { getShopifySection, querySelectorAllOwn, isOwnElement } from "../utilities/helpers.js";

const attributes = {
  state: "data-product-fetcher-state",
  area: "data-product-fetcher-area",
  sapiId: "sapi-id",
  updateURL: "update-url",
  preserveOptions: "preserve-options",
  disableViewTransition: "disable-view-transition",
  optionGroupName: "data-product-fetcher-option-group",
  section: "section",
  colorOption: "data-product-color-option",
  colorLink: "data-product-color-link",
};

class ProductFetcher extends HTMLElement {
  /**
   * @type {{
   *   "product": {
   *     "url": string,
   *     "handle"?: string,
   *     "title"?: string,
   *     "type"?: string,
   *     "image"?: string,
   *     "collection_label"?: string
   *   },
   *   "page_title": string,
   *   "variant": {
   *    "id": string,
   *   } | null
   * } | null}
   */
  #state = null;

  #htmlFetcher = window.VegaX.createHTMLFetcher({
    useViewTransition: !this.hasAttribute(attributes.disableViewTransition),
  });

  /** @type {Map<string, string>} option position → picked value id */
  #picks = new Map();

  constructor() {
    super();

    this.addEventListener("product-option:change", this.#handleOptionChange.bind(this));

    this.addEventListener("product-option:hover", this.#handleOptionHover.bind(this));
  }

  connectedCallback() {
    this.#initState();
    // Seed from the server render (only position 1 / color is preselected).
    // On a grouped (whole-element) swap this fresh instance re-seeds the new
    // product's color; same-product swaps keep the surviving instance's map.
    this.#seedPicks();
    this.#syncState();
  }

  // ---- Client-owned option-pick state -------------------------------------

  /** @returns {string[]} distinct option positions present in this fetcher */
  get #positions() {
    return [
      ...new Set(
        querySelectorAllOwn(this, "product-option[position]")
          .map(($o) => $o.getAttribute("position"))
          .filter((p) => p)
      ),
    ];
  }

  get variantId() {
    return this.#state?.variant?.id ?? null;
  }

  get variantPrice() {
    const price = this.#state?.variant?.price;
    return typeof price === "number" ? price : null;
  }

  get variantCompareAtPrice() {
    const price = this.#state?.variant?.compare_at_price;
    return typeof price === "number" ? price : null;
  }

  get variantOnSale() {
    return Boolean(this.#state?.variant?.sale);
  }

  get variantAvailable() {
    return Boolean(this.#state?.variant?.available);
  }

  /**
   * Compare-flow snapshot. Populated only when product-fetcher-state was
   * rendered with include_public_data (compare-enabled collection cards);
   * returns null otherwise so consumers can guard cleanly.
   * @returns {{
   *   handle: string, title: string|null, type: string|null,
   *   image: string|null, collectionLabel: string|null, url: string|null
   * } | null}
   */
  get publicData() {
    const p = this.#state?.product;
    if (!p || p.handle == null) return null;
    return {
      handle: p.handle,
      title: p.title ?? null,
      type: p.type ?? null,
      image: p.image || null,
      collectionLabel: p.collection_label ?? null,
      url: p.url ?? null,
    };
  }

  get variantFinalSale() {
    return Boolean(this.#state?.variant?.final_sale);
  }

  /** True when every option position has a pick, regardless of availability. */
  get picksComplete() {
    return this.#positions.every((pos) => this.#picks.has(pos));
  }

  /** Complete = every option position is picked and the variant is available. */
  get isComplete() {
    if (!this.picksComplete) return false;
    return Boolean(this.variantAvailable && this.variantId);
  }

  /** Seed picks from currently-selected controls (server selects color only). */
  #seedPicks() {
    this.#picks.clear();
    querySelectorAllOwn(this, "product-option[position]").forEach(($option) => {
      const pos = $option.getAttribute("position");
      if (!pos) return;
      const $sel = $option.querySelector(
        "input[type='radio']:checked[data-product-option-value-id], option:checked[data-product-option-value-id]"
      );
      const id = $sel?.getAttribute("data-product-option-value-id");
      if (id) this.#picks.set(pos, id);
    });
  }

  /**
   * Reconcile freshly-swapped controls against the tracked picks. SAPI
   * responses come back with a fully auto-selected variant (Shopify
   * defaults to one even when option_values is partial), so re-apply the
   * user's picks AND clear every position the user hasn't picked — without
   * dispatching change (no fetch loop).
   */
  #reconcilePicks() {
    querySelectorAllOwn(this, "product-option[position]").forEach(($option) => {
      const pos = $option.getAttribute("position");
      if (!pos) return;
      const id = this.#picks.get(pos);
      if (id) $option.applySelection?.(String(id));
      else $option.clearSelection?.();
    });
  }

  /**
   * Snapshot the option control that currently holds focus, so it can be
   * restored after the swap. The variant area (which contains the option
   * swatches) is innerHTML-replaced on every option change, destroying the
   * focused radio/select and dropping focus to <body> — which yanks keyboard
   * and screen-reader users back to the top of the page. Keyed by option
   * position + value id so the equivalent control can be found in the freshly
   * rendered DOM.
   * @returns {{ position: string, valueId: string | null } | null}
   */
  #captureOptionFocus() {
    const $active = document.activeElement;
    if (!($active instanceof Element) || $active === document.body) return null;
    const $option = $active.closest("product-option[position]");
    if (!$option || !isOwnElement(this, $option)) return null;
    return {
      position: $option.getAttribute("position") || "",
      valueId: $active.getAttribute("data-product-option-value-id"),
    };
  }

  /**
   * Return focus to the equivalent option control after a swap — but only when
   * the swap orphaned focus to <body>, never when the shopper moved focus
   * elsewhere while the fetch was in flight. preventScroll keeps the page from
   * jumping as focus is reapplied.
   * @param {{ position: string, valueId: string | null }} focusKey
   */
  #restoreOptionFocus(focusKey) {
    const $active = document.activeElement;
    if ($active && $active !== document.body && $active !== document.documentElement) return;

    const $option = querySelectorAllOwn(
      this,
      `product-option[position="${CSS.escape(focusKey.position)}"]`
    )[0];
    if (!$option) return;

    let $control = null;
    if (focusKey.valueId) {
      $control = $option.querySelector(
        `input[type='radio'][data-product-option-value-id="${CSS.escape(focusKey.valueId)}"]`
      );
    }
    $control = $control || $option.querySelector("input[type='radio']:checked, select");
    $control?.focus({ preventScroll: true });
  }

  /**
   * Comma-joined picked value ids in option-position order — the
   * option_values for SAPI URLs. Built from the pick map, never from the
   * DOM: after a swap the DOM reflects Shopify's auto-resolved variant,
   * not the shopper's actual picks.
   * @param {Map<string, string> | null} overrides position → value id (hover preview)
   * @returns {string}
   */
  #pickedOptionValues(overrides = null) {
    const map = overrides ? new Map([...this.#picks, ...overrides]) : this.#picks;
    return [...map.entries()]
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, id]) => id)
      .join(",");
  }

  /** Gate this fetcher's own buy form (no-op for set cards / photo swaps). */
  #gate() {
    // Unavailable / back-in-stock / add-to-cart: the server renders all of
    // them (it can't know whether the picks are complete). A nil variant
    // with full picks means the combination has no variant record — show
    // the unavailable notice. With partial picks a nil variant just means
    // Shopify's auto-defaulted size doesn't exist for the picked color —
    // keep the form visible so "Select Size" shows. BIS only when the
    // shopper has fully picked an unavailable variant.
    const showUnavailable = this.picksComplete && !this.variantId;
    const showBis = this.picksComplete && Boolean(this.variantId) && !this.variantAvailable;
    querySelectorAllOwn(this, "[data-product-fetcher-unavailable]").forEach(($el) => {
      $el.hidden = !showUnavailable;
    });
    querySelectorAllOwn(this, "[data-product-fetcher-bis]").forEach(($el) => {
      $el.hidden = !showBis;
    });
    querySelectorAllOwn(this, "[data-product-fetcher-atc]").forEach(($el) => {
      $el.hidden = showBis || showUnavailable;
    });

    const $buttons = querySelectorAllOwn(this, "button[name='add']");
    const $ids = querySelectorAllOwn(this, "input[name='id']");
    if ($buttons.length === 0 && $ids.length === 0) return;

    const complete = this.isComplete;
    $buttons.forEach(($b) => {
      $b.disabled = !complete;
    });
    $ids.forEach(($i) => {
      $i.disabled = !complete;
    });
    const $wrapper =
      $buttons[0]?.closest("ajax-cart-product-form") || $buttons[0]?.closest("form") || this;
    if (complete) $wrapper.removeAttribute("selection-incomplete");
    else $wrapper.setAttribute("selection-incomplete", "");
  }

  #syncState() {
    this.#gate();
    this.#syncColorLinks();
    this.dispatchEvent(
      new CustomEvent("product-fetcher:state-change", {
        bubbles: true,
        detail: {
          isComplete: this.isComplete,
          picksComplete: this.picksComplete,
          variantId: this.variantId,
          variantPrice: this.variantPrice,
          variantAvailable: this.variantAvailable,
          picks: new Map(this.#picks),
        },
      })
    );
  }

  #syncColorLinks() {
    const $colorOption = querySelectorAllOwn(this, `product-option[${attributes.colorOption}]`)[0];

    if (!$colorOption) return;

    const colorId = $colorOption?.selectedValue?.id;

    querySelectorAllOwn(this, `a[${attributes.colorLink}]`).forEach(($link) => {
      const rawHref = $link.getAttribute("href");
      if (!rawHref) return;

      const url = new URL(rawHref, window.location.origin);
      if (colorId) url.searchParams.set("option_values", colorId);
      else url.searchParams.delete("option_values");

      $link.setAttribute("href", `${url.pathname}${url.search}${url.hash}`);
    });
  }

  #initState() {
    const $state = this.querySelector(`[${attributes.state}]`);
    if (!$state || $state.closest("product-fetcher") !== this) {
      throw new Error("The state attribute is not found.");
    }
    this.#state = JSON.parse($state.textContent || "{}");
  }

  /**
   * @param {Event} event
   */
  #handleOptionChange(event) {
    if (!(event.target instanceof Element)) return;
    if (!isOwnElement(this, event.target)) return;

    const groupName = event.target.getAttribute(attributes.optionGroupName);
    if (!groupName) return;

    // The gallery only needs to swap when the color (position 1) option
    // changes — size/inseam changes don't affect the photos and a swap
    // would needlessly reset gallery/carousel state.
    const position = event.target.getAttribute("position");

    // Record the user's pick first, then build option_values from the pick
    // map. Emit state so consumers react immediately (button stays gated
    // until the swap resolves a full, available variant).
    const pickedId = event.target.selectedValue?.id;
    if (position && pickedId) this.#picks.set(position, String(pickedId));
    this.#syncState();

    this.#renderProduct({
      product: event.target.selectedValue?.productUrl || null,
      optionValues: this.#pickedOptionValues(),
      includeGallery: position === "1",
    });
  }

  /**
   * @param {Event} event
   */
  #handleOptionHover(event) {
    if (!(event.target instanceof Element)) return;
    if (!isOwnElement(this, event.target)) return;
    if (!event.target.hoveredValue) return;
    if (event.target.hoveredValue.id === event.target.selectedValue?.id) return;
    const groupName = event.target.getAttribute(attributes.optionGroupName);
    if (!groupName) return;

    // Preview the picks with the hovered value substituted at its position.
    const hovered = event.target.hoveredValue;
    const position = event.target.getAttribute("position");
    const overrides = position && hovered.id ? new Map([[position, String(hovered.id)]]) : null;

    const [url] = this.#prepareFetchData({
      product: hovered.productUrl || null,
      optionValues: this.#pickedOptionValues(overrides),
    });
    // Prefetch is best-effort and fire-and-forget. Rapid hover (or a
    // subsequent fetch) aborts the in-flight prefetch — that's expected,
    // so swallow AbortError. Surface anything genuinely unexpected, but
    // don't re-throw (it would just become another unhandled rejection).
    this.#htmlFetcher.prefetch(url).catch((error) => {
      if (error?.name !== "AbortError") {
        console.error("[product-fetcher] prefetch failed:", error);
      }
    });
  }

  /**
   * Calculates the URL for fetching HTML and the list of regions on the page to update.
   * // TODO: replace "any" with the TargetMapType
   *          and make sure that importing the type doesn't pull whole js file
   *
   * @param {{
   *   product?: string,
   *   variant?: string,
   *   optionValues?: string,
   *   includeGallery?: boolean
   * }} data
   * @returns {[URL, Array<any>]}
   */
  #prepareFetchData(data = {}) {
    if (!this.#state) throw new Error("The state is not initialized.");

    const sectionId = this.getAttribute(attributes.section) || getShopifySection(this)[0];
    if (!sectionId) throw new Error("The parent section ID is not found.");

    const productURL = data.product || this.#state.product.url;
    const url = new URL(productURL, window.location.origin);
    if (data.variant) url.searchParams.set("variant", data.variant);
    if (data.optionValues) url.searchParams.set("option_values", data.optionValues);

    const sourceSelector =
      "product-fetcher" + (this.getAttribute(attributes.sapiId) ? "#" + this.id : "");

    let targetMap = [];
    if (productURL === this.#state.product.url || this.hasAttribute(attributes.preserveOptions)) {
      // switching between variants (or grouped products with preserve-options:
      // area swap keeps the option controls outside the areas untouched)
      url.searchParams.set("section_id", sectionId);
      const $updateSelectors = querySelectorAllOwn(
        this,
        `[${attributes.state}],[${attributes.area}]`
      );
      const $stateTarget = $updateSelectors.filter(($el) => $el.matches(`[${attributes.state}]`));
      const $variantAreaTarget = $updateSelectors.filter(($el) =>
        $el.matches(`[${attributes.area}="variant"]`)
      );
      // Badges live inside the gallery region but must refresh on every
      // option change (size included), so they get their own region that is
      // swapped unconditionally — independent of the includeGallery gate.
      const $badgesAreaTarget = $updateSelectors.filter(($el) =>
        $el.matches(`[${attributes.area}="badges"]`)
      );
      targetMap = [
        {
          target: $stateTarget,
          source: `${sourceSelector} [${attributes.state}]`,
        },
        {
          target: $variantAreaTarget,
          source: `${sourceSelector} [${attributes.area}="variant"]`,
        },
        {
          target: $badgesAreaTarget,
          source: `${sourceSelector} [${attributes.area}="badges"]`,
        },
      ];
      if (data.includeGallery !== false) {
        const $galleryAreaTarget = $updateSelectors.filter(($el) =>
          $el.matches(`[${attributes.area}="gallery"]`)
        );
        targetMap.push({
          target: $galleryAreaTarget,
          source: `${sourceSelector} [${attributes.area}="gallery"]`,
        });
      }
    } else if (this.hasAttribute(attributes.updateURL)) {
      // switching between grouped products with whole page
      url.searchParams.set("section_id", sectionId);
      targetMap = [
        {
          target: this,
          source: sourceSelector,
        },
      ];
    } else {
      // switching between grouped products within the same section only
      url.searchParams.set("section_id", sectionId);
      targetMap = [
        {
          target: this,
          source: sourceSelector,
        },
      ];
    }

    return [url, targetMap];
  }

  /**
   * @param {{
   *   product?: string,
   *   variant?: string,
   *   optionValues?: string,
   *   includeGallery?: boolean
   * }} data
   */
  async #renderProduct(data = {}) {
    // TODO: block "Add to cart" button while fetching

    const [url, targetMap] = this.#prepareFetchData(data);
    // Snapshot focus before the variant area (option swatches included) is
    // torn down, so keyboard/AT users aren't thrown to the top on each pick.
    const focusKey = this.#captureOptionFocus();

    try {
      await this.#htmlFetcher.fetch(url, targetMap);
      if (this.isConnected) {
        this.#initState();
        // The swap rendered Shopify's auto-resolved variant as selected —
        // restore the user's picks, clear unpicked positions, then re-gate
        // the buy form against the freshly resolved variant. (A grouped
        // whole-element swap replaces this instance instead; the new
        // instance re-seeds via connectedCallback.)
        this.#reconcilePicks();
        this.#syncState();
        if (focusKey) this.#restoreOptionFocus(focusKey);
        if (this.hasAttribute(attributes.updateURL)) {
          this.updateMeta();
        }
      } else {
        document.querySelector(`product-fetcher[${attributes.updateURL}]`)?.updateMeta();
      }
      (this.isConnected ? this : document).dispatchEvent(
        new CustomEvent("product-fetcher:rendered", { bubbles: true })
      );
    } catch (error) {
      if (error.name !== "AbortError") {
        throw error;
      }
    }
  }

  updateMeta() {
    this.#updatePageTitle();
    this.#updateURL();
  }

  #updatePageTitle() {
    if (!this.#state) throw new Error("The state is not initialized.");
    // page_title is null while the head_title partial is disabled in
    // product-fetcher-state.liquid — don't wipe the document title.
    if (!this.#state.page_title) return;
    const $title = document.querySelector("head title");
    if (!$title) return;

    $title.innerHTML = this.#state.page_title;
  }

  #updateURL() {
    if (!this.#state) throw new Error("The state is not initialized.");

    // Only deep-link a variant the shopper fully picked. state.variant is
    // Shopify's auto-resolved variant and exists even for partial picks —
    // writing it would make a reload preselect options the user never chose.
    const variantParam =
      this.picksComplete && this.#state.variant ? `?variant=${this.#state.variant.id}` : "";
    window.history.replaceState({}, "", `${this.#state.product.url}${variantParam}`);
  }
}

customElements.define("product-fetcher", ProductFetcher);
