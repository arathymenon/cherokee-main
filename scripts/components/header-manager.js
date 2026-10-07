// Header context manager: maintains header/announcement height CSS vars,
// the mobile reveal (hide-on-scroll-down) behavior, and a single
// body[data-state] signal ("top" | "scrolling" | "mobile-menu") consumed
// by sections that restyle the header (e.g. transparent-over-hero).

const TOP_THRESHOLD = 8; // px from the very top still considered "top"
const REVEAL = 100; // px before the mobile reveal starts hiding
const DELTA = 5; // min scroll delta (px) to act on, prevents jitter

class HeaderManager extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    [
      "onScroll",
      "onResize",
      "onFrame",
      "onMediaChange",
      "onMutation",
      "updateState",
      "onBreakpointMount",
    ].forEach((m) => (this[m] = this[m].bind(this)));

    this.announcementEl = document.querySelector(".announcement-bar");
    this.headerEl = document.querySelector(".header-section");
    this.body = document.body;

    this.mq = window.matchMedia("(max-width: 1023.98px)");
    this.mq.addEventListener("change", this.onMediaChange);

    this.lastY = window.scrollY;
    this.hidden = false;
    this.ticking = false;
    this.state = null;
    this.resizeTimer = null;
    this.drawerObserver = null;

    // Height vars are maintained at ALL breakpoints (desktop included),
    // so other sections can offset against the header on any viewport.
    this.resizeObserver = new ResizeObserver(() => this.updateHeights());
    if (this.announcementEl) this.resizeObserver.observe(this.announcementEl);
    if (this.headerEl) this.resizeObserver.observe(this.headerEl);
    window.addEventListener("resize", this.onResize, { passive: true });
    this.updateHeights();

    // Scroll listener + drawer observer run at ALL breakpoints because
    // data-state must stay accurate everywhere. The mobile reveal logic
    // inside onFrame() is what's gated to mobile, not the listener.
    window.addEventListener("scroll", this.onScroll, { passive: true });
    document.addEventListener("breakpoint-content:mounted", this.onBreakpointMount);
    this.bindDrawer();

    // Set the initial state before paint (this file is in the preload
    // bundle), so transparent-header pages don't flash.
    this.updateState();
  }

  disconnectedCallback() {
    window.removeEventListener("scroll", this.onScroll);
    document.removeEventListener("breakpoint-content:mounted", this.onBreakpointMount);
    this.drawerObserver?.disconnect();
    this.resizeObserver.disconnect();
    window.removeEventListener("resize", this.onResize);
    clearTimeout(this.resizeTimer);
    this.mq.removeEventListener("change", this.onMediaChange);

    this.body.removeAttribute("data-state");
    this.body.removeAttribute("data-header-hidden");
    this.body.style.removeProperty("--announcement-bar-height");
    this.body.style.removeProperty("--header-height");
    this.body.style.removeProperty("--header-group-height");
  }

  bindDrawer() {
    this.drawerObserver?.disconnect();
    this.drawerEl = document.querySelector("mobile-menu-drawer");
    if (!this.drawerEl) return;
    this.drawerObserver = new MutationObserver(this.onMutation);
    this.drawerObserver.observe(this.drawerEl, {
      attributes: true,
      attributeFilter: ["state"],
    });
  }

  onBreakpointMount(event) {
    if (
      event.target?.querySelector?.("mobile-menu-drawer") ||
      event.target?.localName === "mobile-menu-drawer"
    ) {
      this.bindDrawer();
      this.updateState();
    }
  }

  onMediaChange(event) {
    if (event.matches) {
      // Entering mobile: resume reveal from the current position.
      this.lastY = window.scrollY;
    } else {
      // Desktop is never left in a hidden state.
      this.hidden = false;
      this.body.removeAttribute("data-header-hidden");
    }
    // Drawer may have just been remounted by <breakpoint-content>.
    requestAnimationFrame(() => {
      this.bindDrawer();
      this.updateState();
    });
  }

  updateHeights() {
    const annH = this.announcementEl
      ? Math.round(this.announcementEl.getBoundingClientRect().height)
      : 0;
    const hdrH = this.headerEl ? Math.round(this.headerEl.getBoundingClientRect().height) : 0;
    this.body.style.setProperty("--announcement-bar-height", `${annH}px`);
    this.body.style.setProperty("--header-height", `${hdrH}px`);
    this.body.style.setProperty("--header-group-height", `${annH + hdrH}px`);
  }

  onResize() {
    clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => this.updateHeights(), 30);
  }

  onScroll() {
    if (this.ticking) return;
    this.ticking = true;
    requestAnimationFrame(this.onFrame);
  }

  isMenuOpen() {
    return this.drawerEl?.getAttribute("state") === "open";
  }

  isLocked() {
    if (this.isMenuOpen()) return true;
    if (document.querySelector("dialog[open]")) return true;
    return false;
  }

  updateState() {
    let next;
    if (this.isMenuOpen()) next = "mobile-menu";
    else if (window.scrollY <= TOP_THRESHOLD) next = "top";
    else next = "scrolling";

    if (this.state === next) return;
    this.state = next;
    this.body.setAttribute("data-state", next);
  }

  show() {
    if (!this.hidden) return;
    this.hidden = false;
    this.body.removeAttribute("data-header-hidden");
  }

  hide() {
    if (this.hidden) return;
    this.hidden = true;
    this.body.setAttribute("data-header-hidden", "true");
  }

  onFrame() {
    this.ticking = false;
    const y = window.scrollY;

    // Scroll-position state — all breakpoints.
    this.updateState();

    // Mobile reveal (hide-on-scroll-down) — mobile only.
    if (!this.mq.matches) {
      this.lastY = y;
      return;
    }

    // Stay visible through the top of the hero; only start hiding after
    // the reveal threshold. Two states only — CSS animates the rest.
    if (this.isLocked() || y <= REVEAL) {
      this.show();
      this.lastY = y;
      return;
    }

    const diff = y - this.lastY;
    if (Math.abs(diff) < DELTA) return;

    if (diff > 0) this.hide();
    else this.show();

    this.lastY = y;
  }

  onMutation() {
    this.updateState();

    if (!this.mq.matches) return;
    if (this.isLocked()) {
      this.show();
    } else {
      this.lastY = window.scrollY;
    }
  }
}

customElements.define("header-manager", HeaderManager);
