/**
 * <custom-scroll>
 *
 * Mouse drag-to-scroll horizontal scroller with optional prev/next buttons
 * that auto show/hide based on scroll position.
 *
 * Two markup patterns:
 *   1. Simple — <custom-scroll> IS the scroll container (overflow-x-auto on
 *      itself). Used for RTE tables.
 *   2. Full — wrap a [data-custom-scroll-track] child (the scroll element)
 *      plus optional [data-action-scroll-prev] / [data-action-scroll-next]
 *      buttons. Buttons start hidden; each is shown only while scrolling is
 *      possible in that direction.
 *
 * Inside a <tarot-carousel>, add data-tarot-no-drag to this element so the
 * carousel doesn't hijack horizontal drags (Tarot's documented escape hatch).
 *
 * connectedCallback re-runs when an ancestor (e.g. <product-fetcher>) swaps
 * the markup; an AbortController + ResizeObserver are torn down on disconnect.
 */
if (!customElements.get("custom-scroll")) {
  class CustomScroll extends HTMLElement {
    #scrollEl = null;
    #prevBtn = null;
    #nextBtn = null;
    #observer = null;
    #controller = null;
    #isDown = false;
    #startX = 0;
    #startScroll = 0;

    connectedCallback() {
      this.#scrollEl = this.querySelector("[data-custom-scroll-track]") || this;
      this.#prevBtn = this.querySelector("[data-action-scroll-prev]");
      this.#nextBtn = this.querySelector("[data-action-scroll-next]");

      this.#controller = new AbortController();
      const { signal } = this.#controller;

      // Mouse drag-to-scroll (touch uses native overflow scrolling).
      this.#scrollEl.addEventListener("mousedown", this.#onMouseDown, { signal });
      this.#scrollEl.addEventListener("mousemove", this.#onMouseMove, { signal });
      this.#scrollEl.addEventListener("mouseup", this.#onMouseUp, { signal });
      this.#scrollEl.addEventListener("mouseleave", this.#onMouseUp, { signal });

      // Optional buttons.
      this.#prevBtn?.addEventListener("click", () => this.#page(-1), { signal });
      this.#nextBtn?.addEventListener("click", () => this.#page(1), { signal });

      // Keep button visibility in sync with scroll position / size.
      this.#scrollEl.addEventListener("scroll", this.#update, { passive: true, signal });
      this.#observer = new ResizeObserver(this.#update);
      this.#observer.observe(this.#scrollEl);
      this.#update();
    }

    disconnectedCallback() {
      this.#controller?.abort();
      this.#observer?.disconnect();
    }

    #page(direction) {
      this.#scrollEl.scrollBy({
        left: direction * this.#scrollEl.clientWidth * 0.8,
        behavior: "smooth",
      });
    }

    #update = () => {
      const el = this.#scrollEl;
      const remaining = el.scrollWidth - el.clientWidth - el.scrollLeft;
      this.#prevBtn?.classList.toggle("hidden", el.scrollLeft <= 1);
      this.#nextBtn?.classList.toggle("hidden", remaining <= 1);
    };

    #onMouseDown = (e) => {
      this.#isDown = true;
      this.#startX = e.pageX - this.#scrollEl.offsetLeft;
      this.#startScroll = this.#scrollEl.scrollLeft;
    };

    #onMouseMove = (e) => {
      if (!this.#isDown) return;
      e.preventDefault();
      const x = e.pageX - this.#scrollEl.offsetLeft;
      this.#scrollEl.scrollLeft = this.#startScroll - (x - this.#startX);
    };

    #onMouseUp = () => {
      this.#isDown = false;
    };
  }
  customElements.define("custom-scroll", CustomScroll);
}
