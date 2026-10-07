/**
 * <klaviyo-form-lazy>
 *
 * Keeps the Klaviyo newsletter embed out of the live DOM until near the
 * viewport, so first-load audits don't pay for hydrated form SVG/markup.
 *
 * @example
 * <klaviyo-form-lazy class="block" style="min-height: 232px">
 *   <template>
 *     <div class="klaviyo-form-R8NRr5"></div>
 *   </template>
 * </klaviyo-form-lazy>
 */

const ROOT_MARGIN = "200px 0px";

class KlaviyoFormLazy extends HTMLElement {
  /** @type {IntersectionObserver | null} */
  #observer = null;
  #activated = false;

  connectedCallback() {
    if (this.#activated || this.hasAttribute("data-klaviyo-activated")) return;

    const template = this.querySelector(":scope > template");
    if (!template) return;

    if (typeof IntersectionObserver !== "function") {
      this.#activate(template);
      return;
    }

    this.#observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        this.#activate(template);
      },
      { rootMargin: ROOT_MARGIN, threshold: 0 }
    );
    this.#observer.observe(this);
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
    this.#observer = null;
  }

  /** @param {HTMLTemplateElement} template */
  #activate(template) {
    if (this.#activated) return;
    this.#activated = true;
    this.setAttribute("data-klaviyo-activated", "");
    this.#observer?.disconnect();
    this.#observer = null;
    this.append(template.content.cloneNode(true));
    template.remove();
  }
}

customElements.define("klaviyo-form-lazy", KlaviyoFormLazy);
