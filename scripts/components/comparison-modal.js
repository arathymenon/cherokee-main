/**
 * <comparison-modal> — product comparison table modal (Phase 2).
 *
 * Rendered once per compare-enabled collection page (snippets/comparison-modal.liquid).
 * Listens on `document` for the bubbling `compare:open` event from <compare-bar>,
 * then for each selected product fetches a column (the `comparison-table-column`
 * section) via the Section Rendering API and assembles a comparison table.
 *
 * Layout: an image grid, a sticky info grid (brand/title/price), and a body grid
 * (attribute banners, value rows, footer actions) stack in one vertically-scrolling
 * pane and share one horizontal scroll position — the mobile prev/next arrows page
 * the columns. The info grid stays pinned (sticky) while the images scroll away.
 * Cells are placed by explicit grid-column/grid-row, so fetch order never matters.
 *
 * Stale-while-revalidate: paints instantly from the prefetch cache (warmed by
 * <compare-bar>), opens the dialog, then refetches every column fresh and repaints.
 *
 * Removing a column updates the shared CompareStore and dispatches `compare:changed`
 * so the PLP drawer + checkboxes stay in sync. Below 2 products, the modal closes.
 */
import { CompareStore } from "../utilities/compare-store.js";
import { get, fetchFresh, drop } from "../utilities/comparison-prefetch.js";

class ComparisonModal extends HTMLElement {
  #store = null;
  #collectionHandle = "";
  #max = 4;
  #items = [];
  #cells = new Map(); // handle -> parsed [data-compare-cell] nodes

  #dialog = null;
  #images = null;
  #imageGrid = null;
  #headers = null;
  #headerGrid = null;
  #scroll = null;
  #grid = null;
  #nav = null;
  #prev = null;
  #next = null;
  #loading = null;
  #error = null;
  #bannerTemplate = null;
  #skeletonTemplates = null;
  #scrollRaf = 0;

  connectedCallback() {
    this.#dialog = this.querySelector("[data-comparison-dialog]");
    this.#images = this.querySelector("[data-comparison-images]");
    this.#imageGrid = this.querySelector("[data-comparison-image-grid]");
    this.#headers = this.querySelector("[data-comparison-headers]");
    this.#headerGrid = this.querySelector("[data-comparison-header-grid]");
    this.#scroll = this.querySelector("[data-comparison-scroll]");
    this.#grid = this.querySelector("[data-comparison-grid]");
    this.#nav = this.querySelector("[data-comparison-nav]");
    this.#prev = this.querySelector("[data-comparison-prev]");
    this.#next = this.querySelector("[data-comparison-next]");
    this.#loading = this.querySelector("[data-comparison-loading]");
    this.#error = this.querySelector("[data-comparison-error]");
    this.#bannerTemplate = this.querySelector("[data-comparison-banner-template]");
    this.#skeletonTemplates = {
      image: this.querySelector("[data-comparison-skeleton-image]"),
      header: this.querySelector("[data-comparison-skeleton-header]"),
      value: this.querySelector("[data-comparison-skeleton-value]"),
    };

    this.#collectionHandle = this.dataset.collectionHandle || "";
    this.#max = parseInt(this.dataset.compareMax, 10) || 4;
    this.#store = new CompareStore(this.#collectionHandle, this.#max);

    document.addEventListener("compare:open", this.#onOpen);
    this.#grid.addEventListener("click", this.#onGridClick);
    this.#scroll.addEventListener("scroll", this.#onScroll);
    // scrollend fires once the (snap/smooth) scroll settles — authoritative for the
    // prev/next disabled state. The per-frame update in #onScroll covers browsers
    // without scrollend support.
    this.#scroll.addEventListener("scrollend", this.#updateNavDisabled);
    this.#prev?.addEventListener("click", this.#onPrev);
    this.#next?.addEventListener("click", this.#onNext);
    this.#dialog?.addEventListener("click", this.#onDialogClick);
  }

