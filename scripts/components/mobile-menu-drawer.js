class MobileMenuDrawer extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    [
      "onHamburgerClick",
      "onDocumentClickCapture",
      "onDocumentKeydown",
      "onMediaChange",
      "onHeaderResize",
      "onTabKey",
    ].forEach((m) => (this[m] = this[m].bind(this)));

    this.headerEl = document.querySelector(".header-section") || document.querySelector("header");
    this.panelStackEl = this.querySelector("panel-stack");
    this.hamburgerEl = document.querySelector("[data-action-toggle-mobile-menu]");
    this.mediaQuery = window.matchMedia("(min-width: 1024px)");
    this.headerObserver = new ResizeObserver(this.onHeaderResize);

    this.setAttribute("role", "dialog");
    this.setAttribute("aria-modal", "true");
    if (!this.hasAttribute("aria-label")) this.setAttribute("aria-label", "Menu");
    if (!this.hasAttribute("state")) this.setAttribute("state", "closed");
    this.setAttribute("aria-hidden", "true");

    document.addEventListener("click", this.onHamburgerClick);
  }

  disconnectedCallback() {
    document.removeEventListener("click", this.onHamburgerClick);
    document.removeEventListener("click", this.onDocumentClickCapture, true);
    document.removeEventListener("keydown", this.onDocumentKeydown);
    this.removeEventListener("keydown", this.onTabKey);
    this.mediaQuery.removeEventListener("change", this.onMediaChange);
    this.headerObserver.disconnect();
    clearTimeout(this.resetTimer);
  }

  onHamburgerClick(event) {
    const trigger = event.target.closest("[data-action-toggle-mobile-menu]");
    if (!trigger) return;
    event.preventDefault();
    this.toggle();
  }

  toggle() {
    if (this.getAttribute("state") === "open") this.close();
    else this.open();
  }

  open() {
    if (this.getAttribute("state") === "open") return;
    if (this.mediaQuery.matches) return;

    this.updateMenuTop();
    if (this.headerEl) this.headerObserver.observe(this.headerEl);

    this.applyInert(true);

    document.addEventListener("click", this.onDocumentClickCapture, true);
    document.addEventListener("keydown", this.onDocumentKeydown);
    this.addEventListener("keydown", this.onTabKey);
    this.mediaQuery.addEventListener("change", this.onMediaChange);

    this.lastFocused = document.activeElement;
    this.setAttribute("state", "open");
    this.setAttribute("aria-hidden", "false");

    if (this.hamburgerEl) {
      this.hamburgerEl.setAttribute("aria-expanded", "true");
      this.hamburgerEl.setAttribute("aria-label", "Close menu");
      this.hamburgerEl.classList.add("is-active");
    }

    requestAnimationFrame(() => this.focusFirst());
  }

  close() {
    if (this.getAttribute("state") === "closed") return;

    this.setAttribute("state", "closed");
    this.setAttribute("aria-hidden", "true");

    if (this.hamburgerEl) {
      this.hamburgerEl.setAttribute("aria-expanded", "false");
      this.hamburgerEl.setAttribute("aria-label", "Open menu");
      this.hamburgerEl.classList.remove("is-active");
    }

    this.applyInert(false);

    document.removeEventListener("click", this.onDocumentClickCapture, true);
    document.removeEventListener("keydown", this.onDocumentKeydown);
    this.removeEventListener("keydown", this.onTabKey);
    this.mediaQuery.removeEventListener("change", this.onMediaChange);
    this.headerObserver.disconnect();

    if (this.lastFocused && this.lastFocused.focus) {
      this.lastFocused.focus({ preventScroll: true });
    } else if (this.hamburgerEl) {
      this.hamburgerEl.focus({ preventScroll: true });
    }

    clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => {
      if (this.panelStackEl?.reset) this.panelStackEl.reset();
    }, 260);
  }

  updateMenuTop() {
    if (!this.headerEl) return;
    const bottom = this.headerEl.getBoundingClientRect().bottom;
    this.style.setProperty("--mobile-menu-top", `${Math.max(0, bottom)}px`);
  }

  onHeaderResize() {
    this.updateMenuTop();
  }

  applyInert(on) {
    const main =
      document.querySelector("main") ||
      document.querySelector("#MainContent") ||
      document.querySelector("[role='main']");
    const footer = document.querySelector("footer");
    [main, footer].forEach((el) => {
      if (!el) return;
      if (on) el.setAttribute("inert", "");
      else el.removeAttribute("inert");
    });
  }

  onDocumentClickCapture(event) {
    if (this.getAttribute("state") !== "open") return;
    if (this.contains(event.target)) return;
    if (event.target.closest("[data-action-toggle-mobile-menu]")) return;
    this.close();
  }

  onDocumentKeydown(event) {
    if (event.key !== "Escape") return;
    if (this.getAttribute("state") !== "open") return;
    this.close();
  }

  onMediaChange(event) {
    if (event.matches) this.close();
  }

  getFocusable() {
    const selector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    return Array.from(this.querySelectorAll(selector)).filter((el) => {
      if (el.closest("[inert]")) return false;
      if (el.offsetParent === null && el.getClientRects().length === 0) return false;
      return true;
    });
  }

  focusFirst() {
    const focusables = this.getFocusable();
    if (focusables.length > 0) focusables[0].focus({ preventScroll: true });
    else this.focus({ preventScroll: true });
  }

  onTabKey(event) {
    if (event.key !== "Tab") return;
    const focusables = this.getFocusable();
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }
}

customElements.define("mobile-menu-drawer", MobileMenuDrawer);
