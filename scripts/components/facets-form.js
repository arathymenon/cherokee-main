/**
 * <facets-form> Web Component
 *
 * Provides AJAX-powered collection filtering for Shopify. When a filter input
 * changes or a filter link is clicked, the component fetches updated section
 * HTML via Shopify's Section Rendering API and swaps the relevant content
 * areas — no full page reload required.
 *
 * Key behaviors:
 *   - Listens for `change` events on inputs marked with `data-facets-form-input`
 *     and auto-submits the form via AJAX.
 *   - Intercepts clicks on elements with `data-facets-form-link` to apply
 *     filter changes (e.g. "clear all" or tag links).
 *   - Caches responses to avoid redundant fetches for previously visited
 *     filter combinations.
 *   - Updates browser history via `pushState` and responds to `popstate`
 *     for back/forward navigation.
 *   - Toggles loading classes on elements with `data-facets-form-loading-class`
 *     and sets text inputs to read-only during fetches.
 *   - Falls back to a full page navigation if the AJAX request fails.
 *
 * Content swap targets are identified by `data-facets-form-content` attributes
 * with unique values, and must live inside Shopify sections.
 *
 * @example
 * <facets-form>
 *   <form>
 *     <input type="checkbox" name="filter.v.color" value="red" data-facets-form-input>
 *     <button type="submit">Apply</button>
 *   </form>
 * </facets-form>
 * <div data-facets-form-content="products">
 *   <!-- product grid replaced on filter change -->
 * </div>
 */
import { getShopifySection, toggleClassFromAttribute } from "../utilities/helpers";

const ELEMENT_NAME = "facets-form";

const attributes = {
  ajaxInput: `data-${ELEMENT_NAME}-input`,
  content: `data-${ELEMENT_NAME}-content`,
  link: `data-${ELEMENT_NAME}-link`,
  loadingClass: `data-${ELEMENT_NAME}-loading-class`,
  scroll: `data-${ELEMENT_NAME}-scroll`,
  toggleCheckbox: `#${ELEMENT_NAME}-toggle-checkbox`,
};

let responseCache = [];
let searchParamsInitial = window.location.search.slice(1);
let searchParamsPrev = window.location.search.slice(1);
let abortController;

window.addEventListener("popstate", (event) => {
  const searchParams = event.state ? event.state.searchParams : searchParamsInitial;
  if (searchParams === searchParamsPrev) return;
  facetsChangeHandler(searchParams, false);
});

document.addEventListener("click", (event) => {
  const $link = event.target.closest(`[${attributes.link}]`);
  if (!$link) return;
  const url = $link.href;
  if (!url) return;
  // Links flagged with `data-facets-form-scroll` (e.g. visual-nav cards above the
  // grid) scroll the results into view once the swap completes.
  const scrollToContent = $link.hasAttribute(attributes.scroll);
  facetsChangeHandler(new URL(url).searchParams.toString(), true, scrollToContent);
  event.preventDefault();
});

function facetsChangeHandler(searchParams, updateURLHash = true, scrollToContent = false) {
  try {
    if (abortController) {
      abortController.abort();
      abortController = undefined;
    }
    searchParamsPrev = searchParams;
    const sectionsMap = {};
    document.querySelectorAll(`[${attributes.content}]`).forEach(($content) => {
      const [sectionId] = getShopifySection($content);
      if (!sectionId)
        throw new Error(
          `[${ELEMENT_NAME}] [The "${attributes.content}" element must be within a Shopify section]`
        );
      sectionsMap[sectionId] = true;
    });

    const sections = Object.keys(sectionsMap);
    if (sections.length > 5) {
      throw new Error(
        `[${ELEMENT_NAME}] [The "${attributes.content}" elements exist in more than 5 sections]`
      );
    }

    const url = `${window.location.pathname}?sections=${sections.join(",")}&${searchParams}`;

    const cachedResponse = responseCache.find((item) => item.url === url);
    if (cachedResponse) {
      renderPage(cachedResponse.html);
      window.yotpoWidgetsContainer?.initWidgets?.();
      if (scrollToContent) scrollToResults();
    } else {
      abortController = new AbortController();
      toggleLoadingClasses(true);
      disableTextInputs(true);
      fetch(url, { signal: abortController.signal })
        .then((response) => response.json())
        .then((data) => {
          let html = "";
          for (let i in data) {
            html += data[i];
          }
          responseCache.push({ url, html });
          renderPage(html);
          window.yotpoWidgetsContainer?.initWidgets?.();
          if (scrollToContent) scrollToResults();
        })
        .catch((error) => {
          if (error.name !== "AbortError") {
            console.error(`[${ELEMENT_NAME}] [Section API request error]`, error);
            window.location.href = `?${searchParams}`;
          }
        })
        .finally(() => {
          disableTextInputs(false);
          toggleLoadingClasses(false);
        });
    }

    if (updateURLHash)
      history.pushState(
        { searchParams },
        "",
        `${window.location.pathname}${searchParams && "?".concat(searchParams)}`
      );
  } catch (e) {
    console.error(e);
    window.location.href = `?${searchParams}`;
  }
}

function disableTextInputs(disable) {
  document
    .querySelectorAll(
      `[${attributes.ajaxInput}][type="number"], [${attributes.ajaxInput}][type="text"]`
    )
    .forEach(($input) => {
      $input.readOnly = disable;
    });
}

function toggleLoadingClasses(on) {
  toggleClassFromAttribute(document, attributes.loadingClass, on);
}

function scrollToResults() {
  // Scroll the results wrapper (sticky filter bar + product grid) just below the
  // sticky header. The landing offset comes from the `scroll-mt-*` class on the
  // element, which reads the header height CSS var set on <body>.
  const $form = document.querySelector(ELEMENT_NAME);
  $form?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderPage(html) {
  const $receivedDocument = new DOMParser().parseFromString(html, "text/html");
  document.querySelectorAll(`[${attributes.content}]`).forEach(($content) => {
    const contentId = $content.getAttribute(attributes.content);
    if (!contentId)
      throw new Error(
        `[${ELEMENT_NAME}] [A "${attributes.content}" element doesn't have unique value]`
      );
    const $receivedContent = $receivedDocument.querySelector(
      `[${attributes.content}="${contentId}"]`
    );
    if (!$receivedContent) {
      throw new Error(
        `[${ELEMENT_NAME}] [A "${attributes.content}" element with "${contentId}" value isn't found in the section API response]`
      );
    }
    $content.innerHTML = $receivedContent.innerHTML;
  });
}

class FacetsForm extends HTMLElement {
  _$form;
  connectedCallback() {
    this._$form = this.querySelector("form");
    if (!this._$form) throw new Error(`[${ELEMENT_NAME}] [The "form" element isn't found]`);

    this._$form.addEventListener("submit", (event) => {
      event.preventDefault();
      this._ajaxSubmit();
      this._toggleFilterDrawer();
    });

    document.body.addEventListener("change", (event) => {
      if (event.target.form === this._$form && event.target.hasAttribute(attributes.ajaxInput)) {
        this._ajaxSubmit();
      }
    });
  }

  _ajaxSubmit() {
    const formData = new FormData(this._$form);
    let object = {};
    formData.forEach((value, key) => (object[key] = value));
    facetsChangeHandler(new URLSearchParams(formData).toString());
  }

  _toggleFilterDrawer() {
    const filterDrawer = document.querySelector(attributes.toggleCheckbox);
    if (filterDrawer) {
      filterDrawer.checked = !filterDrawer.checked;
    }
  }
}

customElements.define(ELEMENT_NAME, FacetsForm);
