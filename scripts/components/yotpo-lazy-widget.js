const WIDGET_CLASS = "yotpo-widget-instance";
const ROOT_MARGIN = "200px 0px";

/** @type {Set<string>} */
const loadedScripts = new Set();

class YotpoLazyWidget extends HTMLElement {
  /** @type {IntersectionObserver | null} */
  #observer = null;
  #activated = false;

  /** @returns {HTMLElement | null} */
  #mount() {
    return this.querySelector(":scope > [data-yotpo-instance-id]");
  }

  connectedCallback() {
    if (this.#activated || this.hasAttribute("data-yotpo-activated")) {
      this.#activated = true;
      return;
    }

    const mount = this.#mount();
    if (!mount) return;

    if (mount.classList.contains(WIDGET_CLASS) || mount.childElementCount > 0) {
      this.#activated = true;
      this.setAttribute("data-yotpo-activated", "");
      return;
    }

    if (typeof IntersectionObserver !== "function") {
      this.#activate();
      return;
    }

    this.#observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        this.#activate();
      },
      { rootMargin: ROOT_MARGIN, threshold: 0 }
    );
    this.#observer.observe(this);
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
    this.#observer = null;
  }

  async #activate() {
    if (this.#activated) return;
    this.#activated = true;
    this.setAttribute("data-yotpo-activated", "");
    this.#observer?.disconnect();
    this.#observer = null;

    const mount = this.#mount();
    if (!mount) return;

    mount.classList.add(WIDGET_CLASS);

    const loaderSrc = this.getAttribute("loader-src");
    if (loaderSrc) await this.#loadScript(loaderSrc);

    this.#initWidgets();
  }

  /**
   * @param {string} src
   * @returns {Promise<void>}
   */
  #loadScript(src) {
    if (loadedScripts.has(src)) return Promise.resolve();
    if (document.querySelector(`script[src="${src}"]`)) {
      loadedScripts.add(src);
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => {
        loadedScripts.add(src);
        resolve();
      };
      script.onerror = () => reject(new Error(`[yotpo-lazy-widget] failed to load ${src}`));
      document.head.appendChild(script);
    }).catch((error) => {
      console.error(error);
    });
  }

  #initWidgets(attempt = 0) {
    if (typeof window.yotpoWidgetsContainer?.initWidgets === "function") {
      window.yotpoWidgetsContainer.initWidgets();
      return;
    }
    if (attempt > 40) return;
    setTimeout(() => this.#initWidgets(attempt + 1), 250);
  }
}

if (!customElements.get("yotpo-lazy-widget")) {
  customElements.define("yotpo-lazy-widget", YotpoLazyWidget);
}
