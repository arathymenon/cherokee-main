const WIDGET_CLASS = "yotpo-widget-instance";
const ROOT_MARGIN = "200px 0px";

/** @type {Set<HTMLElement>} */
const pendingMounts = new Set();
/** @type {ReturnType<typeof requestAnimationFrame> | null} */
let activateRaf = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let initRetryTimer = null;
let initAttempts = 0;

function flushActivations() {
  activateRaf = null;
  if (pendingMounts.size === 0) return;

  for (const mount of pendingMounts) {
    mount.classList.add(WIDGET_CLASS);
  }
  pendingMounts.clear();
  scheduleInitWidgets();
}

function scheduleInitWidgets() {
  if (initRetryTimer) return;

  const tryInit = () => {
    if (typeof window.yotpoWidgetsContainer?.initWidgets === "function") {
      initRetryTimer = null;
      initAttempts = 0;
      window.yotpoWidgetsContainer.initWidgets();
      return;
    }
    initAttempts += 1;
    if (initAttempts > 40) {
      initRetryTimer = null;
      initAttempts = 0;
      return;
    }
    initRetryTimer = setTimeout(() => {
      initRetryTimer = null;
      tryInit();
    }, 250);
  };

  tryInit();
}

class YotpoStars extends HTMLElement {
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

    // Already hydrated (section morph / prior init left widget markup).
    if (
      mount.classList.contains(WIDGET_CLASS) ||
      mount.querySelector(".yotpo-reviews-star-ratings-widget")
    ) {
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
    const mount = this.#mount();
    if (mount) pendingMounts.delete(mount);
  }

  #activate() {
    if (this.#activated) return;
    this.#activated = true;
    this.setAttribute("data-yotpo-activated", "");
    this.#observer?.disconnect();
    this.#observer = null;

    const mount = this.#mount();
    if (!mount) return;

    pendingMounts.add(mount);
    if (activateRaf == null) {
      activateRaf = requestAnimationFrame(flushActivations);
    }
  }
}

if (!customElements.get("yotpo-stars")) {
  customElements.define("yotpo-stars", YotpoStars);
}

export { scheduleInitWidgets };
