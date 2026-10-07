/**
 * <html-fetcher> Web Component
 *
 * Fetches HTML from a URL and injects it into targeted areas of the page.
 * Uses VegaX's HTMLFetcher under the hood and supports Shopify's section
 * rendering API via the `section` attribute.
 *
 * Loading modes:
 *   - eager (default): fetches immediately on mount.
 *   - lazy: defers the fetch until the element scrolls into view
 *     (via IntersectionObserver).
 *
 * Attributes:
 *   - href              — URL to fetch HTML from.
 *   - section           — Shopify section ID; appended as `?section_id=` to the request.
 *   - loading           — "eager" (default) or "lazy".
 *   - use-view-transition — Opt in to View Transitions API during swaps.
 *   - data-html-fetcher-area — Marks child elements whose content should be
 *     swapped with the matching fetched content.
 *   - data-html-fetcher-loading-class — CSS class toggled on/off during fetch.
 *
 * <html-fetcher-trigger> Companion Component
 *
 * A clickable element that triggers a fetch on a parent or targeted
 * <html-fetcher>. Uses `href` for the URL and an optional `selector`
 * attribute to target a specific fetcher by CSS selector.
 *
 * @example
 * <html-fetcher href="/products" section="main-collection" loading="lazy">
 *   <div data-html-fetcher-area><!-- content swapped here --></div>
 * </html-fetcher>
 *
 * <html-fetcher id="my-fetcher">
 *   <div data-html-fetcher-area><!-- initial content --></div>
 *   <html-fetcher-trigger href="/page-2" selector="#my-fetcher">
 *     <a href="/page-2">Load more</a>
 *   </html-fetcher-trigger>
 * </html-fetcher>
 */
import { querySelectorAllOwn } from "../utilities/helpers";

const fetcherElementName = "html-fetcher";
const loadingTypes = {
  EAGER: "eager",
  LAZY: "lazy",
};

const attributes = {
  area: "data-html-fetcher-area",
  fetcherLink: "data-html-fetcher-link",
  loadingClass: "data-html-fetcher-loading-class",
  sectionId: "section",
  href: "href",
  loading: "loading",
  useViewTransition: "use-view-transition",
};

class HTMLFetcher extends HTMLElement {
  #htmlFetcher;

  /** @type {IntersectionObserver | null} */
  #intersectionObserver = null;

  constructor() {
    super();
    this.#htmlFetcher = window.VegaX.createHTMLFetcher({
      useViewTransition: this.hasAttribute(attributes.useViewTransition),
    });

    // this.addEventListener("click", (event) => {
    //   for (
    //     let $target = event.target;
    //     $target && $target !== this;
    //     $target = $target.parentElement
    //   ) {
    //     if ($target.hasAttribute(attributes.fetcherLink)) {
    //       event.preventDefault();
    //       let url =
    //         $target.getAttribute(attributes.fetcherLink) || $target.href;
    //       this.setUrl(url);
    //       return;
    //     }
    //   }
    // });
  }

  connectedCallback() {
    const href = this.getAttribute(attributes.href);
    if (href) {
      if (this.getAttribute(attributes.loading) === loadingTypes.LAZY) {
        this.#initLazyLoad(href);
      } else {
        this.renderURL(href);
      }
    }
  }

  /**
   * @param {string} href
   */
  #initLazyLoad(href) {
    this.#intersectionObserver = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        this.renderURL(href);
      },
      {
        rootMargin: "0px 0px 0px 0px",
      }
    );
    this.#intersectionObserver.observe(this);
  }

  #toggleLoadingClasses(on) {
    this.querySelectorAll(`[${attributes.loadingClass}]`).forEach(($element) => {
      const className = $element.getAttribute(attributes.loadingClass);
      if (!className) return;
      const fetcherRef = $element.getAttribute(attributes.fetcherRef);
      if (fetcherRef && fetcherRef !== this.id) return;
      if (!fetcherRef && $element.closest(fetcherElementName) !== this) return;
      $element.classList.toggle(className, on);
    });
  }

  /**
   * @param {string} href
   */
  async renderURL(href) {
    // Turn off lazy loading
    this.#intersectionObserver?.unobserve(this);
    this.#intersectionObserver = null;

    // TODO: handle situation when href is not set,
    // also consider there should be method to re-render the same URL

    const url = new URL(href, window.location.origin);
    const sectionId = this.getAttribute(attributes.sectionId);
    if (sectionId) {
      url.searchParams.set("section_id", sectionId);
    }

    const sourceSelector =
      fetcherElementName + (this.getAttribute(attributes.sapiId) ? "#" + this.id : "");

    let targetMap = [];
    const $targetSelectors = querySelectorAllOwn(
      this,
      `[${attributes.area}], [${attributes.loadingClass}]`
    );

    const $updateSelectors = $targetSelectors.filter(($el) => $el.hasAttribute(attributes.area));

    const loadingSelectors = $targetSelectors
      .filter(($el) => $el.hasAttribute(attributes.loadingClass))
      .map(($el) => ({
        element: $el,
        classList: $el.getAttribute(attributes.loadingClass) || "",
      }));

    if ($updateSelectors.length) {
      targetMap = [
        {
          target: $updateSelectors,
          source: `${sourceSelector} [${attributes.area}]`,
        },
      ];
    } else {
      targetMap = [
        {
          target: this,
          source: sourceSelector,
        },
      ];
    }
    this.#htmlFetcher.fetch(url, targetMap, loadingSelectors).catch((error) => {
      if (error?.name === "AbortError") return;
      console.error("[html-fetcher] fetch failed", error);
    });
  }
}

customElements.define(fetcherElementName, HTMLFetcher);

class HTMLFetcherTrigger extends HTMLElement {
  constructor() {
    super();
    this.addEventListener("click", this.#clickHandler.bind(this));
  }

  #clickHandler = (event) => {
    const selector = this.getAttribute("selector");
    const $fetcher = selector ? document.querySelector(selector) : this.closest(fetcherElementName);
    if (!$fetcher) {
      throw new Error(`${fetcherElementName} element not found`);
    }
    // TODO: handle situation when href is not set
    $fetcher.renderURL(this.getAttribute("href"));
    event.preventDefault();
  };
}

customElements.define("html-fetcher-trigger", HTMLFetcherTrigger);
