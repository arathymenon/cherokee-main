class FilterShowMore extends HTMLElement {
  connectedCallback() {
    this.limit = parseInt(this.getAttribute("limit"), 10) || 10;
    this.button = this.querySelector("[data-action-show-more-toggle]");
    if (!this.button) return;

    this.itemsContainer = this;
    const directChildren = Array.from(this.children).filter((el) => el !== this.button);
    if (
      directChildren.length === 1 &&
      directChildren[0].tagName === "DIV" &&
      !directChildren[0].hasAttribute("data-facets-form-input")
    ) {
      this.itemsContainer = directChildren[0];
    }

    this.applyInitialHidden();

    if (!this.hasOverflow()) {
      this.button.hidden = true;
      this.getItems().forEach((item) => {
        item.style.display = "";
      });
      return;
    }

    this.isAnimating = false;
    this.button.addEventListener("click", () => {
      if (this.isAnimating) return;
      const willExpand = this.button.getAttribute("aria-expanded") !== "true";
      this.button.setAttribute("aria-expanded", String(willExpand));
      if (willExpand) {
        this.expand();
      } else {
        this.collapse();
      }
    });
  }

  getItems() {
    return Array.from(this.itemsContainer.children).filter((el) => el !== this.button);
  }

  hasOverflow() {
    let nonActive = 0;
    for (const item of this.getItems()) {
      if (item.querySelector("input:checked")) continue;
      nonActive++;
      if (nonActive > this.limit) return true;
    }
    return false;
  }

  applyInitialHidden() {
    let nonActive = 0;
    for (const item of this.getItems()) {
      if (item.querySelector("input:checked")) {
        item.style.display = "";
        continue;
      }
      nonActive++;
      item.style.display = nonActive > this.limit ? "none" : "";
    }
  }

  getItemsToHide() {
    const result = [];
    let nonActive = 0;
    for (const item of this.getItems()) {
      if (item.querySelector("input:checked")) continue;
      nonActive++;
      if (nonActive > this.limit && item.style.display !== "none") {
        result.push(item);
      }
    }
    return result;
  }

  getHiddenItems() {
    return this.getItems().filter((item) => item.style.display === "none");
  }

  async expand() {
    const hidden = this.getHiddenItems();
    if (hidden.length === 0) return;

    this.isAnimating = true;
    try {
      const startHeight = this.itemsContainer.offsetHeight;

      hidden.forEach((item) => {
        item.style.opacity = "0";
        item.style.display = "";
      });

      const endHeight = this.itemsContainer.offsetHeight;

      this.itemsContainer.style.overflow = "hidden";
      const heightAnim = this.itemsContainer.animate(
        { height: [`${startHeight}px`, `${endHeight}px`] },
        { duration: 400, easing: "ease-in-out" }
      );
      await heightAnim.finished;
      this.itemsContainer.style.overflow = "";
      this.itemsContainer.style.height = "";

      const fades = hidden.map((item) =>
        item.animate({ opacity: [0, 1] }, { duration: 250, easing: "ease", fill: "forwards" })
      );
      await Promise.all(fades.map((a) => a.finished));
      hidden.forEach((item, i) => {
        item.style.opacity = "";
        fades[i].cancel();
      });
    } finally {
      this.isAnimating = false;
    }
  }

  async collapse() {
    const toHide = this.getItemsToHide();
    if (toHide.length === 0) return;

    this.isAnimating = true;
    try {
      const fades = toHide.map((item) =>
        item.animate({ opacity: [1, 0] }, { duration: 250, easing: "ease", fill: "forwards" })
      );
      await Promise.all(fades.map((a) => a.finished));

      const startHeight = this.itemsContainer.offsetHeight;

      toHide.forEach((item, i) => {
        item.style.display = "none";
        fades[i].cancel();
        item.style.opacity = "";
      });

      const endHeight = this.itemsContainer.offsetHeight;

      this.itemsContainer.style.overflow = "hidden";
      const heightAnim = this.itemsContainer.animate(
        { height: [`${startHeight}px`, `${endHeight}px`] },
        { duration: 400, easing: "ease-in-out" }
      );
      await heightAnim.finished;
      this.itemsContainer.style.overflow = "";
      this.itemsContainer.style.height = "";
    } finally {
      this.isAnimating = false;
    }
  }
}

customElements.define("filter-show-more", FilterShowMore);
