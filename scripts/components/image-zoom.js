/**
 * image-zoom component — pinch-to-zoom and pan for a single contained image.
 *
 * - Pointer events drive both desktop and mobile.
 * - Two pointers → pinch. One pointer → pan (only when zoomed).
 * - `scale = 1` means the image is contain-fit inside the container.
 * - Pinch below min or above max is rubber-banded and snaps back on release.
 *
 * @class ImageZoom
 * @extends HTMLElement
 */
class ImageZoom extends HTMLElement {
  #img;
  #imgNaturalWidth = 0;
  #imgNaturalHeight = 0;
  #baseScale = 1;
  #scale = 1;
  #translateX = 0;
  #translateY = 0;
  #containerRect = null;
  #gesture = {
    mode: "idle",
    pointers: new Map(),
    startScale: 1,
    startTranslateX: 0,
    startTranslateY: 0,
    startDistance: 0,
    startMidpointX: 0,
    startMidpointY: 0,
    currentMidpointX: 0,
    currentMidpointY: 0,
  };
  #activeTouchPointers = new Set();
  #dispatchingCarouselCancel = false;
  #tapStartX = 0;
  #tapStartY = 0;
  #tapMoved = false;
  #lastTapTime = 0;
  #lastTapX = 0;
  #lastTapY = 0;
  #resizeFrame = 0;
  #resizeObserver = null;
  #initialFitFrame = 0;
  #pendingStableFrames = 0;
  #pendingRectSize = null;

  static get observedAttributes() {
    return ["min", "max"];
  }

  constructor() {
    super();
    this.handlers = {};
  }

  get min() {
    const min = parseFloat(this.getAttribute("min"));
    const max = parseFloat(this.getAttribute("max"));
    const safeMin = Number.isFinite(min) && min > 0 ? min : 1;
    const safeMax = Number.isFinite(max) && max > 0 ? max : 3;
    return Math.min(safeMin, safeMax);
  }

  get max() {
    const min = parseFloat(this.getAttribute("min"));
    const max = parseFloat(this.getAttribute("max"));
    const safeMin = Number.isFinite(min) && min > 0 ? min : 1;
    const safeMax = Number.isFinite(max) && max > 0 ? max : 3;
    return Math.max(safeMin, safeMax);
  }

  get scale() {
    return this.#scale;
  }

  get translateX() {
    return this.#translateX;
  }

  get translateY() {
    return this.#translateY;
  }

  /**
   * Lifecycle — element connected to DOM.
   */
  connectedCallback() {
    this.queryDOM();
    if (!this.#img) return;

    this.#scale = this.min;
    this.prepareForFit();
    this.attachListeners();
    if (this.#img.complete && this.#img.naturalWidth) {
      this.#queueInitialFit();
    } else {
      this.#img.addEventListener("load", () => this.#queueInitialFit(), { once: true });
    }
  }

  /**
   * Lifecycle — element disconnected from DOM.
   */
  disconnectedCallback() {
    this.detachListeners();
    if (this.#resizeFrame) {
      cancelAnimationFrame(this.#resizeFrame);
      this.#resizeFrame = 0;
    }
    if (this.#initialFitFrame) {
      cancelAnimationFrame(this.#initialFitFrame);
      this.#initialFitFrame = 0;
    }
    this.#gesture.pointers.clear();
    this.#activeTouchPointers.clear();
    this.#gesture.mode = "idle";
    this.#tapMoved = false;
    this.#lastTapTime = 0;
    this.removeAttribute("gesturing");
    this.removeAttribute("transitioning");
  }

  /**
   * Lifecycle — observed attribute changed.
   * @param {string} name
   */
  attributeChangedCallback(name) {
    if (!this.#isReady()) return;
    if (name === "min" || name === "max") {
      if (this.#scale < this.min) this.reset();
      else if (this.#scale > this.max) this.zoomTo(this.max);
    }
  }

  /**
   * Find the inner image element.
   */
  queryDOM() {
    this.#img = this.querySelector("img");
  }

  /**
   * Bind all event listeners. Touch events drive the multi-touch path
   * (and Chrome DevTools' Shift+drag pinch simulation); pointer events
   * drive mouse-only pan.
   */
  attachListeners() {
    this.handlers.touchStart = this.#onTouchStart.bind(this);
    this.handlers.touchMove = this.#onTouchMove.bind(this);
    this.handlers.touchEnd = this.#onTouchEnd.bind(this);
    this.handlers.pointerDown = this.#onPointerDown.bind(this);
    this.handlers.pointerMove = this.#onPointerMove.bind(this);
    this.handlers.pointerUp = this.#onPointerUp.bind(this);
    this.handlers.dblClick = this.#onDoubleClick.bind(this);
    this.handlers.transitionEnd = () => this.removeAttribute("transitioning");

    this.addEventListener("touchstart", this.handlers.touchStart, { passive: false });
    this.addEventListener("touchmove", this.handlers.touchMove, { passive: false });
    this.addEventListener("touchend", this.handlers.touchEnd);
    this.addEventListener("touchcancel", this.handlers.touchEnd);
    this.addEventListener("pointerdown", this.handlers.pointerDown);
    window.addEventListener("pointermove", this.handlers.pointerMove, { passive: false });
    window.addEventListener("pointerup", this.handlers.pointerUp);
    window.addEventListener("pointercancel", this.handlers.pointerUp);
    this.addEventListener("dblclick", this.handlers.dblClick);
    this.addEventListener("transitionend", this.handlers.transitionEnd);

    // ResizeObserver covers window resizes, tab/accordion reveals, and any
    // ancestor layout change — catches the hidden-then-shown init case too.
    this.#resizeObserver = new ResizeObserver(() => this.#onResize());
    this.#resizeObserver.observe(this);
  }

  /**
   * Remove all event listeners.
   */
  detachListeners() {
    if (!this.handlers.pointerDown) return;
    this.removeEventListener("touchstart", this.handlers.touchStart);
    this.removeEventListener("touchmove", this.handlers.touchMove);
    this.removeEventListener("touchend", this.handlers.touchEnd);
    this.removeEventListener("touchcancel", this.handlers.touchEnd);
    this.removeEventListener("pointerdown", this.handlers.pointerDown);
    window.removeEventListener("pointermove", this.handlers.pointerMove);
    window.removeEventListener("pointerup", this.handlers.pointerUp);
    window.removeEventListener("pointercancel", this.handlers.pointerUp);
    this.removeEventListener("dblclick", this.handlers.dblClick);
    this.removeEventListener("transitionend", this.handlers.transitionEnd);
    if (this.#resizeObserver) {
      this.#resizeObserver.disconnect();
      this.#resizeObserver = null;
    }
  }

  /**
   * Reset scale and position back to min.
   * @param {{ animate?: boolean }} [options]
   */
  reset({ animate = true } = {}) {
    if (!this.#isReady()) return;
    const rect = this.getBoundingClientRect();
    this.#containerRect = rect;
    const target = this.min;
    const width = this.#imgNaturalWidth * this.#baseScale * target;
    const height = this.#imgNaturalHeight * this.#baseScale * target;
    const nextTranslateX = (rect.width - width) / 2;
    const nextTranslateY = (rect.height - height) / 2;
    this.#commitZoom(target, nextTranslateX, nextTranslateY, animate);
  }

  /**
   * Recompute the base scale from current layout and reset to min zoom.
   * Call after the element becomes visible (e.g. dialog open) or the image
   * source changes.
   */
  recalculate() {
    if (!this.#img) return;
    if (this.#img.complete && this.#img.naturalWidth) {
      this.#initialiseFit();
    } else {
      this.#img.addEventListener("load", () => this.#initialiseFit(), { once: true });
    }
  }

  /**
   * Hide the current image until a fresh contain-fit has been committed.
   */
  prepareForFit() {
    this.removeAttribute("ready");
    this.#pendingStableFrames = 0;
    this.#pendingRectSize = null;
    if (this.#initialFitFrame) {
      cancelAnimationFrame(this.#initialFitFrame);
      this.#initialFitFrame = 0;
    }
  }

  /**
   * Zoom to a specific scale, centered on the container.
   * @param {number} nextScale
   * @param {{ animate?: boolean }} [options]
   */
  zoomTo(nextScale, { animate = true } = {}) {
    if (!this.#isReady()) return;
    const rect = this.getBoundingClientRect();
    this.#containerRect = rect;
    const target = Math.max(this.min, Math.min(this.max, nextScale));
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rawX = centerX - (centerX - this.#translateX) * (target / this.#scale);
    const rawY = centerY - (centerY - this.#translateY) * (target / this.#scale);
    const constrained = this.#constrainTranslate(rawX, rawY, target);
    this.#commitZoom(target, constrained.translateX, constrained.translateY, animate);
  }

  /**
   * Readiness check — true when the inner image exists and has known dimensions.
   * @private
   */
  #isReady() {
    return !!(this.#img && this.#imgNaturalWidth);
  }

  /**
   * Determine when the layout rect has stopped changing between frames.
   * @param {DOMRect} rect
   * @returns {boolean}
   * @private
   */
  #hasStableRect(rect) {
    if (!rect.width || !rect.height) {
      this.#pendingStableFrames = 0;
      this.#pendingRectSize = null;
      return false;
    }

    if (
      this.#pendingRectSize &&
      Math.abs(this.#pendingRectSize.width - rect.width) < 0.5 &&
      Math.abs(this.#pendingRectSize.height - rect.height) < 0.5
    ) {
      this.#pendingStableFrames += 1;
    } else {
      this.#pendingStableFrames = 1;
      this.#pendingRectSize = { width: rect.width, height: rect.height };
    }

    return this.#pendingStableFrames >= 2;
  }

  /**
   * Read natural image dimensions and compute the contain-fit base scale.
   * Updates #containerRect. Does not touch user-facing scale or translate.
   * @private
   */
  #recomputeBaseScale(rect = this.getBoundingClientRect()) {
    const naturalWidth = this.#img.naturalWidth;
    const naturalHeight = this.#img.naturalHeight;
    if (!naturalWidth || !naturalHeight) return false;
    if (!rect.width || !rect.height) return false;
    this.#imgNaturalWidth = naturalWidth;
    this.#imgNaturalHeight = naturalHeight;
    this.#containerRect = rect;
    this.#baseScale = Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
    return true;
  }

  /**
   * Initial fit: compute base scale and center the image at min zoom.
   * @private
   */
  #initialiseFit({ requireStableRect = false } = {}) {
    const rect = this.getBoundingClientRect();
    if (requireStableRect && !this.#hasStableRect(rect)) return false;
    if (!this.#recomputeBaseScale(rect)) return false;
    const containerRect = this.#containerRect;
    this.#scale = this.min;
    const width = this.#imgNaturalWidth * this.#baseScale * this.#scale;
    const height = this.#imgNaturalHeight * this.#baseScale * this.#scale;
    this.#translateX = (containerRect.width - width) / 2;
    this.#translateY = (containerRect.height - height) / 2;
    this.#applyTransform();
    this.setAttribute("ready", "");
    this.#pendingStableFrames = 0;
    this.#pendingRectSize = null;
    return true;
  }

  /**
   * Retry the first contain-fit until the container rect stabilizes.
   * @private
   */
  #queueInitialFit() {
    if (!this.#img || this.hasAttribute("ready") || this.#initialFitFrame) return;

    let attempts = 0;
    const step = () => {
      this.#initialFitFrame = 0;
      if (!this.#img || this.hasAttribute("ready")) return;
      if (this.#initialiseFit({ requireStableRect: true })) return;
      attempts += 1;
      if (attempts < 24) {
        this.#initialFitFrame = requestAnimationFrame(step);
      }
    };

    this.#initialFitFrame = requestAnimationFrame(step);
  }

  /**
   * Write the current transform to the image element.
   * @private
   */
  #applyTransform() {
    const effectiveScale = this.#scale * this.#baseScale;
    this.#img.style.transform = `translate(${this.#translateX}px, ${
      this.#translateY
    }px) scale(${effectiveScale})`;
    if (this.#scale > this.min + 0.001) this.setAttribute("zoomed", "");
    else this.removeAttribute("zoomed");
    this.dispatchEvent(
      new CustomEvent("image-zoom:change", {
        bubbles: true,
        detail: {
          scale: this.#scale,
          translateX: this.#translateX,
          translateY: this.#translateY,
        },
      })
    );
  }

  /**
   * Convert a pointer event or touch to container-local coordinates.
   * @param {PointerEvent|Touch} event
   * @private
   */
  #toLocal(event) {
    const rect = this.#containerRect;
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /**
   * Rebuild the pointers map from a TouchList in container-local coordinates.
   * @param {TouchList} touchList
   * @private
   */
  #syncTouches(touchList) {
    this.#gesture.pointers.clear();
    for (const touch of touchList) {
      this.#gesture.pointers.set(touch.identifier, this.#toLocal(touch));
    }
  }

  /**
   * Clamp translate values so the image cannot leave the container when larger
   * than it, and center the image when smaller than the container.
   * @private
   */
  #constrainTranslate(translateX, translateY, scale) {
    const rect = this.#containerRect || this.getBoundingClientRect();
    const width = this.#imgNaturalWidth * this.#baseScale * scale;
    const height = this.#imgNaturalHeight * this.#baseScale * scale;
    let clampedX;
    let clampedY;
    if (width <= rect.width) {
      clampedX = (rect.width - width) / 2;
    } else {
      const minX = rect.width - width;
      clampedX = Math.min(0, Math.max(minX, translateX));
    }
    if (height <= rect.height) {
      clampedY = (rect.height - height) / 2;
    } else {
      const minY = rect.height - height;
      clampedY = Math.min(0, Math.max(minY, translateY));
    }
    return { translateX: clampedX, translateY: clampedY };
  }

  /**
   * Apply rubber-band resistance when the raw scale is outside [min, max].
   * @private
   */
  #rubberBandScale(raw) {
    const min = this.min;
    const max = this.max;
    if (raw < min) {
      const over = min - raw;
      const resisted = Math.sqrt(over) * 0.25 * min;
      return Math.max(min * 0.8, min - resisted);
    }
    if (raw > max) {
      const over = raw - max;
      const resisted = Math.sqrt(over) * 0.25 * max;
      return Math.min(max * 1.25, max + resisted);
    }
    return raw;
  }

  /**
   * @param {PointerEvent} event
   * @private
   */
  #onPointerDown(event) {
    if (!this.#isReady()) return;
    // Touch events handle the touch path — skip to avoid double-firing, but
    // first guard the host carousel against pinch/zoom-driven dragging.
    if (event.pointerType === "touch") {
      this.#guardCarouselOnPointerDown(event);
      return;
    }
    this.#containerRect = this.getBoundingClientRect();
    // When zoomed out, leave mouse/pen drags to parent UI such as carousels.
    if (this.#scale <= this.min + 0.001 && this.#gesture.pointers.size === 0) return;
    if (this.setPointerCapture) {
      try {
        this.setPointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    }
    this.removeAttribute("transitioning");
    this.#gesture.pointers.set(event.pointerId, this.#toLocal(event));

    if (this.#gesture.pointers.size === 2) {
      this.#beginPinch();
    } else if (this.#gesture.pointers.size === 1) {
      this.#beginPan();
    }
  }

  /**
   * Stop a touch pointerdown from reaching an ancestor carousel (Tarot) when a
   * pinch is underway or the image is already zoomed, so the carousel doesn't
   * slide along with the gesture. A single finger at min zoom is left alone so
   * the carousel can still promote a horizontal swipe between slides.
   * @param {PointerEvent} event
   * @private
   */
  #guardCarouselOnPointerDown(event) {
    this.#activeTouchPointers.add(event.pointerId);
    const isMultiTouch = this.#activeTouchPointers.size >= 2;
    const isZoomed = this.#scale > this.min + 0.001;
    if (!isMultiTouch && !isZoomed) return;
    event.stopPropagation();
    // A pinch starting after a one-finger press may have already armed the
    // carousel's drag on the first finger — release it so the carousel stays put.
    if (isMultiTouch) this.#releaseCarouselDrag();
  }

  /**
   * Abort any drag an ancestor carousel armed on our touch pointers by
   * dispatching a bubbling pointercancel for each active pointer. The carousel
   * matches its own armed pointer and un-arms; others are ignored.
   * @private
   */
  #releaseCarouselDrag() {
    this.#dispatchingCarouselCancel = true;
    for (const pointerId of this.#activeTouchPointers) {
      this.dispatchEvent(new PointerEvent("pointercancel", { pointerId, bubbles: true }));
    }
    this.#dispatchingCarouselCancel = false;
  }

  /**
   * @param {PointerEvent} event
   * @private
   */
  #onPointerMove(event) {
    if (event.pointerType === "touch") return;
    if (!this.#gesture.pointers.has(event.pointerId)) return;
    if (event.cancelable) event.preventDefault();
    this.#gesture.pointers.set(event.pointerId, this.#toLocal(event));

    if (this.#gesture.mode === "pinch" && this.#gesture.pointers.size >= 2) {
      this.#updatePinch();
    } else if (this.#gesture.mode === "pan") {
      this.#updatePan();
    }
  }

  /**
   * @param {PointerEvent} event
   * @private
   */
  #onPointerUp(event) {
    if (this.#dispatchingCarouselCancel) return; // our own synthetic pointercancel
    if (event.pointerType === "touch") {
      this.#activeTouchPointers.delete(event.pointerId);
      return;
    }
    if (!this.#gesture.pointers.has(event.pointerId)) return;
    this.#gesture.pointers.delete(event.pointerId);

    if (this.#gesture.mode === "pinch" && this.#gesture.pointers.size < 2) {
      if (this.#gesture.pointers.size === 1 && this.#scale > this.min + 0.001) {
        this.#settleImmediate();
        this.#beginPan();
      } else {
        this.#settle();
        this.#gesture.mode = "idle";
        this.removeAttribute("gesturing");
      }
      return;
    }

    if (this.#gesture.pointers.size === 0) {
      if (this.#gesture.mode === "pan") this.#settle();
      this.#gesture.mode = "idle";
      this.removeAttribute("gesturing");
    }
  }

  /**
   * @private
   */
  #beginPinch() {
    const [firstPointer, secondPointer] = [...this.#gesture.pointers.values()];
    const midpointX = (firstPointer.x + secondPointer.x) / 2;
    const midpointY = (firstPointer.y + secondPointer.y) / 2;
    this.#gesture.mode = "pinch";
    this.#gesture.startScale = this.#scale;
    this.#gesture.startTranslateX = this.#translateX;
    this.#gesture.startTranslateY = this.#translateY;
    this.#gesture.startDistance =
      Math.hypot(secondPointer.x - firstPointer.x, secondPointer.y - firstPointer.y) || 1;
    this.#gesture.startMidpointX = midpointX;
    this.#gesture.startMidpointY = midpointY;
    this.#gesture.currentMidpointX = midpointX;
    this.#gesture.currentMidpointY = midpointY;
    this.setAttribute("gesturing", "");
    this.dispatchEvent(
      new CustomEvent("image-zoom:zoomstart", {
        bubbles: true,
        detail: { scale: this.#scale },
      })
    );
  }

  /**
   * @private
   */
  #updatePinch() {
    const [firstPointer, secondPointer] = [...this.#gesture.pointers.values()];
    const distance = Math.hypot(secondPointer.x - firstPointer.x, secondPointer.y - firstPointer.y);
    const midpointX = (firstPointer.x + secondPointer.x) / 2;
    const midpointY = (firstPointer.y + secondPointer.y) / 2;
    const gesture = this.#gesture;
    gesture.currentMidpointX = midpointX;
    gesture.currentMidpointY = midpointY;

    const rawScale = gesture.startScale * (distance / gesture.startDistance);
    const nextScale = this.#rubberBandScale(rawScale);
    const ratio = nextScale / gesture.startScale;

    let nextTranslateX = midpointX - (gesture.startMidpointX - gesture.startTranslateX) * ratio;
    let nextTranslateY = midpointY - (gesture.startMidpointY - gesture.startTranslateY) * ratio;

    this.#scale = nextScale;
    if (nextScale >= this.min && nextScale <= this.max) {
      const constrained = this.#constrainTranslate(nextTranslateX, nextTranslateY, nextScale);
      nextTranslateX = constrained.translateX;
      nextTranslateY = constrained.translateY;
    }
    this.#translateX = nextTranslateX;
    this.#translateY = nextTranslateY;
    this.#applyTransform();
  }

  /**
   * @private
   */
  #beginPan() {
    if (this.#scale <= this.min + 0.001) {
      this.#gesture.mode = "idle";
      return;
    }
    const [pointer] = [...this.#gesture.pointers.values()];
    this.#gesture.mode = "pan";
    this.#gesture.startScale = this.#scale;
    this.#gesture.startTranslateX = this.#translateX;
    this.#gesture.startTranslateY = this.#translateY;
    this.#gesture.startMidpointX = pointer.x;
    this.#gesture.startMidpointY = pointer.y;
    this.setAttribute("gesturing", "");
  }

  /**
   * @private
   */
  #updatePan() {
    const [pointer] = [...this.#gesture.pointers.values()];
    const gesture = this.#gesture;
    const rawX = gesture.startTranslateX + (pointer.x - gesture.startMidpointX);
    const rawY = gesture.startTranslateY + (pointer.y - gesture.startMidpointY);
    const constrained = this.#constrainTranslate(rawX, rawY, this.#scale);
    this.#translateX = constrained.translateX;
    this.#translateY = constrained.translateY;
    this.#applyTransform();
  }

  /**
   * Animate back into valid [min, max] range after a gesture ends.
   * @private
   */
  #settle() {
    let target = this.#scale;
    if (target < this.min) target = this.min;
    else if (target > this.max) target = this.max;

    let nextTranslateX = this.#translateX;
    let nextTranslateY = this.#translateY;
    if (target !== this.#scale) {
      const midpointX = this.#gesture.currentMidpointX;
      const midpointY = this.#gesture.currentMidpointY;
      const ratio = target / this.#scale;
      nextTranslateX = midpointX - (midpointX - this.#translateX) * ratio;
      nextTranslateY = midpointY - (midpointY - this.#translateY) * ratio;
    }
    const constrained = this.#constrainTranslate(nextTranslateX, nextTranslateY, target);
    this.#animateTo(target, constrained.translateX, constrained.translateY);
    this.dispatchEvent(
      new CustomEvent("image-zoom:zoomend", {
        bubbles: true,
        detail: { scale: target },
      })
    );
  }

  /**
   * Clamp into valid range without animation — used when handing off from pinch to pan.
   * @private
   */
  #settleImmediate() {
    let target = this.#scale;
    if (target < this.min) target = this.min;
    else if (target > this.max) target = this.max;

    let nextTranslateX = this.#translateX;
    let nextTranslateY = this.#translateY;
    if (target !== this.#scale) {
      const midpointX = this.#gesture.currentMidpointX;
      const midpointY = this.#gesture.currentMidpointY;
      const ratio = target / this.#scale;
      nextTranslateX = midpointX - (midpointX - this.#translateX) * ratio;
      nextTranslateY = midpointY - (midpointY - this.#translateY) * ratio;
    }
    const constrained = this.#constrainTranslate(nextTranslateX, nextTranslateY, target);
    this.#scale = target;
    this.#translateX = constrained.translateX;
    this.#translateY = constrained.translateY;
    this.#applyTransform();
    this.dispatchEvent(
      new CustomEvent("image-zoom:zoomend", {
        bubbles: true,
        detail: { scale: target },
      })
    );
  }

  /**
   * Write a target transform with a CSS transition. Internal — no events.
   * Skips the transitioning attribute when the target is already the current
   * state, otherwise no transition fires and the attribute would stick.
   * @private
   */
  #animateTo(scale, translateX, translateY) {
    if (
      scale === this.#scale &&
      translateX === this.#translateX &&
      translateY === this.#translateY
    ) {
      return;
    }
    this.setAttribute("transitioning", "");
    this.#scale = scale;
    this.#translateX = translateX;
    this.#translateY = translateY;
    this.#applyTransform();
  }

  /**
   * Public-facing commit: fires zoomstart/zoomend around the transform.
   * Used by reset, zoomTo, and double-tap.
   * @private
   */
  #commitZoom(scale, translateX, translateY, animate) {
    if (
      scale === this.#scale &&
      translateX === this.#translateX &&
      translateY === this.#translateY
    ) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent("image-zoom:zoomstart", {
        bubbles: true,
        detail: { scale: this.#scale },
      })
    );
    if (animate) {
      this.#animateTo(scale, translateX, translateY);
    } else {
      this.#scale = scale;
      this.#translateX = translateX;
      this.#translateY = translateY;
      this.#applyTransform();
    }
    this.dispatchEvent(
      new CustomEvent("image-zoom:zoomend", {
        bubbles: true,
        detail: { scale },
      })
    );
  }

  /**
   * @param {MouseEvent} event
   * @private
   */
  #onDoubleClick(event) {
    if (!this.#isReady()) return;
    this.#containerRect = this.getBoundingClientRect();
    const local = this.#toLocal(event);
    this.#doubleTapAt(local.x, local.y);
  }

  /**
   * Toggle zoom anchored at the given container-local point.
   * Shared by desktop double-click and mobile double-tap.
   * @private
   */
  #doubleTapAt(localX, localY) {
    if (this.#scale > this.min + 0.001) {
      this.reset();
      return;
    }
    const target = this.max;
    const ratio = target / this.#scale;
    const rawX = localX - (localX - this.#translateX) * ratio;
    const rawY = localY - (localY - this.#translateY) * ratio;
    const constrained = this.#constrainTranslate(rawX, rawY, target);
    this.#commitZoom(target, constrained.translateX, constrained.translateY, true);
  }

  /**
   * @param {TouchEvent} event
   * @private
   */
  #onTouchStart(event) {
    if (!this.#isReady()) return;
    this.#containerRect = this.getBoundingClientRect();
    this.removeAttribute("transitioning");
    this.#syncTouches(event.touches);

    if (this.#gesture.pointers.size >= 2) {
      if (event.cancelable) event.preventDefault();
      this.#beginPinch();
      return;
    }
    if (this.#gesture.pointers.size === 1) {
      const [pointer] = [...this.#gesture.pointers.values()];
      this.#tapStartX = pointer.x;
      this.#tapStartY = pointer.y;
      this.#tapMoved = false;
      // Only claim the single-finger gesture when already zoomed.
      // Otherwise let parent UI, such as carousels, promote horizontal swipes.
      if (this.#scale > this.min + 0.001) {
        if (event.cancelable) event.preventDefault();
        this.#beginPan();
      }
    }
  }

  /**
   * @param {TouchEvent} event
   * @private
   */
  #onTouchMove(event) {
    if (this.#gesture.pointers.size === 0) return;
    this.#syncTouches(event.touches);

    if (this.#gesture.pointers.size === 1 && !this.#tapMoved) {
      const [pointer] = [...this.#gesture.pointers.values()];
      const deltaX = pointer.x - this.#tapStartX;
      const deltaY = pointer.y - this.#tapStartY;
      if (deltaX * deltaX + deltaY * deltaY > 100) this.#tapMoved = true;
    }

    if (this.#gesture.mode === "pinch" && this.#gesture.pointers.size >= 2) {
      if (event.cancelable) event.preventDefault();
      this.#updatePinch();
    } else if (this.#gesture.mode === "pan") {
      if (event.cancelable) event.preventDefault();
      this.#updatePan();
    }
  }

  /**
   * @param {TouchEvent} event
   * @private
   */
  #onTouchEnd(event) {
    const cancelled = event.type === "touchcancel";
    const previousSize = this.#gesture.pointers.size;
    this.#syncTouches(event.touches);
    if (event.touches.length === 0) this.#activeTouchPointers.clear();

    if (this.#gesture.mode === "pinch" && this.#gesture.pointers.size < 2) {
      if (!cancelled && this.#gesture.pointers.size === 1 && this.#scale > this.min + 0.001) {
        this.#settleImmediate();
        const [pointer] = [...this.#gesture.pointers.values()];
        this.#tapStartX = pointer.x;
        this.#tapStartY = pointer.y;
        this.#tapMoved = true;
        this.#beginPan();
      } else {
        this.#settle();
        this.#gesture.mode = "idle";
        this.removeAttribute("gesturing");
      }
      return;
    }

    if (this.#gesture.pointers.size === 0) {
      if (this.#gesture.mode === "pan" && this.#tapMoved) {
        this.#settle();
      } else if (!cancelled && previousSize === 1 && !this.#tapMoved) {
        this.#handleTap();
      }
      this.#gesture.mode = "idle";
      this.removeAttribute("gesturing");
    }
  }

  /**
   * Detect a tap vs. a double-tap using time and spatial proximity to the
   * previous tap, then dispatch a double-tap zoom when both match.
   * @private
   */
  #handleTap() {
    const now = performance.now();
    const deltaX = this.#tapStartX - this.#lastTapX;
    const deltaY = this.#tapStartY - this.#lastTapY;
    const withinTime = now - this.#lastTapTime < 300;
    const withinSpace = deltaX * deltaX + deltaY * deltaY < 400;
    if (withinTime && withinSpace) {
      this.#doubleTapAt(this.#tapStartX, this.#tapStartY);
      this.#lastTapTime = 0;
      return;
    }
    this.#lastTapTime = now;
    this.#lastTapX = this.#tapStartX;
    this.#lastTapY = this.#tapStartY;
  }

  /**
   * @private
   */
  #onResize() {
    if (!this.#img) return;
    if (this.#resizeFrame) return;
    this.#resizeFrame = requestAnimationFrame(() => {
      this.#resizeFrame = 0;
      if (!this.hasAttribute("ready")) {
        if (this.#img.complete && this.#img.naturalWidth) this.#queueInitialFit();
        return;
      }
      if (!this.#recomputeBaseScale()) return;
      // Preserve the user's current scale; just reclamp translate to the new rect.
      const constrained = this.#constrainTranslate(this.#translateX, this.#translateY, this.#scale);
      this.#translateX = constrained.translateX;
      this.#translateY = constrained.translateY;
      this.#applyTransform();
    });
  }
}

/**
 * @file Main entry point for image-zoom web component
 * @author Cory Schulz
 * @version 0.1.0
 */

// define custom elements if not already defined
if (!customElements.get("image-zoom")) {
  customElements.define("image-zoom", ImageZoom);
}

export { ImageZoom };
