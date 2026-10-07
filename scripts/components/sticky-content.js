class StickyContent extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    this.onResize = this.onResize.bind(this);

    // The element itself is the sticky block, so the sentinel must live outside
    // it (previous sibling) — a child would pin along with the element.
    this.sentinel = document.createElement("div");
    this.sentinel.setAttribute("aria-hidden", "true");
    this.sentinel.style.cssText = "height:0;margin:0;padding:0;pointer-events:none;";
    this.parentNode.insertBefore(this.sentinel, this);

    this.resizeTimer = null;
    this.observe();

    window.addEventListener("resize", this.onResize, { passive: true });
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this.onResize);
    clearTimeout(this.resizeTimer);
    this.observer?.disconnect();
    this.sentinel?.remove();
  }

  observe() {
    this.observer?.disconnect();

    const top = parseFloat(getComputedStyle(this).top) || 0;

    this.observer = new IntersectionObserver(
      ([entry]) => {
        const stuck = entry.intersectionRatio === 0 && entry.boundingClientRect.top < top;
        this.toggleAttribute("stuck", stuck);
      },
      { rootMargin: `-${top}px 0px 0px 0px`, threshold: 0 }
    );
    this.observer.observe(this.sentinel);
  }

  onResize() {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => this.observe(), 30);
  }
}

customElements.define("sticky-content", StickyContent);
