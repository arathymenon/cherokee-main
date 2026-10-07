/**
 * <quantity-input> Web Component
 *
 * Wraps a numeric <input> with increment/decrement buttons. Clicking the
 * buttons calls the native `stepUp()` / `stepDown()` methods on the input,
 * so `min`, `max`, and `step` attributes are respected automatically.
 *
 * A `change` event (bubbling) is dispatched after each adjustment, allowing
 * parent components (e.g. cart forms) to react to quantity updates.
 *
 * Button markup:
 *   - data-quantity-input-decrease — marks the "minus" button.
 *   - data-quantity-input-increase — marks the "plus" button.
 *
 * @example
 * <quantity-input>
 *   <button data-quantity-input-decrease>-</button>
 *   <input type="number" value="1" min="1" max="10">
 *   <button data-quantity-input-increase>+</button>
 * </quantity-input>
 */
const attributes = {
  decrease: "data-quantity-input-decrease",
  increase: "data-quantity-input-increase",
};

class QuantityInput extends HTMLElement {
  constructor() {
    super();
    this.changeEvent = new Event("change", { bubbles: true });
  }

  connectedCallback() {
    this.input = this.querySelector("input");

    this.querySelectorAll(
      `[${attributes.decrease}], [${attributes.increase}]`
    ).forEach((button) =>
      button.addEventListener("click", this.onButtonClick.bind(this))
    );
  }

  onButtonClick(event) {
    event.preventDefault();
    const previousValue = this.input.value;

    event.currentTarget.hasAttribute(attributes.increase)
      ? this.input.stepUp()
      : this.input.stepDown();
    if (previousValue !== this.input.value)
      this.input.dispatchEvent(this.changeEvent);
  }
}

customElements.define("quantity-input", QuantityInput);
