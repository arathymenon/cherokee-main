class ZoomGallery extends HTMLElement {
  #mainCarousel = null;
  #zoomClickHandler = null;
  #zoomChangeHandler = null;
  #zoomSlideChangeHandler = null;
  #zoomMovementCompleteHandler = null;
  #zoomDialogCloseHandler = null;
  #zoomDialog = null;
  #zoomCarousel = null;
  #ignoreZoomChange = false;
  #pendingZoomDraggableSync = false;

  connectedCallback() {
    this.#init();
  }

  disconnectedCallback() {
    this.#destroy();
  }

  async #init() {
    await customElements.whenDefined("tarot-carousel");
    if (!this.isConnected) return;

    const sourceSelector = this.getAttribute("source-selector");
    this.#mainCarousel = this.#findMainCarousel(sourceSelector);
    this.#zoomDialog = this.querySelector("[data-product-zoom-dialog]");
    this.#zoomCarousel = this.querySelector("[data-product-zoom-carousel]");
    if (!this.#mainCarousel || !this.#zoomDialog || !this.#zoomCarousel) return;

    this.#bind();
  }

  #destroy() {
    // Only unbind from carousels still in the DOM. When we're removed
    // together with them (e.g. a variant-change HTML swap), their own
    // disconnectedCallback tears down the emitter — possibly before ours
    // runs — and off() would throw on the destroyed instance.
    if (this.#mainCarousel?.isConnected && this.#zoomClickHandler) {
      this.#mainCarousel.off("slides:click", this.#zoomClickHandler);
    }
    if (this.#zoomCarousel?.isConnected && this.#zoomSlideChangeHandler) {
      this.#zoomCarousel.off("render-index:changed", this.#zoomSlideChangeHandler);
    }
    if (this.#zoomCarousel?.isConnected && this.#zoomMovementCompleteHandler) {
      this.#zoomCarousel.off("movement:completed", this.#zoomMovementCompleteHandler);
    }
    if (this.#zoomChangeHandler) {
      this.removeEventListener("image-zoom:zoomend", this.#zoomChangeHandler);
    }
    if (this.#zoomDialog && this.#zoomDialogCloseHandler) {
      this.#zoomDialog.removeEventListener("close", this.#zoomDialogCloseHandler);
    }

    this.#mainCarousel = null;
    this.#zoomDialog = null;
    this.#zoomCarousel = null;
    this.#zoomClickHandler = null;
    this.#zoomChangeHandler = null;
    this.#zoomSlideChangeHandler = null;
    this.#zoomMovementCompleteHandler = null;
    this.#zoomDialogCloseHandler = null;
    this.#ignoreZoomChange = false;
    this.#pendingZoomDraggableSync = false;
  }

  #findMainCarousel(sourceSelector) {
    if (sourceSelector) {
      const scopedMatch = this.parentElement?.querySelector(sourceSelector);
      if (scopedMatch) return scopedMatch;

      return document.querySelector(sourceSelector);
    }

    return (
      this.parentElement?.querySelector("tarot-carousel:not([data-product-zoom-carousel])") ||
      document.querySelector("tarot-carousel:not([data-product-zoom-carousel])")
    );
  }

  #bind() {
    this.#zoomClickHandler = this.#onZoomClick.bind(this);
    this.#mainCarousel.on("slides:click", this.#zoomClickHandler);

    this.#zoomChangeHandler = this.#onZoomChange.bind(this);
    this.addEventListener("image-zoom:zoomend", this.#zoomChangeHandler);

    this.#zoomSlideChangeHandler = this.#onZoomSlideChange.bind(this);
    this.#zoomCarousel.on("render-index:changed", this.#zoomSlideChangeHandler);

    this.#zoomMovementCompleteHandler = this.#onZoomMovementComplete.bind(this);
    this.#zoomCarousel.on("movement:completed", this.#zoomMovementCompleteHandler);

    this.#zoomDialogCloseHandler = this.#resetAllZoom.bind(this);
    this.#zoomDialog.addEventListener("close", this.#zoomDialogCloseHandler);
  }

  #onZoomClick() {
    const mainIndex = this.#mainCarousel.index ?? 0;
    const mainSlide = this.#mainCarousel.querySelectorAll("tarot-slide")[mainIndex];
    const mediaId = mainSlide?.dataset.productGalleryItem;
    if (!mediaId) return;

    const zoomSlides = this.#zoomCarousel.querySelectorAll("tarot-slide");
    let zoomIndex = -1;
    for (let i = 0; i < zoomSlides.length; i++) {
      if (zoomSlides[i].dataset.productGalleryItem === mediaId) {
        zoomIndex = i;
        break;
      }
    }
    if (zoomIndex < 0) return;

    if (typeof this.#zoomCarousel.jumpToSlide === "function") {
      this.#zoomCarousel.jumpToSlide(zoomIndex);
    }
    this.#prepareAllZoomForFit();
    this.#zoomDialog.showModal();
  }

  #onZoomChange(event) {
    if (this.#ignoreZoomChange) return;
    const isZoomed = event.detail.scale > 1.001;
    if (typeof this.#zoomCarousel.updateOptions === "function") {
      this.#zoomCarousel.updateOptions({ draggable: !isZoomed });
    }
  }

  #onZoomSlideChange({ previousIndex }) {
    if (previousIndex != null) {
      const slides = this.#zoomCarousel.querySelectorAll("tarot-slide");
      const prevSlide = slides[previousIndex];
      const prevZoom = prevSlide?.querySelector("image-zoom");
      if (prevZoom) {
        this.#ignoreZoomChange = true;
        try {
          prevZoom.reset({ animate: false });
        } finally {
          this.#ignoreZoomChange = false;
        }
      }
    }

    this.#pendingZoomDraggableSync = true;
  }

  #onZoomMovementComplete() {
    if (!this.#pendingZoomDraggableSync) return;

    this.#pendingZoomDraggableSync = false;
    const slides = this.#zoomCarousel.querySelectorAll("tarot-slide");
    const activeSlide = slides[this.#zoomCarousel.index ?? 0];
    const activeZoom = activeSlide?.querySelector("image-zoom");
    const isZoomed = activeZoom?.scale > 1.001;
    if (typeof this.#zoomCarousel.updateOptions === "function") {
      this.#zoomCarousel.updateOptions({ draggable: !isZoomed });
    }
  }

  #prepareAllZoomForFit() {
    const zooms = this.querySelectorAll("[data-product-zoom-carousel] image-zoom");
    zooms.forEach((zoom) => {
      if (typeof zoom.prepareForFit === "function") {
        zoom.prepareForFit();
      }
    });
  }

  #resetAllZoom() {
    const zooms = this.querySelectorAll("[data-product-zoom-carousel] image-zoom");
    zooms.forEach((zoom) => {
      zoom.reset({ animate: false });
      if (typeof zoom.prepareForFit === "function") {
        zoom.prepareForFit();
      }
    });
    if (typeof this.#zoomCarousel.updateOptions === "function") {
      this.#zoomCarousel.updateOptions({ draggable: true });
    }
  }
}

customElements.define("product-zoom-gallery", ZoomGallery);
