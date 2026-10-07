import { parseLineKeys, updateCartLineQuantities } from "../utilities/helpers.js";

class EmbroideryCartItem extends HTMLElement {
  #abort = null;

  connectedCallback() {
    this.#abort?.abort();
    this.#abort = new AbortController();
    this.addEventListener("click", this.#onClick, { signal: this.#abort.signal });
  }

  disconnectedCallback() {
    this.#abort?.abort();
    this.#abort = null;
  }

  get #lineKeys() {
    return parseLineKeys(this.getAttribute("line-keys"));
  }

  #onClick = (event) => {
    if (!event.target?.closest?.("[data-embroidery-remove]")) return;

    event.preventDefault();
    updateCartLineQuantities(this.#lineKeys, 0);
  };
}

if (!customElements.get("embroidery-cart-item")) {
  customElements.define("embroidery-cart-item", EmbroideryCartItem);
}
