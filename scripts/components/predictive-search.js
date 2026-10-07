import { debounce } from "../utilities/helpers";

class PredictiveSearch extends HTMLElement {
  #input;
  #resultsContainer;
  #statusEl;
  #abortController = null;

  connectedCallback() {
    this.#input = this.querySelector("[data-predictive-search-input]");
    this.#resultsContainer = this.querySelector("[data-predictive-search-results]");
    this.#statusEl = this.querySelector("[data-predictive-search-status]");

    if (!this.#input || !this.#resultsContainer) return;

    this.#input.addEventListener(
      "input",
      debounce(() => this.#onInput(), 300)
    );
  }

  #onInput() {
    const query = this.#input.value.trim();
    if (!query) {
      this.#abortController?.abort();
      this.#resultsContainer.innerHTML = "";
      return;
    }
    this.#fetchResults(query);
  }

  async #fetchResults(query) {
    this.#abortController?.abort();
    this.#abortController = new AbortController();

    const url = new URL(window.routes.predictive_search_url, window.location.origin);
    url.searchParams.set("q", query);
    // Intentionally omit resources[type] so the result types configured in the
    // Search & Discovery app are respected. Sending a type here would override them.
    url.searchParams.set("resources[limit]", "10");
    url.searchParams.set(
      "resources[options][fields]",
      "title,product_type,variants.title,vendor,tag,body"
    );
    url.searchParams.set("section_id", "sapi-predictive-search");

    try {
      const response = await fetch(url, {
        signal: this.#abortController.signal,
      });
      if (!response.ok) return;

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const newContent = doc.querySelector("#shopify-section-sapi-predictive-search");

      if (newContent) {
        this.#resultsContainer.innerHTML = newContent.innerHTML;
      }

      const liveRegion = doc.querySelector("[data-predictive-search-live-region-count-value]");
      if (liveRegion && this.#statusEl) {
        this.#statusEl.textContent = liveRegion.textContent;
      }
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }
}

customElements.define("predictive-search", PredictiveSearch);
