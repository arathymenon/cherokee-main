import ScrollTrigger from "@magic-spells/scroll-trigger";

class FaqContent extends HTMLElement {
  connectedCallback() {
    this.headings = Array.from(this.querySelectorAll("[data-faq-heading]"));
    if (!this.headings.length) return;

    this.navButtons = Array.from(this.querySelectorAll("[data-faq-nav-target]"));
    this.currentLabel = this.querySelector("[data-faq-nav-current]");
    this.mobileDetails = this.querySelector("openable-component details[data-openable]");

    this.trigger = new ScrollTrigger({
      sections: this.headings,
      offset: "50%",
      onIndexChange: ({ currentIndex }) => this.syncActive(currentIndex),
    });

    this.navButtons.forEach((btn) => {
      btn.addEventListener("click", () => this.onNavClick(btn));
    });

    this.syncActive(this.trigger.getCurrentIndex());
  }

  disconnectedCallback() {
    this.trigger?.destroy();
  }

  syncActive(index) {
    const activeHeading = this.headings[index] || this.headings[0];
    const activeId = activeHeading?.id;
    this.navButtons.forEach((btn) => {
      if (btn.dataset.faqNavTarget === activeId) {
        btn.setAttribute("aria-current", "location");
      } else {
        btn.removeAttribute("aria-current");
      }
    });
    if (this.currentLabel && activeHeading) {
      this.currentLabel.textContent = activeHeading.textContent.trim();
    }
  }

  onNavClick(btn) {
    const target = document.getElementById(btn.dataset.faqNavTarget);
    if (!target) return;
    this.trigger.scrollToElement(target, { behavior: "smooth" });
    if (this.mobileDetails?.open) this.mobileDetails.open = false;
  }
}

customElements.define("faq-content", FaqContent);
