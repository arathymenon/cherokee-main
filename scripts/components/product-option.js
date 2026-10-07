/**
 * <product-option> Web Component
 *
 * Represents a single product option selector (e.g. color, size) and
 * dispatches custom events when the user selects or hovers over a value.
 * Designed to work inside a <product-fetcher> which listens for these events
 * to trigger variant/product switching.
 *
 * Supports both <select> dropdowns and radio-button swatches — it queries
 * for `option:checked` or `input:checked` to determine the current selection.
 *
 * Behaviors:
 *   - On change: updates the visible label text and dispatches a
 *     `product-option:change` event (bubbles up to <product-fetcher>).
 *   - On hover: after a 15ms debounce, updates the label to show the
 *     hovered value's display name and dispatches a `product-option:hover`
 *     event (used for prefetching).
 *   - On mouse leave: resets the label back to the selected value.
 *
 * Data attributes on option/input elements:
 *   - data-product-option-value-id     — The Shopify option value ID.
 *   - value                            — The option value name.
 *   - data-product-option-display-value — Human-readable display name for the label.
 *   - data-product-option-url          — Product URL (for grouped product switching).
 *
 * @example
 * <product-option data-product-fetcher-option-group="main">
 *   <span data-product-option-label>Red</span>
 *   <label>
 *     <input type="radio" name="color" value="red"
 *       data-product-option-value-id="123"
 *       data-product-option-display-value="Red"
 *       checked>
 *     Red
 *   </label>
 *   <label>
 *     <input type="radio" name="color" value="blue"
 *       data-product-option-value-id="456"
 *       data-product-option-display-value="Blue">
 *     Blue
 *   </label>
 * </product-option>
 */
const attributes = {
  label: "data-product-option-label",
  valueId: "data-product-option-value-id",
  valueName: "value",
  valueDisplayName: "data-product-option-display-value",
  productUrl: "data-product-option-url",
};

class ProductOption extends HTMLElement {
  /** @type {Number | NodeJS.Timeout | null} */
  #itemDebounceTimer = null;

  /** @type {Element | null} */
  #$hoveredItem = null;

  /** @type {string} */
  #defaultLabelText = "";