  disconnectedCallback() {
    document.removeEventListener("compare:open", this.#onOpen);
    this.#grid?.removeEventListener("click", this.#onGridClick);
    this.#scroll?.removeEventListener("scroll", this.#onScroll);
    this.#scroll?.removeEventListener("scrollend", this.#updateNavDisabled);
    this.#prev?.removeEventListener("click", this.#onPrev);
    this.#next?.removeEventListener("click", this.#onNext);
    this.#dialog?.removeEventListener("click", this.#onDialogClick);
    if (this.#scrollRaf) cancelAnimationFrame(this.#scrollRaf);
  }

  // ---- Open + stale-while-revalidate ----------------------------------------

  #onOpen = async (event) => {
    const raw = event.detail && event.detail.items;
    if (!Array.isArray(raw)) return;

    const items = this.#dedupe(raw).slice(0, this.#max);
    if (items.length < 2) return;
    this.#items = items;

    // Instant paint from the prefetch cache.
    this.#cells = new Map();
    let anyCached = false;
    items.forEach((item) => {
      const html = get(item.handle);
      if (html) {
        this.#cells.set(item.handle, this.#parse(html));
        anyCached = true;
      }
    });

    if (anyCached) this.#renderGrid(items);
    else this.#showLoading();
    this.#open();

    // Revalidate with fresh data.
    await this.#revalidate(items);
  };

  async #revalidate(items) {
    const results = await Promise.allSettled(items.map((item) => fetchFresh(item.handle)));
    results.forEach((result, i) => {
      if (result.status === "fulfilled") {
        this.#cells.set(items[i].handle, this.#parse(result.value));
      }
    });

    const survivors = items.filter((item) => (this.#cells.get(item.handle) || []).length > 0);
    if (survivors.length < 2) {
      this.#showError();
      return;
    }
    this.#items = survivors;
    this.#renderGrid(survivors);
  }

  #dedupe(items) {
    const seen = new Set();
    return items.filter((item) => {
      if (!item || !item.handle || seen.has(item.handle)) return false;
      seen.add(item.handle);
      return true;
    });
  }

  #parse(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return Array.from(doc.querySelectorAll("[data-compare-cell]"));
  }

  // ---- Grid assembly --------------------------------------------------------

  /**
   * Ordered value rows — the UNION across products: a row shows if AT LEAST ONE
   * product has the key (products that lack it get a "——" cell). Hidden only when
   * no product has any value. Options come first (Size, Color, then rest), then
   * attributes in their canonical section order (data-order).
   */
  #rowOrder(items) {
    const loaded = items.filter((item) => (this.#cells.get(item.handle) || []).length > 0);
    if (loaded.length === 0) return [];

    const map = new Map(); // key -> { key, label, group, order, seq, hasValue }
    let seq = 0;
    loaded.forEach((item) => {
      this.#cells.get(item.handle).forEach((node) => {
        const { group, key, label, order, empty } = node.dataset;
        if (group === "header" || group === "footer" || group === "image") return;
        let entry = map.get(key);
        if (!entry) {
          entry = {
            key,
            label: label || "",
            group,
            order: parseInt(order, 10) || 0,
            seq: seq++,
            hasValue: false,
          };
          map.set(key, entry);
        }
        if (empty !== "true") entry.hasValue = true;
      });
    });

    // Show a row if any product has a value; hide rows that are blank everywhere.
    const rows = [...map.values()].filter((row) => row.hasValue);
    const options = rows
      .filter((row) => row.group === "option")
      .sort((a, b) => this.#optionRank(a.key) - this.#optionRank(b.key) || a.seq - b.seq);
    const attributes = rows
      .filter((row) => row.group === "attribute")
      .sort((a, b) => a.order - b.order || a.seq - b.seq);
    return [...options, ...attributes];
  }

