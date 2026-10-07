class OpenableComponent extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    [
      "onDocumentClick",
      "onDocumentKeydown",
      "onDialogClick",
      "onOpenableToggle",
      "onMouseEnter",
      "onMouseLeave",
    ].forEach((eventName) => {
      this[eventName] = this[eventName].bind(this);
    });

    this.closeOnOutsideClick = this.dataset.closeOnOutsideClick != undefined;
    this.closeOnOutsideClickMediaQuery =
      this.dataset.closeOnOutsideClick?.includes("(") && this.dataset.closeOnOutsideClick;
    this.closeOnEscapeKey = this.dataset.closeOnEscapeKey != undefined;
    this.openOnHover =
      this.dataset.openOnHover != undefined &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    this.openableEl = this.querySelector("[data-openable]");
    this.autofocusEl = this.querySelector("[autofocus]");

    if (this.closeOnOutsideClickMediaQuery) {
      if (!window.matchMedia(this.closeOnOutsideClickMediaQuery).matches) {
        this.closeOnOutsideClick = false;
      }
    }

    if (this.openableEl) {
      if (this.closeOnOutsideClick) {
        if (this.openableEl.tagName == "DIALOG") {
          this.openableEl.addEventListener("click", this.onDialogClick);
        } else {
          document.addEventListener("click", this.onDocumentClick);
          this.openableEl.addEventListener("toggle", this.onOpenableToggle);
        }
      }

      if (this.closeOnEscapeKey) {
        document.addEventListener("keydown", this.onDocumentKeydown);
      }

      if (this.openOnHover) {
        this.addEventListener("mouseenter", this.onMouseEnter);
        this.addEventListener("mouseleave", this.onMouseLeave);
      }
    }
  }

  disconnectedCallback() {
    if (this.openableEl) {
      document.removeEventListener("click", this.onDocumentClick);
      document.removeEventListener("keydown", this.onDocumentKeydown);
      this.openableEl.removeEventListener("click", this.onDialogClick);
      this.openableEl.removeEventListener("toggle", this.onOpenableToggle);
      this.removeEventListener("mouseenter", this.onMouseEnter);
      this.removeEventListener("mouseleave", this.onMouseLeave);
      clearTimeout(this.leaveTimer);
      clearTimeout(this.closingTimer);
    }
  }

  onMouseEnter() {
    clearTimeout(this.leaveTimer);
    this.open();
  }

  onMouseLeave() {
    clearTimeout(this.leaveTimer);
    this.leaveTimer = setTimeout(() => this.close(), 150);
  }

  open() {
    if (!this.openableEl) return;
    if (this.openableEl.tagName == "DIALOG") {
      if (!this.openableEl.open) this.openableEl.showModal();
    } else {
      clearTimeout(this.closingTimer);
      this.openableEl.classList.remove("closing");
      this.openableEl.open = true;
    }
  }

  onDocumentClick(event) {
    if (this.openableEl.open && !this.openableEl.contains(event.target)) {
      this.close();
    }
  }

  onDocumentKeydown(event) {
    if (this.openableEl.open && event.key == "Escape") {
      this.close();
    }
  }

  onDialogClick(event) {
    // Keyboard-activated clicks (Enter/Space on a button, arrow-key radio
    // selection) report clientX/clientY = 0 and detail = 0. The coordinate
    // check below would read that as an outside click and wrongly close the
    // dialog, so ignore anything that isn't a genuine pointer click.
    if (event.detail === 0) return;
    if (event.target.closest("[data-dont-close-dialog]")) return;
    if (this.openableEl.querySelector("dialog[open]")) return;
    let rect = this.openableEl.getBoundingClientRect();

    let clickedInDialog =
      rect.top <= event.clientY &&
      event.clientY <= rect.top + rect.height &&
      rect.left <= event.clientX &&
      event.clientX <= rect.left + rect.width;

    if (!clickedInDialog) {
      this.close();
    }
  }

  onOpenableToggle() {
    if (this.openableEl.open) {
      this.autofocus();
    }
  }

  autofocus() {
    if (this.autofocusEl) {
      this.autofocusEl.focus();
    }
  }

  close() {
    if (this.openableEl.tagName == "DIALOG") {
      this.openableEl.close();
    } else {
      const closeDelayMs = parseInt(this.dataset.closeDelayMs, 10);
      if (closeDelayMs > 0 && this.openableEl.open) {
        this.openableEl.classList.add("closing");
        clearTimeout(this.closingTimer);
        this.closingTimer = setTimeout(() => {
          this.openableEl.classList.remove("closing");
          this.openableEl.open = false;
        }, closeDelayMs);
      } else {
        this.openableEl.open = false;
      }
    }
  }
}

customElements.define("openable-component", OpenableComponent);
