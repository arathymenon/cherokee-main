const selectors = {
  mainFormWrapper: "ajax-cart-product-form",
  mainButton: "ajax-cart-product-form button[name=add]",
  scrollTarget: "product-option",
  groupWrapper: ".group\\/ajax-cart-product-form",
  scrollToFormAction: "[data-action-scroll-to-form]",
};

const attributes = {
  visible: "visible",
  processing: "processing",
};

class StickyAddToCart extends HTMLElement {
  #mainButton = null;
  #mainFormWrapper = null;
  #scrollTarget = null;
  #groupWrapper = null;
  #intersectionObserver = null;
  #attributeObserver = null;

  connectedCallback() {
    // Mobile-only: skip all wiring on desktop. CSS hides the bar there too.
    if (window.matchMedia("(min-width: 1024px)").matches) return;

    this.#mainButton = document.querySelector(selectors.mainButton);
    this.#mainFormWrapper = document.querySelector(selectors.mainFormWrapper);
    this.#scrollTarget = document.querySelector(selectors.scrollTarget) || this.#mainButton;
    this.#groupWrapper = this.querySelector(selectors.groupWrapper) || this;

    // Show only when the main buy button has scrolled above the viewport.
    if (this.#mainButton) {
      this.#intersectionObserver = new IntersectionObserver(
        ([entry]) => {
          const isAbove = entry.boundingClientRect.top < 0;
          this.toggleAttribute(attributes.visible, !entry.isIntersecting && isAbove);
        },
        { threshold: 0 }
      );
      this.#intersectionObserver.observe(this.#mainButton);
    }

    // Mirror [processing] attribute from the main ajax-cart wrapper onto our
    // local group wrapper so the Tailwind group-[[processing]]/… variants fire.
    if (this.#mainFormWrapper) {
      this.#syncProcessing();
      this.#attributeObserver = new MutationObserver(() => this.#syncProcessing());
      this.#attributeObserver.observe(this.#mainFormWrapper, {
        attributes: true,
        attributeFilter: [attributes.processing],
      });
    }

    this.addEventListener("click", this.#handleClick.bind(this));
  }

  disconnectedCallback() {
    this.#intersectionObserver?.disconnect();
    this.#attributeObserver?.disconnect();
  }

  #syncProcessing() {
    if (!this.#mainFormWrapper || !this.#groupWrapper) return;
    this.#groupWrapper.toggleAttribute(
      attributes.processing,
      this.#mainFormWrapper.hasAttribute(attributes.processing)
    );
  }

  #handleClick(event) {
    if (!event.target.closest(selectors.scrollToFormAction)) return;
    event.preventDefault();
    this.#scrollTarget?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

customElements.define("sticky-add-to-cart", StickyAddToCart);
