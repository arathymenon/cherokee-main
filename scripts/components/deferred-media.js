if (!customElements.get("deferred-media")) {
  class DeferredMedia extends HTMLElement {
    connectedCallback() {
      const button = this.querySelector("[data-deferred-media-button]");
      if (button) {
        button.addEventListener("click", () => this.#loadMedia(), {
          once: true,
        });
      }
    }

    #loadMedia() {
      const template = this.querySelector("template");
      if (!template) return;

      const poster = this.querySelector("[data-deferred-media-poster]");
      if (poster) poster.style.display = "none";

      const button = this.querySelector("[data-deferred-media-button]");
      if (button) button.style.display = "none";

      this.appendChild(template.content.cloneNode(true));
    }
  }

  customElements.define("deferred-media", DeferredMedia);
}
