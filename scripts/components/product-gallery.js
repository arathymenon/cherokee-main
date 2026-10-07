class ProductGallery extends HTMLElement {
  #carousel = null;
  #slideChangeHandler = null;
  #pendingVideoRAF = null;
  #thumbnailResizeObserver = null;
  #thumbnailScroller = null;
  #thumbnailScrollHandler = null;

  connectedCallback() {
    this.#carousel = this.querySelector("tarot-carousel");
    if (!this.#carousel) return;
    this.#init();
  }

  async #init() {
    await customElements.whenDefined("tarot-carousel");

    this.#bindThumbnails();
    this.#bindThumbnailScroller();

    this.#slideChangeHandler = this.#onSlideChange.bind(this);
    this.#carousel.on("render-index:changed", this.#slideChangeHandler);

    this.#handleVideoForSlide(0);
  }

  disconnectedCallback() {
    // Only unbind if the carousel is still in the DOM. When we're removed
    // together with it (e.g. a variant-change HTML swap), its own
    // disconnectedCallback tears down the emitter — possibly before ours
    // runs — and off() would throw on the destroyed instance.
    if (this.#carousel?.isConnected && this.#slideChangeHandler) {
      this.#carousel.off("render-index:changed", this.#slideChangeHandler);
    }
    if (this.#thumbnailResizeObserver) {
      this.#thumbnailResizeObserver.disconnect();
      this.#thumbnailResizeObserver = null;
    }
    if (this.#thumbnailScroller && this.#thumbnailScrollHandler) {
      this.#thumbnailScroller.removeEventListener("scroll", this.#thumbnailScrollHandler);
    }
  }

  #bindThumbnails() {
    const thumbnails = this.querySelectorAll("[data-product-gallery-thumbnail]");
    thumbnails.forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = parseInt(btn.getAttribute("data-product-gallery-thumbnail"), 10);
        this.#carousel.goToSlide(index);
      });
    });
  }

  #onSlideChange({ currentIndex, previousIndex }) {
    this.#updateActiveThumbnail(currentIndex);
    this.#pauseVideoForSlide(previousIndex);
    this.#handleVideoForSlide(currentIndex);
  }

  #updateActiveThumbnail(index) {
    const thumbnails = this.querySelectorAll("[data-product-gallery-thumbnail]");
    let activeThumbnail = null;

    thumbnails.forEach((btn) => {
      const btnIndex = parseInt(btn.getAttribute("data-product-gallery-thumbnail"), 10);
      const isActive = btnIndex === index;
      btn.setAttribute("aria-current", isActive ? "true" : "false");

      if (isActive) {
        activeThumbnail = btn;
      }
    });

    this.#scrollActiveThumbnailIntoView(activeThumbnail);
  }

  #scrollActiveThumbnailIntoView(btn) {
    const scroller = this.#thumbnailScroller;
    if (!scroller || !btn) return;

    const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    if (maxScroll <= 0) return;

    const scrollerRect = scroller.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const btnTop = btnRect.top - scrollerRect.top + scroller.scrollTop;
    const btnCenter = btnTop + btnRect.height / 2;
    const target = Math.max(0, Math.min(btnCenter - scroller.clientHeight / 2, maxScroll));

    if (Math.abs(scroller.scrollTop - target) < 1) return;

    scroller.scrollTo({ top: target, behavior: "smooth" });
  }

  #bindThumbnailScroller() {
    const list = this.querySelector("[data-product-gallery-thumbnails]");
    const scroller = list?.parentElement;
    const button = this.querySelector("[data-product-gallery-thumbnails-scroll]");
    if (!scroller) return;

    this.#thumbnailScroller = scroller;

    if (button) {
      button.addEventListener("click", () => {
        scroller.scrollBy({ top: scroller.clientHeight * 0.8, behavior: "smooth" });
      });

      const update = () => {
        const canScroll = scroller.scrollHeight > scroller.clientHeight + 1;
        const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
        button.toggleAttribute("data-show", canScroll && !atBottom);
      };
      update();
      this.#thumbnailScrollHandler = update;
      scroller.addEventListener("scroll", update, { passive: true });
      this.#thumbnailResizeObserver = new ResizeObserver(update);
      this.#thumbnailResizeObserver.observe(scroller);
    }
  }

  #getSlideElement(index) {
    const slides = this.#carousel.querySelectorAll("tarot-slide");
    return slides[index] || null;
  }

  #handleVideoForSlide(index) {
    const slide = this.#getSlideElement(index);
    if (!slide) return;

    const deferredMedia = slide.querySelector("deferred-media");
    if (!deferredMedia) return;

    // Auto-load deferred media if not already loaded
    const button = deferredMedia.querySelector("[data-deferred-media-button]");
    if (button && !deferredMedia.querySelector("video, iframe")) {
      button.click();
    }

    // Play video/iframe muted
    this.#pendingVideoRAF = requestAnimationFrame(() => {
      this.#pendingVideoRAF = null;

      const video = deferredMedia.querySelector("video");
      if (video) {
        this.#playHostedVideo(video);
        return;
      }

      const iframe = deferredMedia.querySelector("iframe");
      if (iframe) {
        const src = iframe.src || "";
        if (src.includes("youtube.com") || src.includes("youtube-nocookie.com")) {
          iframe.contentWindow?.postMessage(
            JSON.stringify({ event: "command", func: "playVideo" }),
            "*"
          );
        } else if (src.includes("vimeo.com")) {
          iframe.contentWindow?.postMessage(JSON.stringify({ method: "play" }), "*");
        }
      }
    });
  }

  #playHostedVideo(video) {
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.play().catch(() => {});
  }

  #pauseVideoForSlide(index) {
    if (index == null) return;

    if (this.#pendingVideoRAF) {
      cancelAnimationFrame(this.#pendingVideoRAF);
      this.#pendingVideoRAF = null;
    }

    const slide = this.#getSlideElement(index);
    if (!slide) return;

    const video = slide.querySelector("video");
    if (video) {
      video.pause();
    }

    const iframe = slide.querySelector("iframe");
    if (iframe) {
      const src = iframe.src || "";
      if (src.includes("youtube.com") || src.includes("youtube-nocookie.com")) {
        iframe.contentWindow?.postMessage(
          JSON.stringify({ event: "command", func: "pauseVideo" }),
          "*"
        );
      } else if (src.includes("vimeo.com")) {
        iframe.contentWindow?.postMessage(JSON.stringify({ method: "pause" }), "*");
      }
    }
  }
}

customElements.define("product-gallery", ProductGallery);
