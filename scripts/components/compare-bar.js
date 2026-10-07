/**
 * <compare-bar> — product comparison gathering controller (collection PLP).
 *
 * Standalone: rendered once on compare-enabled collections. Owns:
 *  - a per-collection sessionStorage CompareStore,
 *  - compare mode (a `compare-active` class on <body> → CSS reveals checkboxes),
 *  - the drawer (slots cloned from Liquid <template>s),
 *  - selection rules (max 4, same product.type),
 *  - restore + staleness pruning on load,
 *  - re-sync after AJAX pagination / facet filtering.
 *
 * Reads per-card data from each card's <product-fetcher>.publicData.
 */
import { CompareStore } from "../utilities/compare-store.js";
import { debounce, shopifyRoot } from "../utilities/helpers.js";
import { prefetch } from "../utilities/comparison-prefetch.js";

const MODE_CLASS = "compare-active";
const GRID_SELECTOR = '[data-facets-form-content="products-list"]';

class CompareBar extends HTMLElement {
  #store = null;
  #max = 4;
  #unsubscribe = null;
  #observer = null;
  #drawerResize = null;

  connectedCallback() {
    this.#max = parseInt(this.dataset.compareMax, 10) || 4;
    this.#store = new CompareStore(this.dataset.collectionHandle, this.#max);

    this.$toggle = this.querySelector("[data-compare-toggle]");
    this.$drawer = this.querySelector("[data-compare-drawer]");
    this.$slots = this.querySelector("[data-compare-slots]");
    this.$compareNow = this.querySelector("[data-compare-now]");
    this.$chevron = this.querySelector("[data-compare-chevron]");
    this.$itemTemplate = this.querySelector("[data-compare-item-template]");
    this.$emptyTemplate = this.querySelector("[data-compare-empty-template]");

    this.$toggle.addEventListener("click", this.#onToggle);
    this.addEventListener("click", this.#onBarClick);
    document.addEventListener("change", this.#onChange);
    document.addEventListener("compare:changed", this.#onExternalChange);

    this.#unsubscribe = this.#store.subscribe(() => {
      this.#render();
      this.#syncRules();
    });

    this.#render();
    this.#syncCheckboxes();
    this.#syncRules();
    this.#validateStored();
    this.#observeGrid();
    this.#observeDrawerHeight();
  }

  disconnectedCallback() {
    this.$toggle?.removeEventListener("click", this.#onToggle);
    this.removeEventListener("click", this.#onBarClick);
    document.removeEventListener("change", this.#onChange);
    document.removeEventListener("compare:changed", this.#onExternalChange);
    this.#unsubscribe?.();
    this.#observer?.disconnect();
    this.#drawerResize?.disconnect();
    document.body.classList.remove(MODE_CLASS);
  }

  // ---- Compare mode + drawer ------------------------------------------------

  #onToggle = () => {
    const open = this.toggleAttribute("data-open");
    document.body.classList.toggle(MODE_CLASS, open);
    this.$toggle.setAttribute("aria-expanded", open ? "true" : "false");
    this.$chevron?.classList.toggle("rotate-180", open);
    if (this.$drawer) this.$drawer.inert = !open; // keep the hidden sheet out of tab order
  };

  /**
   * The closed slider is translated down by the drawer's height (--compare-h)
   * so only the pill peeks above the bottom edge. Keep that var in sync with the
   * real height (it changes across breakpoints), and start with the sheet inert.
   */
  #observeDrawerHeight() {
    if (!this.$drawer) return;
    this.$drawer.inert = !this.hasAttribute("data-open");
    const update = () => {
      this.style.setProperty("--compare-h", `${this.$drawer.offsetHeight}px`);
    };
    update();
    this.#drawerResize = new ResizeObserver(update);
    this.#drawerResize.observe(this.$drawer);
  }

  // ---- Selection ------------------------------------------------------------

  #onChange = (event) => {
    const $input = event.target;
    if (!($input instanceof HTMLInputElement)) return;
    if (!$input.matches("[data-compare-checkbox]")) return;

    const data = $input.closest("product-fetcher")?.publicData;
    if (!data) {
      $input.checked = false;
      return;
    }

    if ($input.checked) {
      const added = this.#store.add(data);
      if (added) prefetch(data.handle); // warm the modal's column cache
      else $input.checked = false; // at max / duplicate — revert
    } else {
      this.#store.remove(data.handle);
    }
  };

  /** Re-sync when another component (the comparison modal) mutates the store. */
  #onExternalChange = (event) => {
    if (
      event.detail?.collectionHandle &&
      event.detail.collectionHandle !== this.dataset.collectionHandle
    ) {
      return;
    }
    this.#render();
    this.#syncCheckboxes();
    this.#syncRules();
  };

  #onBarClick = (event) => {
    const $remove = event.target.closest("[data-compare-item-remove]");
    if ($remove) {
      this.#removeByHandle($remove.dataset.handle);
      return;
    }
    if (event.target.closest("[data-compare-clear]")) {
      this.#store.clear();
      this.#syncCheckboxes();
      return;
    }
    if (event.target.closest("[data-compare-now]")) {
      if (this.#store.size() >= 2) {
        this.dispatchEvent(
          new CustomEvent("compare:open", {
            bubbles: true,
            detail: { items: this.#store.list() },
          })
        );
      }
    }
  };

  #removeByHandle(handle) {
    if (!handle) return;
    this.#store.remove(handle);
    const $input = this.#checkboxFor(handle);
    if ($input) $input.checked = false;
  }

  // ---- Checkbox <-> store sync ----------------------------------------------

  #checkboxes() {
    return Array.from(
      document.querySelectorAll("[data-compare-checkbox]:not([data-compare-excluded])")
    );
  }

