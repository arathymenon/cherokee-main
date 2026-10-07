/**
 * <pagination-link> Web Component
 *
 * Provides AJAX-powered pagination for Shopify sections. When a user clicks
 * the contained <a> link, the component fetches the target page's section
 * HTML via Shopify's Section Rendering API and swaps it into the current
 * page without a full reload.
 *
 * Pagination modes (set via `data-pagination-link-mode`):
 *   - "replace" (default) — replaces container content entirely.
 *   - "append"  — appends new content to the end (infinite scroll / load more).
 *   - "prepend" — prepends content to the beginning (load previous).
 *
 * Container types (set via `data-ajax-pagination` on target elements):
 *   - "content"   — the main content area (products, articles, etc.).
 *   - "load_more" — the "load more" button container (replaced on append).
 *   - "load_prev" — the "load previous" button container (replaced on prepend).
 *
 * Loading state:
 *   Elements with `data-ajax-pagination-loading="className"` will have that
 *   class toggled during fetches (useful for spinners / disabled states).
 *
 * Browser history is updated via `pushState` for replace and append modes.
 *
 * @example
 * <div data-ajax-pagination="content">
 *   <!-- product grid -->
 * </div>
 * <div data-ajax-pagination="load_more">
 *   <pagination-link data-pagination-link-mode="append">
 *     <a href="?page=2">Load More</a>
 *   </pagination-link>
 * </div>
 */
const containerAttr = "data-ajax-pagination";
const modeAttr = "data-pagination-link-mode";
const shopifySectionPrefix = "shopify-section-";
let isLoading = false;
const LOAD_MORE_CONTAINER_TYPE = "load_more";
const LOAD_PREV_CONTAINER_TYPE = "load_prev";
const CONTENT_CONTAINER_TYPE = "content";

class PaginationLink extends HTMLElement {
  constructor() {
    super();
    const paginationLink = this.querySelector("a");
    paginationLink.setAttribute("role", "button");
    paginationLink.addEventListener("click", this.clickHandler.bind(this));
  }

  clickHandler(event) {
    event.preventDefault();
    if (isLoading) return;
    const mode = this.getAttribute(modeAttr) || "replace";
    const requestURL = new URL(event.target.href, window.location.origin);
    const sections = PaginationLink.getSections();
    event.target.removeAttribute("href");
    if (mode !== "prepend") {
      window.history.pushState(Object.fromEntries(requestURL.searchParams), "", requestURL.href);
    }
    requestURL.search = requestURL.search + `&sections=${sections.join(",")}`;
    PaginationLink.fetchSections(requestURL, mode);
  }

  static getSections() {
    const sections = [];

    document.querySelectorAll(`[${containerAttr}]`).forEach((element) => {
      const sectionElement = element.closest(`[id^="${shopifySectionPrefix}"]`);
      if (!sectionElement) throw "Pagination item must be inside a section";
      const sectionId = sectionElement.id.replace(shopifySectionPrefix, "");
      if (!sections.includes(sectionId)) {
        sections.push(sectionId);
      }
    });

    return sections;
  }

  static fetchSections(url, mode) {
    PaginationLink.toggleLoading(true);
    fetch(url)
      .then((response) => response.json())
      .then((data) => {
        let html = "";
        for (let i in data) {
          html += data[i];
        }
        PaginationLink.renderPage(html, mode);
        window.yotpoWidgetsContainer?.initWidgets?.();
      })
      .finally(() => {
        PaginationLink.toggleLoading(false);
      });
  }

  static renderPage(html, mode = "replace") {
    const receivedDOM = new DOMParser().parseFromString(html, "text/html");
    document.querySelectorAll(`[${containerAttr}]`).forEach((container) => {
      const containerType = container.getAttribute(containerAttr);
      if (!containerType) return;
      const receivedContainer = receivedDOM.querySelector(`[${containerAttr}="${containerType}"]`);
      if (!receivedContainer) return;

      if (
        (mode === "append" && containerType === LOAD_MORE_CONTAINER_TYPE) ||
        (mode === "prepend" && containerType === LOAD_PREV_CONTAINER_TYPE) ||
        mode === "replace"
      ) {
        container.innerHTML = receivedContainer.innerHTML;
        return;
      }

      if (containerType === CONTENT_CONTAINER_TYPE) {
        container.insertAdjacentHTML(
          mode === "append" ? "beforeEnd" : "afterBegin",
          receivedContainer.innerHTML
        );
      }
    });
  }

  static toggleLoading(on) {
    isLoading = on;
    const loadingClassAttribute = "data-ajax-pagination-loading";
    document.querySelectorAll(`[${loadingClassAttribute}]`).forEach((element) => {
      const loadingClass = element.getAttribute(loadingClassAttribute);
      if (!loadingClass) return;
      if (on) {
        element.classList.add(loadingClass);
      } else {
        element.classList.remove(loadingClass);
      }
    });
  }
}

customElements.define("pagination-link", PaginationLink);
