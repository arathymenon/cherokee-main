/**
 * <shop-by-color> Web Component
 *
 * Swaps the carousel's slides when the user clicks a color selector in the
 * tablist. Fetches the `shop-by-color` section via the Section Rendering API
 * for the selected collection's URL and replaces the live `<tarot-track>`
 * contents with the response's `<tarot-track>` contents. Tarot's track
 * MutationObserver picks up the childList change and re-inits.
 */

class ShopByColor extends HTMLElement {
  #fetcher = null;

  connectedCallback() {
    this.#fetcher = window.VegaX.createHTMLFetcher({ useViewTransition: false });
    this.addEventListener("click", this.#onClick);
    this.addEventListener("keydown", this.#onKeyDown);
    this.#initRovingTabindex();
  }

  disconnectedCallback() {
    this.removeEventListener("click", this.#onClick);
    this.removeEventListener("keydown", this.#onKeyDown);
  }

  #onClick = (event) => {
    const $btn = event.target.closest("[data-shop-by-color-selector]");
    if (!$btn || !this.contains($btn)) return;
    if ($btn.getAttribute("aria-selected") === "true") return;

    const collectionUrl = $btn.dataset.collectionUrl;
    if (!collectionUrl) return;

    this.#setActiveSelector($btn);
    this.#updateCTAs(collectionUrl);
    this.#fetchCarousel(collectionUrl);
  };

  #onKeyDown = (event) => {
    const $current = event.target.closest("[data-shop-by-color-selector]");
    if (!$current || !this.contains($current)) return;

    const tabs = this.#getTabs();
    const i = tabs.indexOf($current);
    if (i === -1) return;

    let $next = null;
    switch (event.key) {
      case "ArrowRight":
        $next = tabs[(i + 1) % tabs.length];
        break;
      case "ArrowLeft":
        $next = tabs[(i - 1 + tabs.length) % tabs.length];
        break;
      case "Home":
        $next = tabs[0];
        break;
      case "End":
        $next = tabs[tabs.length - 1];
        break;
      default:
        return;
    }

    event.preventDefault();
    this.#focusTab($next);
  };

  #getTabs() {
    return Array.from(this.querySelectorAll("[data-shop-by-color-selector]"));
  }

  #initRovingTabindex() {
    this.#getTabs().forEach(($el) => {
      $el.setAttribute("tabindex", $el.getAttribute("aria-selected") === "true" ? "0" : "-1");
    });
  }

  #focusTab($tab) {
    this.#getTabs().forEach(($el) => {
      $el.setAttribute("tabindex", $el === $tab ? "0" : "-1");
    });
    $tab.focus();
  }

  #setActiveSelector($btn) {
    this.#getTabs().forEach(($el) => {
      const selected = $el === $btn;
      $el.setAttribute("aria-selected", selected ? "true" : "false");
      $el.setAttribute("tabindex", selected ? "0" : "-1");
    });
  }

  #updateCTAs(url) {
    this.querySelectorAll("[data-shop-by-color-cta]").forEach(($a) => {
      $a.setAttribute("href", url);
    });
  }

  #fetchCarousel(collectionUrl) {
    const $area = this.querySelector("[data-shop-by-color-area]");
    if (!$area) return;
    const $track = $area.querySelector("tarot-track");
    const $carousel = $area.querySelector("tarot-carousel");
    if (!$track || !$carousel) return;

    const url = new URL(collectionUrl, window.location.origin);
    url.searchParams.set("section_id", "shop-by-color");

    const loadingClass = $area.dataset.shopByColorLoadingClass;
    const loadingClasses = loadingClass ? [{ element: $area, classList: loadingClass }] : [];

    this.#fetcher
      .fetch(url, [{ target: [$track], source: "tarot-track" }], loadingClasses)
      .then(() => {
        $carousel.jumpToSlide(0);
        window.yotpoWidgetsContainer?.initWidgets?.();
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        console.error("[shop-by-color] fetch failed", error);
      });
  }
}

customElements.define("shop-by-color", ShopByColor);
