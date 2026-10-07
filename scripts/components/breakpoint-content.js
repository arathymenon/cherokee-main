class BreakpointContent extends HTMLElement {
  /** @type {MediaQueryList | null} */
  #mediaQuery = null;
  /** @type {DocumentFragment} */
  #stash = document.createDocumentFragment();
  /** @type {ReturnType<typeof setTimeout> | null} */
  #resizeTimer = null;

  #onMediaChange = () => {
    this.#sync();
  };

  #onResize = () => {
    clearTimeout(this.#resizeTimer);
    this.#resizeTimer = setTimeout(() => this.#sync(), 50);
  };

  connectedCallback() {
    const query = this.getAttribute("match") || "(min-width: 1024px)";
    this.#mediaQuery = window.matchMedia(query);

    if (typeof this.#mediaQuery.addEventListener === "function") {
      this.#mediaQuery.addEventListener("change", this.#onMediaChange);
    } else if (typeof this.#mediaQuery.addListener === "function") {
      this.#mediaQuery.addListener(this.#onMediaChange);
    }

    window.addEventListener("resize", this.#onResize, { passive: true });
    this.#sync();
  }

  disconnectedCallback() {
    if (this.#mediaQuery) {
      if (typeof this.#mediaQuery.removeEventListener === "function") {
        this.#mediaQuery.removeEventListener("change", this.#onMediaChange);
      } else if (typeof this.#mediaQuery.removeListener === "function") {
        this.#mediaQuery.removeListener(this.#onMediaChange);
      }
    }

    window.removeEventListener("resize", this.#onResize);
    clearTimeout(this.#resizeTimer);
  }

  #sync() {
    if (!this.#mediaQuery) return;

    const shouldMount = this.#mediaQuery.matches;
    const hasLiveChildren = this.childNodes.length > 0;

    if (shouldMount && !hasLiveChildren) {
      this.append(this.#stash);
      this.dispatchEvent(new CustomEvent("breakpoint-content:mounted", { bubbles: true }));
    } else if (!shouldMount && hasLiveChildren) {
      while (this.firstChild) {
        this.#stash.appendChild(this.firstChild);
      }
      this.dispatchEvent(new CustomEvent("breakpoint-content:unmounted", { bubbles: true }));
    }
  }
}

if (!customElements.get("breakpoint-content")) {
  customElements.define("breakpoint-content", BreakpointContent);
}
