import { parseLineKeys, updateCartLineQuantities } from "../utilities/helpers.js";

/**
 * <set-cart-item> Web Component
 *
 * Wraps a "set" cart entry rendered by cart-template-set.liquid and treats the
 * whole group as a single cart unit. The element knows every line key in the
 * group (via the `line-keys` attribute, a JSON array) and batches quantity
 * changes / removal across all of them in a single /cart/update.js POST.
 *
 * Required attributes:
 *   - group-id   group identifier (informational; the actual targeting uses line-keys)
 *   - line-keys  JSON array of cart line item keys for every group member
 *
 * Required descendants:
 *   - [data-set-quantity-input]   the visible number input
 *   - [data-set-quantity-minus]   - button
 *   - [data-set-quantity-plus]    + button
 *   - [data-set-remove]           trash/remove button
 *
 * Cart re-render is automatic — liquidAjaxCart.update triggers the existing
 * data-ajax-cart-section innerHTML swap, so this component never has to refresh
 * anything itself.
 */
class SetCartItem extends HTMLElement {
  /** @type {ReturnType<typeof setTimeout> | null} */
  #debounceTimer = null;

  connectedCallback() {
    this.addEventListener("click", this.#onClick.bind(this));
    this.addEventListener("change", this.#onChange.bind(this));
  }

  /** @returns {string[]} */
  get #lineKeys() {
    return parseLineKeys(this.getAttribute("line-keys"));
  }

  /** @param {MouseEvent} e */
  #onClick(e) {
    const remove = e.target.closest("[data-set-remove]");
    if (remove) {
      e.preventDefault();
      this.#scheduleUpdate(0);
      return;
    }

    const minus = e.target.closest("[data-set-quantity-minus]");
    const plus = e.target.closest("[data-set-quantity-plus]");
    if (!minus && !plus) return;
    e.preventDefault();

    const input = this.querySelector("[data-set-quantity-input]");
    if (!input) return;
    const current = parseInt(input.value, 10) || 0;
    const next = Math.max(0, current + (plus ? 1 : -1));
    input.value = String(next);
    this.#scheduleUpdate(next);
  }

  /** @param {Event} e */
  #onChange(e) {
    const input = e.target.closest("[data-set-quantity-input]");
    if (!input) return;
    const next = Math.max(0, parseInt(input.value, 10) || 0);
    input.value = String(next);
    this.#scheduleUpdate(next);
  }

  /** @param {number} quantity */
  #scheduleUpdate(quantity) {
    if (this.#debounceTimer) clearTimeout(this.#debounceTimer);
    this.#debounceTimer = setTimeout(() => this.#updateAll(quantity), 300);
  }

  /** @param {number} quantity */
  #updateAll(quantity) {
    updateCartLineQuantities(this.#lineKeys, quantity);
  }
}

if (!customElements.get("set-cart-item")) {
  customElements.define("set-cart-item", SetCartItem);
}
