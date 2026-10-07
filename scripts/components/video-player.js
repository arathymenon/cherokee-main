if (!customElements.get("video-player")) {
  class VideoPlayer extends HTMLElement {
    #currentSrc = null;
    #resizeRaf = 0;
    #boundResize = null;

    connectedCallback() {
      this.overlay = this.querySelector("[data-video-overlay]");
      this.video = this.querySelector("video");

      if (this.overlay && this.video) {
        this.overlay.addEventListener("click", () => this.#play(), {
          once: true,
        });
      }
    }

    disconnectedCallback() {
      this.#detachResize();
    }

    #play() {
      this.#updateSource();
      this.#attachResize();

      this.overlay.style.opacity = "0";
      this.overlay.style.pointerEvents = "none";
    }

    #updateSource() {
      const breakpoint = parseInt(this.getAttribute("breakpoint") || "1024");
      const desktopSrc = this.getAttribute("desktop-src");
      const mobileSrc = this.getAttribute("mobile-src");

      const src =
        window.innerWidth >= breakpoint ? desktopSrc || mobileSrc : mobileSrc || desktopSrc;

      if (!src || src === this.#currentSrc) return;

      this.#currentSrc = src;
      this.video.src = src;
      this.video.play();
    }

    #attachResize() {
      if (this.#boundResize) return;

      this.#boundResize = () => {
        if (this.#resizeRaf) return;
        this.#resizeRaf = requestAnimationFrame(() => {
          this.#resizeRaf = 0;
          this.#updateSource();
        });
      };

      window.addEventListener("resize", this.#boundResize, { passive: true });
    }

    #detachResize() {
      if (this.#boundResize) {
        window.removeEventListener("resize", this.#boundResize);
      }
      if (this.#resizeRaf) {
        cancelAnimationFrame(this.#resizeRaf);
        this.#resizeRaf = 0;
      }
      this.#boundResize = null;
    }
  }

  customElements.define("video-player", VideoPlayer);
}