  #optionRank(key) {
    if (key === "option:size") return 0;
    if (key === "option:color") return 1;
    return 2;
  }

  #renderGrid(items) {
    this.#hideStates();
    this.#imageGrid.replaceChildren();
    this.#headerGrid.replaceChildren();
    this.#grid.replaceChildren();
    this.#imageGrid.style.setProperty("--cols", String(items.length));
    this.#headerGrid.style.setProperty("--cols", String(items.length));
    this.#grid.style.setProperty("--cols", String(items.length));

    const order = this.#rowOrder(items);
    const footerRow = order.length * 2 + 1;

    items.forEach((item, c) => {
      const column = c + 1;
      const cells = this.#cells.get(item.handle);

      if (!cells) {
        this.#place(this.#imageGrid, this.#skeleton("image"), column, 1);
        this.#place(this.#headerGrid, this.#skeleton("header"), column, 1);
        order.forEach((_, i) =>
          this.#place(this.#grid, this.#skeleton("value"), column, 2 + i * 2)
        );
        this.#place(this.#grid, this.#skeleton("value"), column, footerRow);
        return;
      }

      const byKey = new Map(cells.map((node) => [node.dataset.key, node]));

      const image = byKey.get("image");
      this.#place(this.#imageGrid, image ? this.#clone(image) : this.#skeleton("image"), column, 1);

      const header = byKey.get("header");
      this.#place(
        this.#headerGrid,
        header ? this.#clone(header) : this.#skeleton("header"),
        column,
        1
      );
      order.forEach((row, i) => {
        const node = byKey.get(row.key);
        // Blank values already render "——" in Liquid; an absent cell (e.g. an
        // option a product doesn't have) just leaves that grid slot empty.
        if (node) this.#place(this.#grid, this.#clone(node), column, 2 + i * 2);
      });
      const footer = byKey.get("footer");
      if (footer) this.#place(this.#grid, this.#clone(footer), column, footerRow);
    });

    order.forEach((row, i) => this.#grid.appendChild(this.#banner(row.label, 1 + i * 2)));

    this.#updateNav(items.length);
  }

  #place(grid, el, column, row) {
    el.style.gridColumn = String(column);
    el.style.gridRow = String(row);
    grid.appendChild(el);
  }

  #clone(node) {
    return document.importNode(node, true);
  }

  #banner(label, row) {
    const banner = this.#clone(this.#bannerTemplate.content.firstElementChild);
    banner.style.gridColumn = "1 / -1";
    banner.style.gridRow = String(row);
    banner.querySelector("[data-comparison-banner-label]").innerHTML = label;
    return banner;
  }

  #skeleton(kind) {
    const template = this.#skeletonTemplates[kind] || this.#skeletonTemplates.value;
    return this.#clone(template.content.firstElementChild);
  }

  // ---- Navigation (mobile column paging) ------------------------------------

  #colWidth() {
    const first = this.#headerGrid.firstElementChild;
    const style = getComputedStyle(this.#headerGrid);
    const gap = parseFloat(style.columnGap) || 0;
    const width = first ? first.getBoundingClientRect().width : this.#scroll.clientWidth / 2;
    return width + gap;
  }

  #onPrev = () => this.#scroll.scrollBy({ left: -this.#colWidth(), behavior: "smooth" });
  #onNext = () => this.#scroll.scrollBy({ left: this.#colWidth(), behavior: "smooth" });

  /** Keep the image + info rows in lockstep with the body's horizontal scroll. */
  #onScroll = () => {
    if (this.#scrollRaf) return;
    this.#scrollRaf = requestAnimationFrame(() => {
      this.#scrollRaf = 0;
      const x = this.#scroll.scrollLeft;
      if (this.#images) this.#images.scrollLeft = x;
      if (this.#headers) this.#headers.scrollLeft = x;
      this.#updateNavDisabled();
    });
  };

  #updateNav(cols) {
    if (this.#nav) this.#nav.classList.toggle("hidden", cols <= 2);
    this.#updateNavDisabled();
  }

  #updateNavDisabled = () => {
    if (!this.#prev || !this.#next) return;
    const max = this.#scroll.scrollWidth - this.#scroll.clientWidth;
    this.#prev.disabled = this.#scroll.scrollLeft <= 1;
    this.#next.disabled = this.#scroll.scrollLeft >= max - 1;
  };

  // ---- Remove + view --------------------------------------------------------

  #onGridClick = (event) => {
    const removeBtn = event.target.closest("[data-compare-remove]");
    if (removeBtn) {
      event.preventDefault();
      this.#removeColumn(removeBtn.dataset.handle);
    }
    // [data-compare-view] is a plain link — let it navigate.
  };

  #removeColumn(handle) {
    if (!handle) return;
    this.#store.remove(handle);
    drop(handle);
    this.#cells.delete(handle);
    this.#items = this.#items.filter((item) => item.handle !== handle);

    document.dispatchEvent(
      new CustomEvent("compare:changed", {
        bubbles: true,
        detail: { collectionHandle: this.#collectionHandle },
      })
    );

    if (this.#items.length < 2) {
      this.#close();
      return;
    }
    this.#renderGrid(this.#items);
  }

  // ---- Dialog ---------------------------------------------------------------

  #open() {
    if (this.#dialog && !this.#dialog.open) this.#dialog.showModal();
  }

  #close() {
    this.#dialog?.close();
  }

  #onDialogClick = (event) => {
    if (event.target !== this.#dialog) return; // ignore clicks on inner content
    const rect = this.#dialog.getBoundingClientRect();
    const inside =
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width;
    if (!inside) this.#close();
  };

  // ---- State toggles --------------------------------------------------------

  #hideStates() {
    this.#loading?.classList.add("hidden");
    this.#error?.classList.add("hidden");
    this.#images?.classList.remove("hidden");
    this.#headers?.classList.remove("hidden");
    this.#scroll?.classList.remove("hidden");
  }

  #showLoading() {
    this.#images?.classList.add("hidden");
    this.#headers?.classList.add("hidden");
    this.#scroll?.classList.add("hidden");
    this.#nav?.classList.add("hidden");
    this.#error?.classList.add("hidden");
    this.#loading?.classList.remove("hidden");
  }

  #showError() {
    this.#images?.classList.add("hidden");
    this.#headers?.classList.add("hidden");
    this.#scroll?.classList.add("hidden");
    this.#nav?.classList.add("hidden");
    this.#loading?.classList.add("hidden");
    this.#error?.classList.remove("hidden");
  }
}

customElements.define("comparison-modal", ComparisonModal);