  #checkboxFor(handle) {
    return this.#checkboxes().find(
      ($i) => $i.closest("product-fetcher")?.publicData?.handle === handle
    );
  }

  /** Reflect stored selection onto the on-page checkboxes. */
  #syncCheckboxes() {
    this.#checkboxes().forEach(($i) => {
      const handle = $i.closest("product-fetcher")?.publicData?.handle;
      $i.checked = handle ? this.#store.has(handle) : false;
    });
  }

  /** Enforce max-4 and same-type by disabling unselectable checkboxes. */
  #syncRules() {
    const items = this.#store.list();
    const atMax = items.length >= this.#max;
    const selectedType = items[0]?.type ?? null;

    this.#checkboxes().forEach(($i) => {
      if ($i.checked) {
        $i.disabled = false;
        return;
      }
      const type = $i.closest("product-fetcher")?.publicData?.type ?? null;
      const wrongType = selectedType !== null && type !== selectedType;
      $i.disabled = atMax || wrongType;
    });
  }

  // ---- Drawer rendering -----------------------------------------------------

  #render() {
    const items = this.#store.list();

    this.querySelectorAll("[data-compare-count]").forEach(($c) => {
      $c.textContent = String(items.length);
    });
    if (this.$compareNow) this.$compareNow.disabled = items.length < 2;

    this.$slots.replaceChildren();
    items.forEach((item) => this.$slots.appendChild(this.#buildItem(item)));
    for (let i = items.length; i < this.#max; i += 1) {
      this.$slots.appendChild(this.$emptyTemplate.content.firstElementChild.cloneNode(true));
    }
  }

  #buildItem(item) {
    const node = this.$itemTemplate.content.firstElementChild.cloneNode(true);
    const $img = node.querySelector("[data-compare-item-image]");
    $img.src = item.image || "";
    $img.alt = item.title || "";
    node.querySelector("[data-compare-item-collection]").textContent = item.collectionLabel || "";
    const $title = node.querySelector("[data-compare-item-title-link]");
    $title.textContent = item.title || "";
    $title.href = item.url || "#";
    node.querySelector("[data-compare-item-link]").href = item.url || "#";
    const $remove = node.querySelector("[data-compare-item-remove]");
    $remove.dataset.handle = item.handle;
    $remove.setAttribute(
      "aria-label",
      (this.dataset.removeLabel || "Remove %TITLE%").replace("%TITLE%", item.title || "")
    );
    return node;
  }

  // ---- Staleness validation -------------------------------------------------

  async #validateStored() {
    const items = this.#store.list();
    if (items.length === 0) return;
    const root = shopifyRoot();

    const checks = await Promise.allSettled(
      items.map(async (item) => {
        const res = await fetch(`${root}products/${item.handle}.js`);
        if (!res.ok) return false;
        const data = await res.json();
        return !!data;
      })
    );

    const staleHandles = new Set(
      items
        .filter((_, i) => !(checks[i].status === "fulfilled" && checks[i].value === true))
        .map((item) => item.handle)
    );
    if (staleHandles.size > 0) {
      const current = this.#store.list();
      this.#store.replace(current.filter((item) => !staleHandles.has(item.handle)));
      this.#syncCheckboxes();
    }

    // Warm the comparison-modal column cache for the surviving (validated) products
    // so a later "Compare Now" paints instantly.
    this.#store.list().forEach((item) => prefetch(item.handle));
  }

  // ---- AJAX re-sync ---------------------------------------------------------

  #observeGrid() {
    const $grid = document.querySelector(GRID_SELECTOR);
    if (!$grid) return;
    const resync = debounce(() => {
      this.#syncCheckboxes();
      this.#syncRules();
    }, 100);
    this.#observer = new MutationObserver(resync);
    this.#observer.observe($grid, { childList: true, subtree: true });
  }
}

customElements.define("compare-bar", CompareBar);