  constructor() {
    super();
    this.addEventListener("change", this.#handleChange.bind(this));
    this.addEventListener("mousemove", this.#handleMouseMove.bind(this));
    this.addEventListener("mouseleave", this.#handleMouseLeave.bind(this));
  }

  connectedCallback() {
    const $label = this.querySelector(`[${attributes.label}]`);
    this.#defaultLabelText = $label?.textContent ?? "";
    if (this.selectedValue) this.#updateLabel();
  }

  /**
   * Gets the selected value.
   * @returns {{id: string, name: string, displayName: string, productUrl: string} | null} The selected value data or null if no value is selected.
   */
  get selectedValue() {
    const $element = this.querySelector("option:checked, input:checked");
    if (!$element) return null;
    return {
      id: $element.getAttribute(attributes.valueId) || "",
      name: $element.getAttribute(attributes.valueName) || "",
      displayName: $element.getAttribute(attributes.valueDisplayName) || "",
      productUrl: $element.getAttribute(attributes.productUrl) || "",
    };
  }

  /**
   * Programmatically selects the value with the given id (radio or select
   * option) and updates the label(s). Does NOT dispatch change — used by
   * <product-fetcher> when restoring the user's picks after a SAPI swap.
   * @param {string} valueId
   * @returns {boolean} true when a matching control was found
   */
  applySelection(valueId) {
    const esc = CSS.escape(String(valueId));
    const $radio = this.querySelector(`input[type='radio'][${attributes.valueId}="${esc}"]`);
    const $opt = this.querySelector(`option[${attributes.valueId}="${esc}"]`);
    if ($radio) {
      if (!$radio.checked) $radio.checked = true;
    } else if ($opt) {
      $opt.selected = true;
      const $select = $opt.closest("select");
      if ($select) $select.value = $opt.value;
    } else {
      return false;
    }
    this.#updateLabel();
    return true;
  }

  /**
   * Clears any selection and resets the label(s) to the server-rendered
   * default (e.g. "Please Select"). Does NOT dispatch change — used by
   * <product-fetcher> after a SAPI swap, because Shopify auto-resolves a
   * full variant and renders every option position selected even when the
   * shopper hasn't picked this one yet.
   */
  clearSelection() {
    this.querySelectorAll("input[type='radio']:checked").forEach(($radio) => {
      $radio.checked = false;
    });
    this.querySelectorAll("select").forEach(($select) => {
      const $placeholder = $select.querySelector("option[value='']");
      if ($placeholder) {
        $placeholder.selected = true;
        $select.value = "";
      } else {
        $select.selectedIndex = -1;
      }
    });

    const $labels = this.querySelectorAll(`[${attributes.label}]`);
    if ($labels.length === 0) return;
    $labels.forEach(($l) => {
      $l.textContent = "";
    });
    const $topLabel =
      Array.from($labels).find(($l) => !$l.closest("[data-swatch-group-label]")) || $labels[0];
    $topLabel.textContent = this.#defaultLabelText;
  }

  /**
   * Gets the hovered value.
   * @returns {{id: string, name: string, displayName: string, productUrl: string} | null} The hovered value data or null if no item is hovered.
   */
  get hoveredValue() {
    if (!this.#$hoveredItem) return null;
    return {
      id: this.#$hoveredItem.getAttribute(attributes.valueId) || "",
      name: this.#$hoveredItem.getAttribute(attributes.valueName) || "",
      displayName: this.#$hoveredItem.getAttribute(attributes.valueDisplayName) || "",
      productUrl: this.#$hoveredItem.getAttribute(attributes.productUrl) || "",
    };
  }

  /**
   * Updates the label(s) with the active value.
   *
   * Single-label mode (Size/Inseam, or color without swatch_groups): writes
   * the active value's display name into the lone `[data-product-option-label]`
   * span — original behavior.
   *
   * Multi-label mode (color with swatch_groups): the active swatch lives
   * inside a row tagged with `data-swatch-group="{idx}"` (`-1` for ungrouped).
   * Each group label is wrapped in `data-swatch-group-label="{idx}"` and
   * contains its own `[data-product-option-label]` span. We clear every label
   * span first, then write the active value's display name into the one
   * matching the active group (or the top legend for `-1`).
   */
  #updateLabel() {
    const $labels = this.querySelectorAll(`[${attributes.label}]`);
    if ($labels.length === 0) return;

    const displayName =
      this.#$hoveredItem?.getAttribute(attributes.valueDisplayName) ||
      this.selectedValue?.displayName ||
      this.#defaultLabelText;

    if ($labels.length === 1) {
      $labels[0].textContent = displayName;
      return;
    }

    const $active = this.#$hoveredItem || this.querySelector("input:checked");
    const groupIdx = $active?.closest("[data-swatch-group]")?.dataset.swatchGroup;
    const $topLabel = Array.from($labels).find(($l) => !$l.closest("[data-swatch-group-label]"));

    $labels.forEach(($l) => {
      $l.textContent = "";
    });

    if (!groupIdx || groupIdx === "-1") {
      if ($topLabel) $topLabel.textContent = displayName;
      return;
    }

    const $groupLabel = this.querySelector(
      `[data-swatch-group-label="${CSS.escape(groupIdx)}"] [${attributes.label}]`
    );
    if ($groupLabel) $groupLabel.textContent = displayName;
  }

  #handleChange() {
    this.#updateLabel();
    this.dispatchEvent(
      new CustomEvent("product-option:change", {
        detail: this.selectedValue,
        bubbles: true,
      })
    );
  }

  /**
   * @param {Event} event
   */
  #handleMouseMove(event) {
    this.#handleLabelHover(event);
  }

  #handleMouseLeave() {
    this.#handleLabelHover(null);
  }

  /**
   * @param {Event | null} event
   */
  #handleLabelHover(event = null) {
    if (this.#itemDebounceTimer) {
      clearInterval(this.#itemDebounceTimer);
    }
    if (!event) {
      this.#$hoveredItem = null;
      this.#updateLabel();
      return;
    }
    this.#itemDebounceTimer = setInterval(() => {
      let $hoveredInput = null;
      const $closestLabel = event.target instanceof Element && event.target?.closest("label");
      if ($closestLabel) {
        $hoveredInput = $closestLabel.querySelector(`input[${attributes.valueDisplayName}]`);
      }
      if ($hoveredInput !== this.#$hoveredItem) {
        this.#$hoveredItem = $hoveredInput;
        this.#updateLabel();
        this.dispatchEvent(
          new CustomEvent("product-option:hover", {
            detail: this.hoveredValue,
            bubbles: true,
          })
        );
      }
    }, 15);
  }
}

if (!customElements.get("product-option")) customElements.define("product-option", ProductOption);
