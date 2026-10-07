/*!

Tarot Carousel v0.1.0 - beta
A highly customizable carousel with beautiful, physics-driven animations
Copyright 2026 Magic Spells LLC

This software is source-available but not open source.
See LICENSES for usage tiers and commercial terms.

Licensed under:
- Magic Spells Non-Commercial License (free for personal use and non-revenue projects)
- Magic Spells Commercial License (for commercial use by entities under $1M revenue)
- Magic Spells Enterprise License (for all use by entities with $1M+ revenue)

Author: Cory Schulz
Website: https://www.magicspells.io/tarot
Repo: https://github.com/magic-spells/tarot
Issues: https://github.com/magic-spells/tarot/issues
Licenses: https://www.magicspells.io/licenses
*/
//#region src/scripts/core/lib/event-emitter.js
/**
 * EventEmitter - A simple event system that allows subscribing to and emitting events
 * @class
 */
var EventEmitter = class {
  /** @type {Map} - Private map of event names to arrays of listener objects */
  #events;
  /**
   * Creates a new EventEmitter instance
   */
  constructor() {
    this.#events = /* @__PURE__ */ new Map();
  }
  /**
   * Binds a listener to an event.
   * @param {string} event - The event to bind the listener to.
   * @param {Function} listener - The listener function to bind.
   * @param {Object} [options] - Optional settings.
   * @param {boolean} [options.defer=false] - If true, listener runs async (next tick).
   * @returns {EventEmitter} The current instance for chaining.
   * @throws {TypeError} If the listener is not a function.
   */
  on(event, listener, options) {
    if (typeof listener !== "function") throw new TypeError("Listener must be a function");
    const listeners = this.#events.get(event) || [];
    if (!listeners.some((entry) => entry.fn === listener))
      listeners.push({
        fn: listener,
        defer: options?.defer || false,
      });
    this.#events.set(event, listeners);
    return this;
  }
  /**
   * Unbinds a listener from an event.
   * @param {string} event - The event to unbind the listener from.
   * @param {Function} listener - The listener function to unbind.
   * @returns {EventEmitter} The current instance for chaining.
   */
  off(event, listener) {
    const listeners = this.#events.get(event);
    if (!listeners) return this;
    const index = listeners.findIndex((entry) => entry.fn === listener);
    if (index !== -1) {
      listeners.splice(index, 1);
      if (listeners.length === 0) this.#events.delete(event);
      else this.#events.set(event, listeners);
    }
    return this;
  }
  /**
   * Triggers an event and calls all bound listeners.
   * @param {string} event - The event to trigger.
   * @param {...*} args - Arguments to pass to the listener functions.
   * @returns {boolean} True if the event had listeners, false otherwise.
   */
  emit(event, ...args) {
    const listeners = this.#events.get(event);
    if (!listeners || listeners.length === 0) return false;
    const snapshot = [...listeners];
    for (let i = 0, n = snapshot.length; i < n; ++i) {
      const entry = snapshot[i];
      if (entry === void 0) continue;
      if (entry.defer)
        setTimeout(() => {
          try {
            entry.fn.apply(this, args);
          } catch (error) {
            console.error(`Error in deferred listener for event '${event}':`, error);
          }
        }, 0);
      else
        try {
          entry.fn.apply(this, args);
        } catch (error) {
          console.error(`Error in listener for event '${event}':`, error);
        }
    }
    return true;
  }
  destroy() {
    this.#events.clear();
  }
};
//#endregion
//#region src/scripts/core/lib/velocity-calculator.js
/**
 * Calculates velocity using decoupled position and time stacks.
 * Position deltas are collected at pointer event rate (irregular).
 * Time deltas are collected at rAF rate (consistent ~16.67ms).
 * Velocity is calculated on-demand by dividing sum of positions by sum of times.
 */
var VelocityCalculator = class {
  /** @type {number[]} - Last N position deltas from pointer events */
  #posDeltas = [];
  /** @type {number[]} - Last N time deltas from rAF ticks */
  #timeDeltas = [];
  /** @type {number} - Number of samples to keep in each stack */
  #historySize = 4;
  /** @type {number} - Timestamp of previous rAF tick */
  #prevTime = 0;
  /** @type {number|null} - rAF ID for cancellation */
  #rafId = null;
  /** @type {boolean} - Whether the calculator is actively running */
  #isRunning = false;
  /** @type {number} - Reference frame time for normalization (60fps = 16.67ms) */
  #referenceTime = 16.67;
  /**
   * Start tracking velocity
   */
  start() {
    const _ = this;
    _.stop();
    _.#posDeltas = [];
    _.#timeDeltas = [];
    _.#prevTime = performance.now();
    _.#isRunning = true;
    _.#tick();
  }
  /**
   * Add a position delta from a pointer event
   * @param {number} delta - Position change since last pointer event
   */
  addDelta(delta) {
    this.#posDeltas.push(delta);
    if (this.#posDeltas.length > this.#historySize) this.#posDeltas.shift();
  }
  /**
   * Stop tracking and return the final velocity
   * @returns {number} - Final velocity normalized to 60fps baseline
   */
  stop() {
    const _ = this;
    _.#isRunning = false;
    if (_.#rafId !== null) {
      cancelAnimationFrame(_.#rafId);
      _.#rafId = null;
    }
    return _.getVelocity();
  }
  /**
   * Get the current velocity without stopping
   * Calculates on-demand from position and time stacks
   * @returns {number} - Current velocity normalized to 60fps baseline
   */
  getVelocity() {
    const _ = this;
    if (_.#posDeltas.length === 0 || _.#timeDeltas.length === 0) return 0;
    const totalPos = _.#posDeltas.reduce((a, b) => a + b, 0);
    const totalTime = _.#timeDeltas.reduce((a, b) => a + b, 0);
    if (totalTime === 0) return 0;
    const velocity = (totalPos / totalTime) * _.#referenceTime;
    return Math.max(-5e3, Math.min(5e3, velocity));
  }
  /**
   * Internal rAF tick that collects time deltas
   * @param {number} [time] - rAF timestamp
   */
  #tick(time) {
    const _ = this;
    if (!_.#isRunning) return;
    if (time !== void 0) {
      const deltaTime = time - _.#prevTime;
      if (deltaTime > 0 && deltaTime <= 100) {
        _.#timeDeltas.push(deltaTime);
        if (_.#timeDeltas.length > _.#historySize) _.#timeDeltas.shift();
      }
      _.#prevTime = time;
    }
    _.#rafId = requestAnimationFrame((t) => _.#tick(t));
  }
};
/**
 * debounce calls a function after a specified delay has passed since the last time it was invoked.
 * @param {Function} func - the function to debounce
 * @param {number} wait - the number of milliseconds to wait before calling func
 * @param {boolean} [immediate=false] - if true, func is called on the leading edge of the timeout
 * @returns {Function} a debounced function that delays invoking func
 */
function debounce(func, wait, immediate) {
  var timeout;
  var debounced = function (...args) {
    var context = this;
    var later = function () {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    var callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) func.apply(context, args);
  };
  debounced.cancel = function () {
    clearTimeout(timeout);
    timeout = null;
  };
  return debounced;
}
/**
 * Deep merge two objects.
 * @param {Object} target - The target object.
 * @param {Object} source - The source object.
 * @returns {Object} - The merged object.
 */
function deepMerge(target, source) {
  const isObject = (obj) => obj && typeof obj === "object";
  return Object.keys(source).reduce(
    (acc, key) => {
      if (Array.isArray(source[key])) acc[key] = source[key];
      else if (isObject(acc[key]) && isObject(source[key]))
        acc[key] = deepMerge({ ...acc[key] }, source[key]);
      else acc[key] = source[key];
      return acc;
    },
    { ...target }
  );
}
function convertValueToNumber(value, width) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  if (value.indexOf("px") > -1) return parseFloat(value.replace("px", ""));
  else if (value.indexOf("%") > -1) return (parseFloat(value.replace("%", "")) / 100) * width;
  return 0;
}
/**
 * Determines if looping is possible and should be enabled
 * @param {number} slideCount - Total number of slides
 * @param {Object} options - Carousel options containing loop and slidesPerView settings
 * @param {Object} [loopBuffer={left:0,right:0}] - Effect buffer requirements for extra slides
 * @returns {boolean} true if looping should be enabled, false otherwise
 */
function canLoop(slideCount, options, loopBuffer) {
  if (options.loop == false) return false;
  const slidesPerView = options.slidesPerView || 1;
  return (
    slideCount >= Math.max(slidesPerView + loopBuffer.left + loopBuffer.right, slidesPerView + 1)
  );
}
/**
 * Calculate which slides are visible in the viewport and their visibility percentages
 * @param {Object} ctx - shared module context containing store, emitter, etc.
 * @param {number} [trackPosition] - track position (if not provided, reads from store)
 * @param {number} [buffer=0] - additional buffer around viewport
 * @returns {Array} array of objects with slide info: {slide, index, visibilityPercent, isVisible, isFullyVisible}
 */
function getSlidesInViewport(ctx, trackPosition = null, buffer = 0) {
  const widths = ctx.store.getWidths();
  const slides = ctx.store.getSlides();
  ctx.store.getState();
  if (trackPosition === null) trackPosition = ctx.store.getAnimation().trackPosition || 0;
  const viewportWidth = widths.viewport;
  const slideWidth = widths.slide;
  widths.gap;
  const slideAndGapWidth = widths.slideAndGap;
  const boundsWidth = widths.visibilityBoundsWidth || viewportWidth;
  const boundsOffset = widths.visibilityBoundsOffset || 0;
  const viewportStart = -trackPosition - buffer;
  const viewportEnd = viewportStart + viewportWidth + buffer * 2;
  const viewportCenter = -trackPosition + viewportWidth / 2;
  const visStart = -trackPosition + boundsOffset - buffer;
  const visEnd = visStart + boundsWidth + buffer * 2;
  const slideInfo = [];
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const renderIndex = slide._renderIndex !== void 0 ? slide._renderIndex : i;
    const slideStart = renderIndex * slideAndGapWidth;
    const slideEnd = slideStart + slideWidth;
    const viewportIntersection = Math.max(
      0,
      Math.min(slideEnd, viewportEnd) - Math.max(slideStart, viewportStart)
    );
    const viewportVisibilityPercent = Math.max(0, Math.min(1, viewportIntersection / slideWidth));
    const intersection = Math.max(0, Math.min(slideEnd, visEnd) - Math.max(slideStart, visStart));
    const visibilityPercent = Math.max(0, Math.min(1, intersection / slideWidth));
    const isPartiallyVisible = visibilityPercent > 0;
    const isMostlyVisible = visibilityPercent >= 0.66;
    const isFullyVisible = visibilityPercent >= 0.98;
    let leftVisibility = 0;
    let rightVisibility = 0;
    let parallax = 0;
    let parallaxVisibility = 1;
    if (viewportIntersection > 0) {
      const distanceFromCenter = slideStart + slideWidth / 2 - viewportCenter;
      parallax = Math.max(-1, Math.min(1, distanceFromCenter / (viewportWidth / 2)));
      if (distanceFromCenter > 0) {
        rightVisibility = Math.max(0, Math.min(1, viewportVisibilityPercent));
        parallaxVisibility = 1 - rightVisibility;
      } else rightVisibility = 1;
      if (distanceFromCenter < 0) {
        leftVisibility = Math.max(0, Math.min(1, viewportVisibilityPercent));
        parallaxVisibility = (1 - leftVisibility) * -1;
      } else leftVisibility = 1;
      if (viewportVisibilityPercent >= 1) {
        leftVisibility = 1;
        rightVisibility = 1;
        parallaxVisibility = 0;
      }
    } else {
      const distanceFromCenter = slideStart + slideWidth / 2 - viewportCenter;
      if (distanceFromCenter > 0) parallaxVisibility = 1;
      if (distanceFromCenter < 0) parallaxVisibility = -1;
    }
    slideInfo.push({
      slide,
      index: i,
      renderIndex,
      visibilityPercent,
      isPartiallyVisible,
      isMostlyVisible,
      isFullyVisible,
      leftVisibility,
      rightVisibility,
      parallax,
      parallaxVisibility,
      slideStart,
      slideEnd,
    });
  }
  return slideInfo;
}
/**
 * Round to nearest hundredth of a pixel to eliminate floating-point precision issues
 * without collapsing distinct positions together.
 * @param {number} value - The value to round
 * @returns {number} Rounded value
 */
function roundSubPixel(value) {
  return Math.round(value * 100) / 100;
}
/**
 * Resolves the visibilityBoundsElement option to an actual HTMLElement.
 * Falls back to viewportEl for unmatched selectors or invalid input.
 * @param {'viewport'|'carousel'|string|HTMLElement} value - the option value
 * @param {HTMLElement} carouselEl - the outer tarot-carousel element
 * @param {HTMLElement} viewportEl - the tarot-viewport element
 * @returns {HTMLElement} resolved bounds element
 */
function resolveVisibilityBoundsElement(value, carouselEl, viewportEl) {
  if (!value || value === "viewport") return viewportEl;
  if (value === "carousel") return carouselEl;
  if (value instanceof HTMLElement) return value;
  if (typeof value === "string") {
    const resolved = carouselEl.closest(value);
    if (resolved) return resolved;
    console.warn(
      `[Tarot] visibilityBoundsElement selector "${value}" did not match any ancestor; falling back to viewport.`
    );
    return viewportEl;
  }
  return viewportEl;
}
var utils = Object.freeze({
  debounce,
  deepMerge,
  convertValueToNumber,
  canLoop,
  getSlidesInViewport,
  roundSubPixel,
  resolveVisibilityBoundsElement,
});
//#endregion
//#region src/scripts/core/drag-handler.js
/**
 * Handles all drag interactions with the carousel.
 *
 * Gesture model (idle → armed → dragging):
 * - pointerdown only *arms* the gesture: record the origin and capture the
 *   pointer. It does NOT preventDefault/stopPropagation, so native controls
 *   (a `<select>`, inputs, buttons, links, custom focusable widgets) keep
 *   working — a press that never becomes a horizontal drag is just a click.
 * - pointermove *promotes* to a real drag once it passes the threshold and is
 *   horizontal. Only then do we preventDefault and emit `drag:start`.
 * - Vertical intent on touch is handed to the browser via `touch-action:
 *   pan-y` (set in base.css); the browser scrolls and fires `pointercancel`,
 *   which we treat as a clean, no-op end.
 *
 * @class DragHandler
 */
var DragHandler = class {
  /**
   * Creates a new drag handler for the carousel
   * @param {Object} ctx - The context object containing carousel references and services
   */
  constructor(ctx) {
    const _ = this;
    /** @type {Object} - Reference to context object */
    _.ctx = ctx;
    /** @type {HTMLElement} - Element to bind drag events to */
    _.track = ctx.track;
    /** @type {VelocityCalculator} - Handles velocity calculation with rAF timing */
    _.velocityCalculator = new VelocityCalculator();
    /** @type {number} - Pixels of horizontal movement required to promote a press into a drag */
    _.dragThreshold = 3;
    /**
     * @type {Object} - Object containing all drag state information
     */
    _.drag = {
      /** @type {boolean} - Pointer is down and a gesture is being evaluated */
      armed: false,
      /** @type {boolean} - Gesture has been promoted to an active drag */
      isDragging: false,
      /** @type {number|null} - pointerId of the gesture we're tracking */
      pointerId: null,
      /** @type {number} - screenX at the (re-based) drag origin */
      startX: 0,
      /** @type {number} - screenY at pointerdown */
      startY: 0,
      /** @type {number} - Current X position during drag */
      currentPos: 0,
      /** @type {number} - Previous X position (for per-move velocity deltas) */
      prevPos: 0,
      /** @type {number} - Distance moved since the drag origin */
      delta: 0,
      /** @type {number} - Speed of movement */
      velocity: 0,
      /** @type {boolean} - Whether the gesture became a real drag (suppresses the trailing click) */
      dragThresholdMet: false,
    };
    /** @type {Object} - Bound event handlers for proper cleanup */
    _.handlers = {
      click: (e) => _.handleClick(e),
      pointerdown: (e) => _.handleDragStart(e),
      pointermove: (e) => _.handleDragMove(e),
      pointerup: (e) => _.handleDragEnd(e),
      pointercancel: (e) => _.handleDragEnd(e),
      lostpointercapture: (e) => _.handleDragEnd(e),
      touchmove: (e) => {
        if (_.drag.isDragging) e.preventDefault();
      },
      dragstart: (e) => {
        if (!_.ctx.store.getOptions().draggable) return;
        if (
          e.target.closest(
            'input, select, textarea, [contenteditable=""], [contenteditable="true"], [data-tarot-no-drag]'
          )
        )
          return;
        e.preventDefault();
      },
      dblclick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
      },
      optionsChanged: () => _.syncDraggableAttr(),
    };
    _.init();
  }
  /**
   * Initialize the drag handler
   */
  init() {
    this.bindEvents();
    this.syncDraggableAttr();
  }
  syncDraggableAttr() {
    const draggable = this.ctx.store.getOptions().draggable;
    this.track.classList.toggle("tarot-drag-disabled", !draggable);
  }
  /**
   * Bind drag events on the carousel track element.
   */
  bindEvents() {
    const _ = this;
    const track = _.track;
    track.addEventListener("click", _.handlers.click);
    track.addEventListener("pointerdown", _.handlers.pointerdown, { passive: false });
    track.addEventListener("pointermove", _.handlers.pointermove, { passive: false });
    track.addEventListener("pointerup", _.handlers.pointerup, { passive: false });
    track.addEventListener("pointercancel", _.handlers.pointercancel, { passive: false });
    track.addEventListener("lostpointercapture", _.handlers.lostpointercapture);
    track.addEventListener("touchmove", _.handlers.touchmove, { passive: false });
    track.addEventListener("dragstart", _.handlers.dragstart);
    track.addEventListener("dblclick", _.handlers.dblclick);
    _.ctx.emitter.on(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
  }
  /**
   * Handle click events on the track.
   * Suppresses the click that trails a real drag; otherwise emits slides:click.
   * @param {Event} e - The click event.
   */
  handleClick(e) {
    const _ = this;
    if (_.drag.dragThresholdMet) {
      _.drag.dragThresholdMet = false;
      e.preventDefault();
      return;
    }
    const slide = e.target.closest("tarot-slide");
    if (slide) {
      const index = parseInt(slide.getAttribute("index")) || 0;
      const renderIndex = slide._renderIndex;
      _.ctx.emitter.emit(_.ctx.events.slides.click, {
        index,
        renderIndex,
        event: e,
      });
    }
  }
  /**
   * Handle pointerdown: arm the gesture without hijacking the pointer.
   * @param {PointerEvent} e - The pointer down event.
   */
  handleDragStart(e) {
    const _ = this;
    const drag = _.drag;
    drag.dragThresholdMet = false;
    if (!_.ctx.store.getOptions().draggable) return;
    if (drag.armed) return;
    if (
      e.target.closest(
        'input, select, textarea, [contenteditable=""], [contenteditable="true"], [data-tarot-no-drag]'
      )
    )
      return;
    drag.armed = true;
    drag.isDragging = false;
    drag.pointerId = e.pointerId;
    drag.startX = e.screenX;
    drag.startY = e.screenY;
    drag.currentPos = e.screenX;
    drag.prevPos = e.screenX;
    drag.velocity = 0;
    drag.delta = 0;
    _.velocityCalculator.start();
  }
  /**
   * Handle pointermove: decide tap-vs-drag, then drive the active drag.
   * @param {PointerEvent} e - The pointer move event.
   */
  handleDragMove(e) {
    const _ = this;
    const drag = _.drag;
    if (!drag.armed || e.pointerId !== drag.pointerId) return;
    if (e.pointerType !== "touch" && e.buttons === 0) {
      drag.armed = false;
      drag.isDragging = false;
      drag.pointerId = null;
      _.velocityCalculator.stop();
      return;
    }
    const posDelta = e.screenX - drag.prevPos;
    drag.prevPos = e.screenX;
    _.velocityCalculator.addDelta(posDelta);
    if (!drag.isDragging) {
      const dx = Math.abs(e.screenX - drag.startX);
      if (Math.abs(e.screenY - drag.startY) > dx) return;
      if (dx <= _.dragThreshold) return;
      drag.startX = e.screenX;
      drag.currentPos = e.screenX;
      drag.delta = 0;
      drag.isDragging = true;
      drag.dragThresholdMet = true;
      if (e.pointerType !== "touch")
        try {
          _.track.setPointerCapture(e.pointerId);
        } catch {}
      _.ctx.emitter.emit(_.ctx.events.drag.start, {
        event: e,
        drag,
      });
    }
    e.preventDefault();
    drag.currentPos = e.screenX;
    drag.delta = drag.currentPos - drag.startX;
    drag.velocity = _.velocityCalculator.getVelocity();
    _.ctx.emitter.emit(_.ctx.events.drag.move, {
      event: e,
      drag,
    });
  }
  /**
   * Handle pointerup / pointercancel / lostpointercapture: finalize.
   * A press that never promoted is a tap — left completely untouched so
   * the native click (and slides:click) proceed normally.
   * @param {PointerEvent} e - The terminating pointer event.
   */
  handleDragEnd(e) {
    const _ = this;
    const drag = _.drag;
    if (!drag.armed || e.pointerId !== drag.pointerId) return;
    try {
      if (_.track.hasPointerCapture?.(drag.pointerId))
        _.track.releasePointerCapture(drag.pointerId);
    } catch {}
    const wasDragging = drag.isDragging;
    drag.armed = false;
    drag.isDragging = false;
    drag.pointerId = null;
    if (!wasDragging) {
      _.velocityCalculator.stop();
      return;
    }
    drag.velocity = _.velocityCalculator.stop();
    _.ctx.emitter.emit(_.ctx.events.drag.end, {
      event: e,
      drag,
    });
    drag.delta = 0;
  }
  /**
   * Clean up event listeners and cancel any pending operations
   * Should be called when the carousel is destroyed to prevent memory leaks
   */
  destroy() {
    const _ = this;
    const track = _.track;
    _.velocityCalculator.stop();
    try {
      if (_.drag.pointerId != null && track.hasPointerCapture?.(_.drag.pointerId))
        track.releasePointerCapture(_.drag.pointerId);
    } catch {}
    track.removeEventListener("click", _.handlers.click);
    track.removeEventListener("pointerdown", _.handlers.pointerdown);
    track.removeEventListener("pointermove", _.handlers.pointermove);
    track.removeEventListener("pointerup", _.handlers.pointerup);
    track.removeEventListener("pointercancel", _.handlers.pointercancel);
    track.removeEventListener("lostpointercapture", _.handlers.lostpointercapture);
    track.removeEventListener("touchmove", _.handlers.touchmove);
    track.removeEventListener("dragstart", _.handlers.dragstart);
    track.removeEventListener("dblclick", _.handlers.dblclick);
    _.ctx.emitter.off(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
  }
};
//#endregion
//#region src/scripts/core/effect-manager.js
/**
 * manages the different display effects for the carousel
 */
var EffectManager = class {
  /** @type {Object} shared module context */
  #ctx;
  /** @type {Object} registry of available effects */
  #effectRegistry;
  /** @type {Object|null} current effect instance */
  #currentEffect = null;
  /**
   * @constructor
   * @param {Object} ctx - shared module context containing emitter, events, store, etc.
   * @param {Object} effectRegistry - registry of available effect classes
   */
  constructor(ctx, effectRegistry) {
    const _ = this;
    _.#ctx = ctx;
    _.#effectRegistry = effectRegistry;
    _.handlers = {
      optionsChanged: ({ currentOptions }) => {
        const currentEffectName =
          _.#currentEffect?.constructor?.effectName || _.#currentEffect?.constructor?.name;
        if (currentOptions.effect !== currentEffectName) _.loadEffect(currentOptions.effect);
      },
    };
    _.init();
  }
  init() {
    const _ = this;
    _.bindEvents();
    _.handlers.effectRegistered = (e) => {
      try {
        const registered = e?.detail?.effectName;
        const desired = String(_.#ctx.store.getOptions().effect || "").toLowerCase();
        if (registered && desired && registered === desired) _.loadEffect(desired);
      } catch (err) {}
    };
    if (typeof window !== "undefined" && typeof window.addEventListener === "function")
      window.addEventListener("tarot:effect-registered", _.handlers.effectRegistered);
  }
  reInit() {
    this.loadCurrentEffect();
  }
  bindEvents() {
    this.#ctx.emitter.on(this.#ctx.events.store.optionsChanged, this.handlers.optionsChanged);
  }
  loadCurrentEffect() {
    this.loadEffect(this.#ctx.store.getOptions().effect);
  }
  /**
   * load a specific effect by name
   * @param {string} effectName - name of the effect to load
   */
  loadEffect(effectName) {
    const _ = this;
    if (!effectName) {
      console.error("Error: no effect detected or could not load effect ", effectName);
      return;
    }
    const NewEffectClass = _.#effectRegistry[effectName];
    if (!NewEffectClass) {
      if (effectName !== "carousel") this.loadEffect("carousel");
      return;
    }
    const previousEffect = _.#currentEffect;
    const previousEffectName =
      previousEffect?.constructor?.effectName || previousEffect?.constructor?.name;
    if (_.#currentEffect) {
      _.#currentEffect.destroy();
      _.#ctx.emitter.emit(_.#ctx.events.effect.destroyed, { effectName: previousEffectName });
    }
    _.#currentEffect = new NewEffectClass(_.#ctx);
    _.#ctx.carousel.setAttribute("effect", effectName);
    _.#ctx.emitter.emit(_.#ctx.events.effect.loaded, {
      effect: _.#currentEffect,
      effectName,
    });
    _.#ctx.emitter.emit(_.#ctx.events.effect.changed, {
      previousEffect,
      currentEffect: _.#currentEffect,
      effectName,
    });
  }
  /**
   * get the current effect instance
   * @returns {Object|null} current effect instance
   */
  getEffect() {
    return this.#currentEffect;
  }
  /**
   * destroy the effect manager, unbinding all events
   */
  destroy() {
    const _ = this;
    if (
      typeof window !== "undefined" &&
      typeof window.removeEventListener === "function" &&
      _.handlers?.effectRegistered
    )
      window.removeEventListener("tarot:effect-registered", _.handlers.effectRegistered);
    _.#ctx.emitter.off(_.#ctx.events.store.optionsChanged, _.handlers.optionsChanged);
    if (_.#currentEffect) {
      const effectName =
        _.#currentEffect.constructor?.effectName || _.#currentEffect.constructor?.name || null;
      _.#currentEffect.destroy();
      _.#ctx.emitter.emit(_.#ctx.events.effect.destroyed, { effectName });
      _.#currentEffect = null;
    }
  }
};
//#endregion
//#region src/scripts/core/events.js
var EVENTS = Object.freeze({
  carousel: Object.freeze({
    init: "carousel:init",
    ready: "carousel:ready",
    reinit: "carousel:reinit",
    destroy: "carousel:destroy",
    error: "carousel:error",
    beforeTransition: "carousel:before-transition",
    afterTransition: "carousel:after-transition",
    hasFocus: "carousel:has-focus",
    lostFocus: "carousel:lost-focus",
  }),
  store: Object.freeze({
    optionsChanged: "options:changed",
    stateChanged: "state:changed",
    layoutChanged: "layout:changed",
    slidesChanged: "slides:changed",
    pageIndexChanged: "page-index:changed",
    pageCountChanged: "page-count:changed",
    canLoopChanged: "can-loop:changed",
    snapPointsChanged: "snap-points:changed",
    selectedIndexChanged: "selected-index:changed",
    renderIndexChanged: "render-index:changed",
    transformPointsChanged: "transform-points:changed",
    changedDirty: "store:changed-dirty",
    changedClean: "store:changed-clean",
  }),
  drag: Object.freeze({
    start: "drag:start",
    move: "drag:move",
    end: "drag:end",
    cancel: "drag:cancel",
  }),
  frame: Object.freeze({
    beforeRender: "frame:before-render",
    afterRender: "frame:after-render",
  }),
  slides: Object.freeze({
    click: "slides:click",
    visibleChanged: "slides:visible-changed",
  }),
  window: Object.freeze({
    resize: "window:resize",
    orientationChange: "window:orientation-change",
    visibilityChange: "window:visibility-change",
    hasFocus: "window:has-focus",
    lostFocus: "window:lost-focus",
  }),
  track: Object.freeze({
    looped: "track:looped",
    shifted: "track:shifted",
    requestFrame: "track:request-frame",
    positionChanged: "track:position-changed",
  }),
  effect: Object.freeze({
    changed: "effect:changed",
    loaded: "effect:loaded",
    destroyed: "effect:destroyed",
  }),
  movement: Object.freeze({
    requested: "movement:requested",
    started: "movement:started",
    completed: "movement:completed",
  }),
  engine: Object.freeze({
    positionChanged: "engine:position-changed",
    finished: "engine:finished",
  }),
  user: Object.freeze({ interacted: "user:interacted" }),
  keyboard: Object.freeze({ arrow: "keyboard:arrow" }),
});
//#endregion
//#region src/scripts/core/options-manager.js
/**
 * @class OptionsManager
 * Manages carousel options, responsive breakpoints, and merged settings.
 * - merges default options, user options, and a single active breakpoint (non-cumulative)
 * - reads options from a DOM element or programmatic updates
 * - writes merged options to the data store
 * - re-evaluates the current breakpoint on window resize/orientation change
 */
var OptionsManager = class {
  /**
   * Creates a new OptionsManager instance
   * @param {object} ctx - Shared module context (should contain .carousel, .viewport, .emitter, etc)
   */
  constructor(ctx) {
    const _ = this;
    _.ctx = ctx;
    /** @type {object} - Default carousel options */
    _.defaultOptions = {
      /** @type {boolean|string} - Selector for carousel to sync navigation with */
      asNavFor: false,
      /** @type {object} - Physics-based animation settings */
      animation: {
        /** @type {number} - Spring attraction coefficient */
        attraction: 0.026,
        /** @type {number} - Friction coefficient for dampening */
        friction: 0.25,
        /** @type {number} - Base animation speed */
        speed: 5,
        /** @type {number} - Multiplier for initial velocity */
        velocityBoost: 1.4,
        /** @type {number} - Friction for free scroll momentum (0-1, higher = more slippery) */
        freeScrollFriction: 0.96,
      },
      /** @type {object} - Autoplay settings */
      autoplay: {
        /** @type {number} - Time between slides in ms (0 = disabled) */
        interval: 0,
        /** @type {boolean} - Whether to stop autoplay after user interaction */
        stopAfterInteraction: true,
        /** @type {string} - What happens to autoplay after user interaction */
        afterInteraction: "pause",
      },
      /** @type {object} - Responsive breakpoint settings: { [minWidth:number]: optionsObject } */
      breakpoints: {},
      /** @type {string} - Uses either "viewport" or "window" for breakpoints */
      breakpointElement: "window",
      /** @type {boolean} - Visually center the selected slide */
      centerSelectedSlide: false,
      /** @type {boolean} - Center the slide group in the viewport when slides underfill it */
      centerInsufficientSlides: false,
      /** @type {boolean} - Whether the carousel can be dragged */
      draggable: true,
      /** @type {number} - Minimum drag distance to trigger slide change */
      dragThreshold: 40,
      /** @type {string} - Class to filter which slides are included */
      filterClass: "",
      /** @type {boolean} - Whether clicking a slide selects it */
      focusOnSelect: false,
      /** @type {number} - Starting slide index */
      initialIndex: 0,
      /** @type {boolean} - Whether carousel should loop */
      loop: false,
      /** @type {string} - Snap behavior: 'page' (default), 'slide' (free scroll + snap), 'none' (free scroll) */
      snap: "page",
      /** @type {string} - Display effect ('carousel', 'fade', etc) */
      effect: "carousel",
      /** @type {number|string} - Gap between slides (px or CSS string) */
      gap: 0,
      /** @type {number|string} - Left padding (px or CSS string) */
      paddingLeft: 0,
      /** @type {number|string} - Right padding (px or CSS string)  */
      paddingRight: 0,
      /** @type {string} - Min width for slides */
      slideMinWidth: "50px",
      /** @type {number} - Slides visible at once */
      slidesPerView: 1,
      /** @type {number} - Slides to move on navigation */
      slidesPerMove: "auto",
      /** @type {object} - Navigation controls settings */
      navigation: {
        /** @type {boolean} - Whether to show navigation buttons */
        showButtons: true,
        /** @type {boolean} - Whether to show previous button */
        showPreviousButton: true,
        /** @type {boolean} - Whether to show next button */
        showNextButton: true,
        /** @type {boolean|string} - Custom selector for previous button */
        previousButtonSelector: false,
        /** @type {boolean|string} - Custom selector for next button */
        nextButtonSelector: false,
        /** @type {boolean} - Whether buttons should hide when navigation limit reached */
        smartButtons: false,
        /** @type {boolean} - Whether to show pagination */
        showPagination: true,
        /** @type {boolean|string} - Custom selector for pagination container */
        paginationSelector: false,
      },
      /** @type {boolean} - Automatically go to selected slide */
      goToSelectedSlide: false,
      /** @type {boolean|string} - Selector for carousel to sync with */
      syncWith: false,
      /** @type {boolean} - Enable screen reader announcements for slide navigation */
      announcements: true,
      /** @type {boolean} - Write per-frame slide metric CSS vars (--tarot-visibility, --tarot-parallax, etc.) for CSS-driven styling */
      renderSlideMetrics: false,
      /**
       * Element used to compute slide visibility for inert/aria-hidden.
       * Does NOT affect layout, snap, loop, or effect math — only the inert/aria-hidden bounds.
       * @type {'viewport'|'carousel'|string|HTMLElement}
       *   'viewport' (default) - use tarot-viewport (current behavior)
       *   'carousel'           - use the outer tarot-carousel element
       *   string               - CSS selector resolved via carousel.closest(selector)
       *   HTMLElement          - direct element reference
       * The element MUST be in a stable layout relationship with the viewport (i.e. an ancestor).
       */
      visibilityBoundsElement: "viewport",
      /** @type {object} - Effect rules (not user-settable, overridden by effect class) */
      rules: {
        minSlidesPerView: 1,
        maxSlidesPerView: Infinity,
        loopBuffer: {
          left: 0,
          right: 1,
        },
        minPaddingLeft: 0,
        minPaddingRight: 0,
      },
    };
    /** @type {object} - User-provided options (pre-merge) */
    _.userOptions = {};
    /** @type {HTMLElement|null} - Element containing data-tarot-options JSON */
    _.userOptionsElement = _.ctx.carousel.querySelector(":scope > [data-tarot-options]");
    /** @type {{minWidth:number,options:object}} - Current active breakpoint */
    _.currentBreakpoint = {
      minWidth: 0,
      options: {},
    };
    /** @type {('window'|'viewport'|null)} - Which event source drives breakpoint re-evaluation (set at load) */
    _.breakpointSource = null;
    /**
     * debounced version of checkBreakpoints used only for noisy window events
     * - we use trailing execution so multiple rapid events collapse into one
     * - programmatic calls (reInit/setUserOptions) still run immediately
     * @type {Function}
     */
    _.checkBreakpointsDebounced = _.ctx.utils.debounce(() => _.checkBreakpoints(), 4);
    _.handlers = {
      /** @type {Function} - Called on window resize; debounced to avoid duplicate work */
      onWindowResize: _.checkBreakpointsDebounced,
      /** @type {Function} - Called on orientation change; debounced to coalesce with resize */
      onOrientationChange: _.checkBreakpointsDebounced,
    };
    _.init();
  }
  /**
   * Initializes the options manager
   * - loads user options from DOM
   * - computes initial breakpoint
   * - writes merged options to the data store
   */
  init() {
    const _ = this;
    _.loadUserOptions();
    _.bindBreakpointSource();
    _.currentBreakpoint = _.getCurrentBreakpoint();
    _.applyMergedOptions();
  }
  /**
   * Triggers a re-evaluation of breakpoints and updates merged options if needed
   * - this is intentionally immediate (not debounced) for programmatic calls
   */
  reInit() {
    this.checkBreakpoints();
  }
  /**
   * Binds the breakpoint re-evaluation trigger to the source implied by
   * `breakpointElement` (resolved once at load — it is not runtime-responsive):
   * - 'window'   → raw DOM window resize/orientationchange, so a window-width
   *                breakpoint crossing fires even when the viewport width is fixed
   *                or capped (the viewport-gated `window:resize` emitter would miss it).
   * - 'viewport' → the viewport-gated `window:resize` emitter event, which is
   *                exactly what viewport-measured breakpoints want.
   * The bound source is recorded on `_.breakpointSource` so destroy() removes the
   * matching listeners. checkBreakpoints() is idempotent, so an extra trigger from
   * a noisy source is a cheap no-op.
   */
  bindBreakpointSource() {
    const _ = this;
    const mode = _.resolveBreakpointElement() === "viewport" ? "viewport" : "window";
    _.breakpointSource = mode;
    if (mode === "viewport")
      _.ctx.emitter.on(_.ctx.events.window.resize, _.handlers.onWindowResize);
    else {
      window.addEventListener("resize", _.handlers.onWindowResize);
      window.addEventListener("orientationchange", _.handlers.onOrientationChange);
    }
  }
  /**
   * Cleans up event listeners and cancels any pending debounced breakpoint checks
   */
  destroy() {
    const _ = this;
    if (_.breakpointSource === "viewport")
      _.ctx.emitter.off(_.ctx.events.window.resize, _.handlers.onWindowResize);
    else if (_.breakpointSource === "window") {
      window.removeEventListener("resize", _.handlers.onWindowResize);
      window.removeEventListener("orientationchange", _.handlers.onOrientationChange);
    }
    if (_.checkBreakpointsDebounced && typeof _.checkBreakpointsDebounced.cancel === "function")
      _.checkBreakpointsDebounced.cancel();
    _.ctx = null;
    _.handlers = null;
    _.checkBreakpointsDebounced = null;
    _.userOptionsElement = null;
    _.defaultOptions = null;
    _.userOptions = null;
    _.currentBreakpoint = null;
    _.breakpointSource = null;
  }
  /**
   * Updates user options (programmatic API), merges, and checks breakpoints
   * @param {object} newOptions - New user-supplied options
   * @returns {OptionsManager}
   */
  setUserOptions(newOptions = {}) {
    const _ = this;
    _.userOptions = _.ctx.utils.deepMerge(_.userOptions, newOptions);
    _.currentBreakpoint = _.getCurrentBreakpoint();
    _.applyMergedOptions();
    return _;
  }
  /**
   * Loads user-supplied options from a DOM element (if present)
   */
  loadUserOptions() {
    const _ = this;
    if (!_.userOptionsElement) return;
    let txt = _.userOptionsElement.textContent || "";
    txt = txt.replace(/\n/g, "").trim();
    txt = txt.replace(
      /([{,]\s*)([A-Za-z_$][\w$]*)\s*:(?=(?:[^"\\]|\\.|"(?:[^"\\]|\\.)*")*$)/g,
      '$1"$2":'
    );
    txt = txt.replace(/,\s*([}\]])(?=(?:[^"\\]|\\.|"(?:[^"\\]|\\.)*")*$)/g, "$1");
    try {
      _.userOptions = JSON.parse(txt);
    } catch (err) {
      console.error("tarot options: failed to parse data-tarot-options json", err);
    }
  }
  /**
   * Resolves the configured breakpointElement ('window' | 'viewport') from base
   * options (defaults + plugin defaults + user options). This is intentionally a
   * base-only, load-time value — per-breakpoint overrides cannot change which
   * element is measured or which event source triggers re-evaluation.
   * @returns {string}
   */
  resolveBreakpointElement() {
    const _ = this;
    const pluginDefaults = _.ctx.getPluginDefaults?.() || {};
    let baseOptions = _.ctx.utils.deepMerge(_.defaultOptions, pluginDefaults);
    baseOptions = _.ctx.utils.deepMerge(baseOptions, _.userOptions);
    return baseOptions.breakpointElement;
  }
  /**
   * Computes which breakpoint applies based on the current measured width
   * @returns {{ minWidth:number, options:object }}
   */
  getCurrentBreakpoint() {
    const _ = this;
    const { breakpoints = {} } = _.userOptions;
    let currentWidth;
    if (_.resolveBreakpointElement() === "viewport" && _.ctx.viewport)
      currentWidth = _.ctx.viewport.offsetWidth;
    else currentWidth = window.innerWidth;
    if (!breakpoints || typeof breakpoints !== "object")
      return {
        minWidth: 0,
        options: {},
      };
    const breakpointWidths = Object.keys(breakpoints)
      .map(Number)
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => a - b);
    let matchingBreakpointWidth = 0;
    for (let i = 0; i < breakpointWidths.length; i++) {
      const breakpointWidth = breakpointWidths[i];
      if (currentWidth >= breakpointWidth) matchingBreakpointWidth = breakpointWidth;
      else break;
    }
    return {
      minWidth: matchingBreakpointWidth,
      options: breakpoints[matchingBreakpointWidth] || {},
    };
  }
  /**
   * Checks if breakpoint has changed, applies merged options if so
   */
  checkBreakpoints() {
    const _ = this;
    const active = _.getCurrentBreakpoint();
    if (active.minWidth === _.currentBreakpoint.minWidth) return;
    _.currentBreakpoint = active;
    _.applyMergedOptions();
  }
  /**
   * Merges default, user, and active breakpoint options and writes to data store
   */
  applyMergedOptions() {
    const _ = this;
    const { breakpoints: _bp, rules: _ur, ...userBase } = _.userOptions;
    const { rules: _br, ...bpBase } = _.currentBreakpoint.options || {};
    const pluginDefaults = _.ctx.getPluginDefaults?.() || {};
    let merged = _.ctx.utils.deepMerge(_.defaultOptions, pluginDefaults);
    merged = _.ctx.utils.deepMerge(merged, userBase);
    merged = _.ctx.utils.deepMerge(merged, bpBase);
    delete merged.breakpoints;
    const effectClass = _.ctx.getEffectClass?.(merged.effect);
    if (effectClass?.rules)
      merged.rules = {
        ...merged.rules,
        ...effectClass.rules,
      };
    if (merged.slidesPerView < 1) merged.slidesPerView = 1;
    const { minSlidesPerView, maxSlidesPerView } = merged.rules;
    merged.slidesPerView = Math.max(
      minSlidesPerView,
      Math.min(maxSlidesPerView, merged.slidesPerView)
    );
    if (merged.slidesPerMove === "auto") merged.slidesPerMove = Math.floor(merged.slidesPerView);
    _.ctx.store.setOptions(merged);
  }
};
//#endregion
//#region src/scripts/core/slide-manager.js
/**
 * @class SlideManager
 * manages slides in a carousel including slide creation, selection, filtering, and dom updates
 */
var SlideManager = class {
  /**
   * @constructor
   * @param {Object} ctx - shared module context containing emitter, events, store, etc.
   */
  constructor(ctx) {
    const _ = this;
    _.ctx = ctx;
    _.allSlides = null;
    _.observer = null;
    _.handlers = {
      selectedIndexChanged: ({ currentIndex }) => {
        _.updateSelectedIndex(currentIndex);
      },
      debouncedSlideRefresh: _.ctx.utils.debounce(() => {
        _.reInit();
      }, 4),
    };
    _.init();
  }
  init() {
    this.loadSlides();
    this.bindEvents();
    this.updateSelectedIndex(this.ctx.store.getState().selectedIndex);
  }
  reInit() {
    this.loadSlides();
    this.updateSelectedIndex(this.ctx.store.getState().selectedIndex);
  }
  queryDOM() {
    this.allSlides = Array.from(this.ctx.track.querySelectorAll(":scope > tarot-slide"));
  }
  bindEvents() {
    const _ = this;
    _.ctx.emitter.on(_.ctx.events.store.selectedIndexChanged, _.handlers.selectedIndexChanged);
    _.observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList)
        if (mutation.type === "childList") {
          _.handlers.debouncedSlideRefresh();
          break;
        }
    });
    _.#startObserver();
  }
  /**
   * Orchestrates all slide management: wraps, queries, filters, indexes, updates state, stores
   */
  loadSlides() {
    const _ = this;
    _.observer?.disconnect();
    _.wrapSlides();
    _.queryDOM();
    const activeSlides = _.filterSlides();
    _.resetSlideIndexes(activeSlides);
    _.updateSlideStates(activeSlides);
    _.ctx.store.setSlides(activeSlides);
    _.#startObserver();
  }
  /**
   * Filters slides based on filterClass option
   * @returns {Array} Active slides that pass the filter
   */
  filterSlides() {
    const filterClass = this.ctx.store.getOptions().filterClass;
    if (!filterClass) return [...this.allSlides];
    return this.allSlides.filter((slide) => slide.classList.contains(filterClass));
  }
  /**
   * ensures all carousel children are properly wrapped in tarot-slide elements
   */
  wrapSlides() {
    Array.from(this.ctx.track.children).forEach((child) => {
      if (child.tagName.toLowerCase() !== "tarot-slide") this.wrapSlide(child);
    });
  }
  /**
   * Wraps an element in tarot-slide if not already wrapped
   * Handles both in-DOM elements (replaces in place) and new elements
   * @param {Element} element - Element to wrap
   * @returns {Element} The tarot-slide element
   */
  wrapSlide(element) {
    if (element.tagName.toLowerCase() === "tarot-slide") return element;
    const wrapper = document.createElement("tarot-slide");
    const parent = element.parentNode;
    if (parent) parent.replaceChild(wrapper, element);
    wrapper.appendChild(element);
    return wrapper;
  }
  #startObserver() {
    this.observer?.observe(this.ctx.track, {
      childList: true,
      subtree: false,
    });
  }
  resetSlideIndexes(slides) {
    for (let i = 0, n = slides.length; i < n; ++i) {
      slides[i]._renderIndex = i;
      slides[i]._index = i;
      slides[i].setAttribute("index", i);
    }
  }
  /**
   * Prepares slides for frame rendering by calculating positions and properties
   * Includes sophisticated loop positioning to prevent frame gaps during track shifts
   * Updates the slides in the datastore with fresh positioning data
   */
  prepSlidesForFrame() {
    const _ = this;
    const slides = _.ctx.store.getSlides();
    const widths = _.ctx.store.getWidths();
    const animation = _.ctx.store.getAnimation();
    const options = _.ctx.store.getOptions();
    _.updateSlidePositions(animation.trackPosition, slides, widths, options);
    const roundSubPixel = _.ctx.utils.roundSubPixel;
    for (let i = 0, n = slides.length; i < n; ++i) {
      const slide = slides[i];
      slide._trackPosition = roundSubPixel(slide._renderIndex * widths.slideAndGap);
      slide._centerPoint = roundSubPixel(slide._trackPosition + widths.slide / 2);
    }
  }
  /**
   * Update slide positions based on track position using sophisticated loop logic
   * Moved from loop-manager.js to ensure sync between track position and slide positioning
   */
  updateSlidePositions(trackPosition, slides, widths, options) {
    const _ = this;
    if (!_.ctx.store.getState().canLoop) {
      _.resetAllSlides(slides);
      return;
    }
    const loopBuffer = options.rules.loopBuffer;
    const viewportWidth = widths.viewport;
    const slideWidth = widths.slide;
    const slideAndGapWidth = slideWidth + widths.gap;
    const halfSlideWidth = slideWidth / 2;
    const viewportStart = -trackPosition;
    const viewportEnd = viewportStart + viewportWidth;
    const viewportCenter = viewportStart + viewportWidth / 2;
    const visibleIndices = /* @__PURE__ */ new Set();
    const firstIndex = Math.floor(viewportStart / slideAndGapWidth) - 2;
    const lastIndex = Math.ceil(viewportEnd / slideAndGapWidth) + 2;
    for (let i = firstIndex; i <= lastIndex; i++) {
      const slideStart = i * slideAndGapWidth;
      if (slideStart + slideWidth > viewportStart && slideStart < viewportEnd)
        visibleIndices.add(i);
    }
    if (visibleIndices.size > 0) {
      const indices = Array.from(visibleIndices);
      const minIndex = Math.min(...indices);
      const maxIndex = Math.max(...indices);
      for (let i = 1; i <= loopBuffer.left; i++) visibleIndices.add(minIndex - i);
      for (let i = 1; i <= loopBuffer.right; i++) visibleIndices.add(maxIndex + i);
    }
    const slideCount = slides.length;
    const usedSlides = /* @__PURE__ */ new Set();
    for (const idx of visibleIndices) {
      const slideIndex = ((idx % slideCount) + slideCount) % slideCount;
      usedSlides.add(slideIndex);
    }
    if (usedSlides.size < slideCount) {
      const indices = Array.from(visibleIndices);
      if (indices.length > 0) {
        const minIndex = Math.min(...indices);
        const maxIndex = Math.max(...indices);
        const remaining = slideCount - usedSlides.size;
        const leftToAdd = Math.floor(remaining / 2);
        const rightToAdd = remaining - leftToAdd;
        for (let i = 1; i <= leftToAdd; i++) visibleIndices.add(minIndex - i);
        for (let i = 1; i <= rightToAdd; i++) visibleIndices.add(maxIndex + i);
      }
    }
    if (visibleIndices.size > slideCount) {
      const sortedPositions = Array.from(visibleIndices).sort((a, b) => {
        const centerA = a * slideAndGapWidth + halfSlideWidth;
        const centerB = b * slideAndGapWidth + halfSlideWidth;
        return Math.abs(centerA - viewportCenter) - Math.abs(centerB - viewportCenter);
      });
      visibleIndices.clear();
      for (let i = 0; i < slideCount; i++) visibleIndices.add(sortedPositions[i]);
    }
    const assignments = /* @__PURE__ */ new Map();
    for (const logicalIndex of visibleIndices) {
      const slideIndex = ((logicalIndex % slideCount) + slideCount) % slideCount;
      assignments.set(slides[slideIndex], logicalIndex);
    }
    for (const slide of slides) {
      const targetIndex = assignments.get(slide);
      if (targetIndex !== void 0) slide._renderIndex = targetIndex;
    }
  }
  /**
   * Reset all slides to their natural indices (no looping)
   */
  resetAllSlides(slides) {
    for (let i = 0; i < slides.length; i++) slides[i]._renderIndex = i;
  }
  /**
   * Updates DOM state attributes on slides
   * @param {Array} activeSlides - Slides that should be active
   */
  updateSlideStates(activeSlides) {
    const activeSet = new Set(activeSlides);
    this.allSlides.forEach((slide) => {
      if (activeSet.has(slide)) slide.setAttribute("state", "active");
      else slide.setAttribute("state", "disabled");
    });
  }
  addSlide(element, index) {
    const _ = this;
    let el = element;
    if (typeof element === "string") {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = element.trim();
      el = tempDiv.firstChild;
    }
    const newSlide = _.wrapSlide(el);
    const currentSlides = _.ctx.store.getSlides();
    if (typeof index === "number" && index >= 0 && index < currentSlides.length)
      _.ctx.track.insertBefore(newSlide, currentSlides[index]);
    else _.ctx.track.appendChild(newSlide);
  }
  removeSlide(index) {
    const activeSlides = this.ctx.store.getSlides();
    if (index < 0 || index >= activeSlides.length) return;
    activeSlides[index].remove();
  }
  /**
   * Updates _selected property on slide objects (not DOM)
   * @param {number} newIndex - The newly selected index
   */
  updateSelectedIndex(newIndex) {
    const slides = this.ctx.store.getSlides();
    for (let i = 0, n = slides.length; i < n; ++i)
      slides[i]._selected = slides[i]._index === newIndex;
  }
  destroy() {
    const _ = this;
    _.ctx.emitter.off(_.ctx.events.store.selectedIndexChanged, _.handlers.selectedIndexChanged);
    if (_.observer) {
      _.observer.disconnect();
      _.observer = null;
    }
    if (_.handlers.debouncedSlideRefresh?.cancel) _.handlers.debouncedSlideRefresh.cancel();
    _.allSlides = null;
  }
};
//#endregion
//#region src/scripts/core/lib/physics-engine.js
var PhysicsEngine = class {
  #attraction;
  #frictionFactor;
  #velocityBoost;
  #velocity;
  #currentValue;
  #targetValue;
  #startValue;
  #isAnimating;
  #prevTime;
  #eventEmitter;
  #animationId;
  /**
   * creates an instance of physicsengine.
   * @param {number} [attraction=0.026] - the attraction value for physics-based animation (0 < attraction < 1).
   * @param {number} [friction=0.28] - the friction value for physics-based animation (0 < friction < 1).
   * @param {number} [velocityBoost=1.4] - multiplier applied to initial velocity for snappier response.
   */
  constructor({ attraction = 0.026, friction = 0.28, velocityBoost = 1.4 } = {}) {
    const _ = this;
    _.#validateAttraction(attraction);
    _.#validateFriction(friction);
    _.#attraction = attraction;
    _.#frictionFactor = 1 - friction;
    _.#velocityBoost = velocityBoost;
    _.#velocity = 0;
    _.#currentValue = 0;
    _.#targetValue = 0;
    _.#startValue = 0;
    _.#isAnimating = false;
    _.#prevTime = null;
    _.#animationId = 0;
    _.#eventEmitter = new EventEmitter();
  }
  /**
   * animates from a start value to an end value.
   * @param {number} startValue - the starting value.
   * @param {number} endValue - the target value.
   * @param {number} initialVelocity - the initial velocity.
   */
  animateTo(startValue, endValue, initialVelocity) {
    const _ = this;
    if (_.#isAnimating) _.stop();
    if (isNaN(endValue)) {
      console.warn(`PhysicsEngine.animateTo: endValue is NaN (received: ${endValue})`);
      return;
    }
    ++_.#animationId;
    initialVelocity *= _.#velocityBoost;
    _.#startValue = startValue;
    _.#currentValue = startValue;
    _.#targetValue = endValue;
    _.#velocity = initialVelocity;
    _.#isAnimating = true;
    _.#prevTime = null;
    _.#eventEmitter.emit("engine:position-changed", {
      position: _.#currentValue,
      positionDelta: 0,
      progress: 0,
      velocity: _.#velocity,
    });
  }
  /**
   * Advances the physics simulation by one frame.
   * Called externally by the frame engine to sync with main render loop.
   * @param {number} time - the timestamp from the frame engine
   */
  tick(time) {
    const _ = this;
    if (!_.#isAnimating) return;
    let timeDelta = _.#prevTime == null ? 8.33 : time - _.#prevTime;
    _.#prevTime = time;
    timeDelta = Math.max(0, Math.min(timeDelta, 100));
    const timeFactor = timeDelta / 16.67;
    const displacement = _.#targetValue - _.#currentValue;
    const force = displacement * _.#attraction;
    _.#velocity += force * timeFactor;
    _.#velocity *= Math.pow(_.#frictionFactor, timeFactor);
    const posDelta = _.#velocity * timeFactor;
    _.#currentValue += posDelta;
    const totalDistance = _.#targetValue - _.#startValue;
    const distanceCovered = _.#currentValue - _.#startValue;
    const progress = totalDistance !== 0 ? distanceCovered / totalDistance : 0;
    if (Math.abs(posDelta) < 0.01 && Math.abs(displacement) < 0.1) {
      _.#isAnimating = false;
      _.#currentValue = _.#targetValue;
      _.#eventEmitter.emit("engine:position-changed", {
        position: _.#currentValue,
        positionDelta: 0,
        progress: 1,
        velocity: 0,
      });
      _.#eventEmitter.emit("engine:finished");
      return;
    }
    _.#eventEmitter.emit("engine:position-changed", {
      position: _.#currentValue,
      positionDelta: posDelta,
      progress,
      velocity: _.#velocity,
    });
  }
  /**
   * stops the ongoing animation immediately.
   */
  stop() {
    this.#isAnimating = false;
  }
  /**
   * returns whether we are currently animating.
   * @returns {boolean}
   */
  isAnimating() {
    return this.#isAnimating;
  }
  /**
   * sets the attraction value
   * @param {number} attraction - must be a number between 0 and 1 (exclusive).
   */
  setAttraction(attraction) {
    this.#validateAttraction(attraction);
    this.#attraction = attraction;
  }
  /**
   * sets the friction value
   * @param {number} friction - must be a number between 0 and 1 (exclusive).
   */
  setFriction(friction) {
    this.#validateFriction(friction);
    this.#frictionFactor = 1 - friction;
  }
  /**
   * sets the velocity boost multiplier.
   * @param {number} velocityBoost - multiplier for initial velocity.
   */
  setVelocityBoost(velocityBoost) {
    this.#velocityBoost = velocityBoost;
  }
  /**
   * adds an event listener for the specified event.
   * @param {string} eventName - the name of the event.
   * @param {function} eventFunction - the function to call when the event is triggered.
   */
  on(eventName, eventFunction) {
    this.#eventEmitter.on(eventName, eventFunction);
  }
  /**
   * remove an event listener for the specified event.
   * @param {string} eventName - the name of the event.
   * @param {function} eventFunction - the function to remove
   */
  off(eventName, eventFunction) {
    this.#eventEmitter.off(eventName, eventFunction);
  }
  #validateAttraction(attraction) {
    if (typeof attraction !== "number" || attraction <= 0 || attraction >= 1)
      throw new Error("Attraction must be a number between 0 and 1 (exclusive).");
  }
  #validateFriction(friction) {
    if (typeof friction !== "number" || friction <= 0 || friction >= 1)
      throw new Error("Friction must be a number between 0 and 1 (exclusive).");
  }
  destroy() {
    this.stop();
    this.#eventEmitter.destroy();
    this.#eventEmitter = null;
  }
};
//#endregion
//#region src/scripts/core/lib/momentum-engine.js
/**
 * MomentumEngine - Pure friction-based physics for free scroll
 *
 * Unlike PhysicsEngine (damped spring with target), this just applies
 * friction decay with no attraction. Used for free scroll modes.
 *
 * TrackAnimator reads position/velocity directly to check for gear shifts.
 * No events needed - keeping it simple.
 */
var MomentumEngine = class {
  #position = 0;
  #velocity = 0;
  #friction;
  #prevTime = null;
  #isRunning = false;
  /**
   * @param {Object} options
   * @param {number} [options.friction=0.98] - Friction coefficient (0-1). Higher = more slippery.
   * @throws {RangeError} If friction is not between 0 and 1 (exclusive)
   */
  constructor({ friction = 0.98 } = {}) {
    if (friction <= 0 || friction >= 1)
      throw new RangeError("Friction must be between 0 and 1 (exclusive)");
    this.#friction = friction;
  }
  /**
   * Start momentum animation from position with initial velocity
   * @param {number} position - Starting position
   * @param {number} velocity - Initial velocity
   */
  start(position, velocity) {
    const _ = this;
    _.#position = position;
    _.#velocity = velocity;
    _.#prevTime = null;
    _.#isRunning = true;
  }
  /**
   * Advance physics by one frame
   * Called by TrackAnimator when momentum gear is engaged
   * @param {number} time - Timestamp from frame engine
   */
  tick(time) {
    if (!this.#isRunning) return;
    let timeDelta = this.#prevTime == null ? 16.67 : time - this.#prevTime;
    this.#prevTime = time;
    timeDelta = Math.max(0, Math.min(timeDelta, 100));
    const timeFactor = timeDelta / 16.67;
    this.#velocity *= Math.pow(this.#friction, timeFactor);
    this.#position += this.#velocity * timeFactor;
  }
  /**
   * Update position directly (used when track shifts for looping)
   * @param {number} delta - Amount to add to position
   */
  shiftPosition(delta) {
    this.#position += delta;
  }
  /**
   * Stop immediately (used when shifting to physics gear or stopping)
   */
  stop() {
    this.#velocity = 0;
    this.#isRunning = false;
  }
  /**
   * Set friction coefficient
   * Invalid values are rejected (kept at current friction) rather than thrown —
   * an options change at runtime must never NaN-poison a live physics loop.
   * @param {number} friction - Value between 0 and 1 (exclusive)
   */
  setFriction(friction) {
    if (typeof friction !== "number" || friction <= 0 || friction >= 1) return;
    this.#friction = friction;
  }
  get position() {
    return this.#position;
  }
  get velocity() {
    return this.#velocity;
  }
  get isRunning() {
    return this.#isRunning;
  }
};
//#endregion
//#region src/scripts/core/lib/settle-engine.js
/**
 * SettleEngine - Adaptive friction for iOS-like snap-to-settling
 *
 * Uses adaptive friction to curve smoothly into snap position.
 * Primarily decelerating with tiny attraction near target for clean landing.
 *
 * Algorithm: Each frame, calculate exact friction needed to land on target.
 * Add small attraction force when close to ensure we reach the snap point.
 */
var SettleEngine = class {
  #position = 0;
  #velocity = 0;
  #targetPosition = 0;
  #startPosition = 0;
  #effectiveFriction = 0.92;
  #attraction = 0.002;
  #prevTime = null;
  #isRunning = false;
  #eventEmitter;
  constructor() {
    this.#eventEmitter = new EventEmitter();
  }
  /**
   * Start settling animation toward target position
   * @param {number} position - Current position
   * @param {number} velocity - Current velocity (from momentum engine)
   * @param {number} targetPosition - Target snap position
   */
  start(position, velocity, targetPosition) {
    const _ = this;
    _.#position = position;
    _.#startPosition = position;
    _.#targetPosition = targetPosition;
    _.#prevTime = null;
    _.#isRunning = true;
    const direction = Math.sign(targetPosition - position);
    const minVelocity = 3;
    if (Math.abs(velocity) < minVelocity || Math.sign(velocity) !== direction)
      velocity = direction * minVelocity;
    _.#velocity = velocity;
    _.#eventEmitter.emit("engine:position-changed", {
      position: _.#position,
      positionDelta: 0,
      progress: 0,
      velocity: _.#velocity,
    });
  }
  /**
   * Advance physics by one frame
   * @param {number} time - Timestamp from frame engine
   */
  tick(time) {
    const _ = this;
    if (!_.#isRunning) return;
    let timeDelta = _.#prevTime == null ? 16.67 : time - _.#prevTime;
    _.#prevTime = time;
    timeDelta = Math.min(timeDelta, 100);
    const timeFactor = timeDelta / 16.67;
    const remainingDistance = _.#targetPosition - _.#position;
    const absVelocity = Math.abs(_.#velocity);
    const absRemaining = Math.abs(remainingDistance);
    if (absRemaining < 0.2) {
      _.#position = _.#targetPosition;
      _.#velocity = 0;
      _.#isRunning = false;
      _.#eventEmitter.emit("engine:position-changed", {
        position: _.#position,
        positionDelta: 0,
        progress: 1,
        velocity: 0,
      });
      _.#eventEmitter.emit("engine:finished");
      return;
    }
    _.#effectiveFriction = absRemaining / (absVelocity + absRemaining);
    _.#velocity *= Math.pow(_.#effectiveFriction, timeFactor);
    if (absRemaining < 340) {
      const attractionForce = remainingDistance * _.#attraction * timeFactor;
      _.#velocity += attractionForce;
    }
    const velocitySign = Math.sign(_.#velocity);
    const targetSign = Math.sign(remainingDistance);
    if (velocitySign !== 0 && targetSign !== 0 && velocitySign !== targetSign) _.#velocity *= 0.5;
    const posDelta = _.#velocity * timeFactor;
    _.#position += posDelta;
    const newRemaining = _.#targetPosition - _.#position;
    if (Math.sign(newRemaining) !== Math.sign(remainingDistance) && absRemaining > 1) {
      _.#position = _.#targetPosition;
      _.#velocity = 0;
      _.#isRunning = false;
      _.#eventEmitter.emit("engine:position-changed", {
        position: _.#position,
        positionDelta: 0,
        progress: 1,
        velocity: 0,
      });
      _.#eventEmitter.emit("engine:finished");
      return;
    }
    const totalDistance = Math.abs(_.#targetPosition - _.#startPosition);
    const progress =
      totalDistance > 0
        ? Math.min(0.999, Math.abs(_.#position - _.#startPosition) / totalDistance)
        : 0;
    _.#eventEmitter.emit("engine:position-changed", {
      position: _.#position,
      positionDelta: posDelta,
      progress,
      velocity: _.#velocity,
    });
  }
  /**
   * Update position directly (used when track shifts for looping)
   * @param {number} delta - Amount to add to position
   */
  shiftPosition(delta) {
    this.#position += delta;
    this.#startPosition += delta;
    this.#targetPosition += delta;
  }
  /**
   * Stop immediately
   */
  stop() {
    this.#velocity = 0;
    this.#isRunning = false;
  }
  get position() {
    return this.#position;
  }
  get velocity() {
    return this.#velocity;
  }
  get isRunning() {
    return this.#isRunning;
  }
  /**
   * Add event listener
   * @param {string} eventName - Event name
   * @param {function} eventFunction - Handler function
   */
  on(eventName, eventFunction) {
    this.#eventEmitter.on(eventName, eventFunction);
  }
  /**
   * Remove event listener
   * @param {string} eventName - Event name
   * @param {function} eventFunction - Handler function
   */
  off(eventName, eventFunction) {
    this.#eventEmitter.off(eventName, eventFunction);
  }
  destroy() {
    this.stop();
    this.#eventEmitter.destroy();
    this.#eventEmitter = null;
  }
};
//#endregion
//#region src/scripts/core/utils/metrics.js
/**
 * Track position calculation utilities
 * Pure functions for converting between slide indices and track positions
 */
/**
 * Convert slide index to track position
 * @param {number} slideIndex - The index of the slide
 * @param {Object} widths - Width measurements from store
 * @param {Object} options - Carousel options from store
 * @param {Object} state - Carousel state from store
 * @returns {number} The position on the track (negative for transform)
 */
function getTrackPosForIndex(slideIndex, widths, options, state) {
  if (widths.centerOffset > 0) return widths.paddingLeft + widths.centerOffset;
  const slidePos = slideIndex * (widths.slide + widths.gap);
  let pos;
  if (options.centerSelectedSlide) pos = slidePos - widths.viewport / 2 + widths.slide / 2;
  else pos = slidePos - widths.paddingLeft;
  if (!state.canLoop) {
    const minPos = -widths.paddingLeft;
    const maxPos = widths.track - widths.viewport - widths.gap + widths.paddingRight;
    pos = Math.max(minPos, Math.min(pos, maxPos));
  }
  return pos !== 0 ? -pos : 0;
}
/**
 * Convert track position to slide index (inverse of getTrackPosForIndex)
 * @param {number} trackPosition - Current track position (negative for transform)
 * @param {Object} widths - Width measurements from store
 * @param {Object} options - Carousel options from store
 * @param {number} [velocity=0] - Current velocity for tie-breaking
 * @param {number} [slideCount=Infinity] - Total number of slides for clamping
 * @returns {number} The nearest slide index
 */
function getIndexForTrackPos(trackPosition, widths, options, velocity = 0, slideCount = Infinity) {
  const slideAndGap = widths.slide + widths.gap;
  if (slideAndGap <= 0) return 0;
  if (widths.centerOffset > 0) return 0;
  let absPos = Math.abs(trackPosition);
  if (options.centerSelectedSlide) absPos = absPos + widths.viewport / 2 - widths.slide / 2;
  else absPos = absPos + widths.paddingLeft;
  const rawIndex = absPos / slideAndGap;
  let index;
  const fractionalPart = rawIndex - Math.floor(rawIndex);
  if (velocity !== 0 && Math.abs(fractionalPart - 0.5) < 0.01)
    index = velocity < 0 ? Math.ceil(rawIndex) : Math.floor(rawIndex);
  else index = Math.round(rawIndex);
  return Math.max(0, Math.min(index, slideCount - 1));
}
//#endregion
//#region src/scripts/core/track-animator.js
var SNAP_THRESHOLD = 14;
var STOP_THRESHOLD = 0.01;
var TrackAnimator = class {
  #currentPos = 0;
  #dragStartPos = 0;
  #minVelocity = 0;
  #targetPos = 0;
  #movementType = "";
  #direction = 0;
  #isDriving = false;
  #driveMovementType = "scroll";
  #activeEngine = null;
  #momentumEngine = null;
  #settleEngine = null;
  /**
   * @param {Object} ctx - The context object containing carousel references and services
   */
  constructor(ctx) {
    const _ = this;
    _.ctx = ctx;
    const emitter = ctx.emitter;
    const options = _.ctx.store.getOptions();
    _.engine = new PhysicsEngine({
      attraction: options.animation.attraction,
      friction: options.animation.friction,
      velocityBoost: options.animation.velocityBoost,
    });
    _.#momentumEngine = new MomentumEngine({ friction: options.animation.freeScrollFriction });
    _.#settleEngine = new SettleEngine();
    _.#dragStartPos = 1;
    _.handlers = {
      optionsChanged: ({ currentOptions }) => {
        _.engine.setAttraction(currentOptions.animation?.attraction || 0.026);
        _.engine.setFriction(currentOptions.animation?.friction || 0.24);
        _.engine.setVelocityBoost(currentOptions.animation?.velocityBoost || 1.4);
        _.#momentumEngine.setFriction(currentOptions.animation?.freeScrollFriction ?? 0.96);
      },
      settlePositionChanged: ({ position, positionDelta, progress, velocity }) => {
        if (progress === 1) _.setPos(position, progress, velocity, "settle", _.#direction);
        else _.setPos(_.#currentPos + positionDelta, progress, velocity, "settle", _.#direction);
      },
      settleFinished: () => {
        _.#activeEngine = null;
        _.#emitMovementCompleted("settle");
      },
      dragStart: ({ event, drag }) => {
        _.stop();
        _.#dragStartPos = _.#currentPos;
        emitter.emit(_.ctx.events.user.interacted, {
          via: "drag",
          event,
        });
      },
      dragMove: ({ event, drag }) => {
        _.setPos(_.#dragStartPos + drag.delta, 1, null, "drag", 0);
        emitter.emit(_.ctx.events.user.interacted, {
          via: "drag",
          event,
        });
      },
      dragEnd: ({ event, drag }) => {
        emitter.emit(_.ctx.events.user.interacted, {
          via: "drag",
          event,
        });
        const options = _.ctx.store.getOptions();
        if (Math.abs(drag.delta) < options.dragThreshold) {
          _.ctx.commands.settleTrack();
          return;
        }
        if (options.snap === "page")
          if (drag.delta < 0) _.ctx.commands.next(drag.velocity);
          else _.ctx.commands.previous(drag.velocity);
        else _.startMomentum(_.#currentPos, drag.velocity * 1.3);
      },
      enginePositionChanged: ({ position, positionDelta, progress, velocity }) => {
        if (progress === 1)
          _.setPos(_.#targetPos, progress, velocity, _.#movementType, _.#direction);
        else
          _.setPos(
            _.#currentPos + positionDelta,
            progress,
            velocity,
            _.#movementType,
            _.#direction
          );
      },
      engineMovementFinished: () => {
        _.#activeEngine = null;
        _.#emitMovementCompleted(_.#movementType);
      },
      requestTrackFrame: ({ time }) => {
        if (_.#activeEngine === _.#momentumEngine) {
          _.#momentumEngine.tick(time);
          const position = _.#momentumEngine.position;
          _.setPos(position, 0, _.#momentumEngine.velocity, "momentum", 0);
          _.#checkMomentumTransition();
        } else if (_.#activeEngine === _.#settleEngine) _.#settleEngine.tick(time);
        else if (_.#isDriving) {
        } else if (_.#activeEngine === _.engine) _.engine.tick(time);
        else _.engine.tick(time);
      },
    };
    _.init();
  }
  init() {
    this.bindEvents();
  }
  bindEvents() {
    const _ = this;
    const { emitter, events } = _.ctx;
    emitter.on(events.store.optionsChanged, _.handlers.optionsChanged);
    emitter.on(events.drag.start, _.handlers.dragStart);
    emitter.on(events.drag.move, _.handlers.dragMove);
    emitter.on(events.drag.end, _.handlers.dragEnd);
    emitter.on(events.track.requestFrame, _.handlers.requestTrackFrame);
    _.engine.on("engine:position-changed", _.handlers.enginePositionChanged);
    _.engine.on("engine:finished", _.handlers.engineMovementFinished);
    _.#settleEngine.on("engine:position-changed", _.handlers.settlePositionChanged);
    _.#settleEngine.on("engine:finished", _.handlers.settleFinished);
  }
  get currentPos() {
    return this.#currentPos;
  }
  /**
   * Sync renderIndex and pageIndex from a track position
   * Used by driveTrackPosition and momentum to keep indices current
   * @param {number} position - Current track position (post-shift)
   * @param {number} [velocity=0] - Current velocity for direction bias
   */
  syncIndicesFromPosition(position, velocity = 0) {
    const _ = this;
    const state = _.ctx.store.getState();
    const widths = _.ctx.store.getWidths();
    const options = _.ctx.store.getOptions();
    const currentIndex = getIndexForTrackPos(position, widths, options, velocity, state.slideCount);
    const slidesPerMove = options.slidesPerMove || 1;
    const currentPageIndex = Math.max(
      0,
      Math.min(Math.floor(currentIndex / slidesPerMove), state.pageCount - 1)
    );
    if (currentIndex !== state.renderIndex || currentPageIndex !== state.pageIndex)
      _.ctx.store.setState({
        renderIndex: currentIndex,
        pageIndex: currentPageIndex,
      });
  }
  getIsAnimating() {
    return (
      this.engine.isAnimating() || this.#momentumEngine.isRunning || this.#settleEngine.isRunning
    );
  }
  stop() {
    const _ = this;
    _.#isDriving = false;
    _.engine.stop();
    _.#momentumEngine.stop();
    _.#settleEngine.stop();
    _.#activeEngine = null;
  }
  goToPosition(targetPos, velocity, movementType, direction = 0) {
    const _ = this;
    if (movementType !== "jump" && _.engine.isAnimating() && _.#targetPos === targetPos) return;
    _.stop();
    _.#movementType = movementType;
    _.#direction = direction;
    if (movementType === "jump") {
      _.#emitMovementStarted(0, "jump");
      _.setPos(targetPos, 1, 0, "jump", direction);
      _.#emitMovementCompleted("jump");
      return;
    }
    if (!velocity)
      if (targetPos < _.#currentPos) velocity = _.#minVelocity * -1;
      else velocity = _.#minVelocity;
    _.#targetPos = targetPos;
    _.engine.animateTo(_.#currentPos, targetPos, velocity);
    _.#emitMovementStarted(velocity, movementType);
  }
  setPos(newPosition, progress, velocity = 0, movementType, direction = null) {
    const _ = this;
    let trackDelta = newPosition - _.#currentPos;
    if (movementType !== "drag" && movementType !== "scroll" && progress === 1) trackDelta = 0;
    _.#currentPos = newPosition;
    if (_.ctx.store.getState().canLoop) {
      const trackWidth = _.ctx.store.getWidths().track;
      if (_.#currentPos > 0) _.shiftTrack("forwards");
      else if (_.#currentPos <= -trackWidth) _.shiftTrack("backwards");
    }
    _.ctx.store.setAnimation({
      movementType,
      trackPosition: _.#currentPos,
      trackDelta,
      velocity,
      progress,
      isAnimating: _.getIsAnimating(),
      direction: direction !== null ? direction : _.#direction,
    });
  }
  shiftTrack(direction = 1) {
    const _ = this;
    const trackWidth = _.ctx.store.getWidths().track;
    let value;
    if (direction === "forwards") value = -1;
    else if (direction === "backwards") value = 1;
    else value = direction;
    const shiftAmount = trackWidth * value;
    _.#currentPos += shiftAmount;
    _.#dragStartPos += shiftAmount;
    _.#targetPos += shiftAmount;
    if (_.#activeEngine === _.#momentumEngine && _.#momentumEngine.isRunning)
      _.#momentumEngine.shiftPosition(shiftAmount);
    else if (_.#activeEngine === _.#settleEngine && _.#settleEngine.isRunning)
      _.#settleEngine.shiftPosition(shiftAmount);
    _.ctx.emitter.emit(_.ctx.events.track.shifted, {
      trackPosition: _.#currentPos,
      movementType: "shift",
    });
  }
  /**
   * Engage momentum gear - for free scroll drag end
   * @param {number} position - Current track position
   * @param {number} velocity - Initial velocity from drag
   */
  startMomentum(position, velocity) {
    const _ = this;
    _.stop();
    _.#momentumEngine.start(position, velocity);
    _.#activeEngine = _.#momentumEngine;
    _.#movementType = "momentum";
    _.setPos(position, 0, velocity, "momentum", 0);
    _.#emitMovementStarted(velocity, "momentum");
  }
  /**
   * Drive track position — self-contained, no session management.
   * Plugins describe intent (deltaPx or positionPercent), core handles positioning.
   * Auto-engages on first call, auto-disengages when stop() is called or movementType is 'settle'.
   * @param {Object} params
   * @param {number} [params.deltaPx] - Relative pixel movement ("move by N px this frame")
   * @param {number} [params.positionPercent] - Absolute 0-1 track position
   * @param {number} [params.velocity=0] - Current velocity for direction bias
   * @param {string} [params.movementType='scroll'] - Movement type ('scroll' or 'settle')
   */
  drivePosition({ deltaPx, positionPercent, velocity = 0, movementType = "scroll" }) {
    const _ = this;
    if (movementType === "settle") {
      _.#isDriving = false;
      _.ctx.commands.settleTrack();
      return;
    }
    let position;
    if (deltaPx !== void 0) position = _.#currentPos + deltaPx;
    else if (positionPercent !== void 0) position = _.#resolvePercentToPosition(positionPercent);
    else return;
    if (!_.#isDriving) {
      _.stop();
      _.#isDriving = true;
      _.#driveMovementType = movementType;
    }
    const direction = velocity !== 0 ? Math.sign(velocity) : Math.sign(position - _.#currentPos);
    _.setPos(position, 1, velocity, _.#driveMovementType, direction);
    _.syncIndicesFromPosition(_.#currentPos, velocity);
  }
  /**
   * Resolve a 0-1 percent to an absolute track position (loop-aware)
   * @param {number} percent - 0-1 position (can overflow for loop seam transitions)
   * @returns {number} Track position in pixels
   */
  #resolvePercentToPosition(percent) {
    const state = this.ctx.store.getState();
    const widths = this.ctx.store.getWidths();
    const firstSnap = state.firstSnapPoint;
    const lastSnap = state.lastSnapPoint;
    const range = firstSnap - lastSnap;
    if (!Number.isFinite(percent) || range === 0) return firstSnap;
    if (!state.canLoop || (percent >= 0 && percent <= 1)) return firstSnap - percent * range;
    const loopRange = widths.track - Math.abs(lastSnap - firstSnap);
    if (loopRange <= 0) return firstSnap - percent * range;
    if (percent > 1) return lastSnap - (percent - 1) * loopRange;
    return firstSnap + Math.abs(percent) * loopRange;
  }
  /** @returns {boolean} Whether drive gear is currently engaged */
  /**
   * Check if momentum engine should transition to physics (snap) or stop
   * Called each frame when momentum gear is engaged
   */
  #checkMomentumTransition() {
    const _ = this;
    const velocity = _.#momentumEngine.velocity;
    let position = _.#momentumEngine.position;
    const options = _.ctx.store.getOptions();
    const widths = _.ctx.store.getWidths();
    const state = _.ctx.store.getState();
    const slideCount = state.slideCount;
    if (!state.canLoop) {
      const minPos = getTrackPosForIndex(0, widths, options, state);
      const maxPos = getTrackPosForIndex(slideCount - 1, widths, options, state);
      if (position > minPos) {
        _.#momentumEngine.stop();
        _.#activeEngine = null;
        _.syncIndicesFromPosition(minPos, 0);
        _.setPos(minPos, 1, 0, "momentum", 0);
        _.#emitMovementCompleted("momentum");
        return;
      } else if (position < maxPos) {
        _.#momentumEngine.stop();
        _.#activeEngine = null;
        _.syncIndicesFromPosition(maxPos, 0);
        _.setPos(maxPos, 1, 0, "momentum", 0);
        _.#emitMovementCompleted("momentum");
        return;
      }
    }
    if (options.snap === "slide" && Math.abs(velocity) < SNAP_THRESHOLD) {
      _.#momentumEngine.stop();
      const friction = options.animation?.freeScrollFriction || 0.96;
      const safeFriction = Math.min(friction, 0.999);
      const projectedPos = position + velocity * (safeFriction / (1 - safeFriction));
      const slideAndGap = widths.slide + widths.gap;
      if (slideAndGap <= 0) {
        _.syncIndicesFromPosition(position, 0);
        _.#activeEngine = null;
        _.setPos(position, 1, 0, "momentum", 0);
        _.#emitMovementCompleted("momentum");
        return;
      }
      let absProjectedPos = Math.abs(projectedPos);
      if (options.centerSelectedSlide)
        absProjectedPos = absProjectedPos + widths.viewport / 2 - widths.slide / 2;
      else absProjectedPos = absProjectedPos + widths.paddingLeft;
      const projectedIndex = absProjectedPos / slideAndGap;
      let targetIndex;
      if (velocity < 0) targetIndex = Math.floor(projectedIndex + 0.6);
      else targetIndex = Math.floor(projectedIndex + 0.4);
      let positionIndex = targetIndex;
      if (state.canLoop) targetIndex = ((targetIndex % slideCount) + slideCount) % slideCount;
      else {
        targetIndex = Math.max(0, Math.min(targetIndex, slideCount - 1));
        positionIndex = targetIndex;
      }
      const slidesPerMove = options.slidesPerMove || 1;
      const targetPageIndex = Math.max(
        0,
        Math.min(Math.floor(targetIndex / slidesPerMove), state.pageCount - 1)
      );
      const targetPos = getTrackPosForIndex(positionIndex, widths, options, state);
      const distanceToTarget = Math.abs(targetPos - position);
      _.ctx.store.setState({
        renderIndex: targetIndex,
        pageIndex: targetPageIndex,
      });
      _.#emitMovementCompleted("momentum");
      _.#emitMovementStarted(velocity, "settle");
      if (distanceToTarget < 5) {
        _.setPos(targetPos, 1, 0, "settle", 0);
        _.#activeEngine = null;
        _.#emitMovementCompleted("settle");
        return;
      }
      _.#targetPos = targetPos;
      _.#movementType = "settle";
      _.#settleEngine.start(position, velocity, targetPos);
      _.#activeEngine = _.#settleEngine;
    } else if (options.snap === "none" && Math.abs(velocity) < STOP_THRESHOLD) {
      _.syncIndicesFromPosition(position, velocity);
      _.#momentumEngine.stop();
      _.#activeEngine = null;
      _.setPos(position, 1, 0, "momentum", 0);
      _.#emitMovementCompleted("momentum");
    } else _.syncIndicesFromPosition(position, velocity);
  }
  #emitMovementStarted(velocity, movementType) {
    const ctx = this.ctx;
    const state = ctx.store.getState();
    ctx.emitter.emit(ctx.events.movement.started, {
      renderIndex: state.renderIndex,
      pageIndex: state.pageIndex,
      velocity,
      movementType,
    });
  }
  #emitMovementCompleted(movementType) {
    const ctx = this.ctx;
    const state = ctx.store.getState();
    ctx.emitter.emit(ctx.events.movement.completed, {
      renderIndex: state.renderIndex,
      pageIndex: state.pageIndex,
      movementType,
    });
  }
  destroy() {
    const _ = this;
    if (_.engine) {
      _.engine.off("engine:position-changed", _.handlers.enginePositionChanged);
      _.engine.off("engine:finished", _.handlers.engineMovementFinished);
      _.engine.stop();
      _.engine = null;
    }
    if (_.#momentumEngine) {
      _.#momentumEngine.stop();
      _.#momentumEngine = null;
    }
    if (_.#settleEngine) {
      _.#settleEngine.off("engine:position-changed", _.handlers.settlePositionChanged);
      _.#settleEngine.off("engine:finished", _.handlers.settleFinished);
      _.#settleEngine.destroy();
      _.#settleEngine = null;
    }
    _.#activeEngine = null;
    const { emitter, events } = _.ctx;
    emitter.off(events.store.optionsChanged, _.handlers.optionsChanged);
    emitter.off(events.drag.start, _.handlers.dragStart);
    emitter.off(events.drag.move, _.handlers.dragMove);
    emitter.off(events.drag.end, _.handlers.dragEnd);
    emitter.off(events.track.requestFrame, _.handlers.requestTrackFrame);
    _.handlers = null;
  }
};
//#endregion
//#region src/scripts/core/transition-manager.js
/**
 * Manages track transitions
 * Converts slide indexes to track positions
 * Tells animator to go to new position (via animation or jump)
 * Relays and emits events back to the carousel
 *
 **/
var TransitionManager = class {
  constructor(ctx, animator) {
    const _ = this;
    _.ctx = ctx;
    _.animator = animator;
    _.handlers = {
      movementRequested: ({ index, pageIndex, trackPosition, velocity, movementType }) => {
        if (trackPosition !== void 0) _.goToTrackPosition(trackPosition, velocity, movementType);
        else if (index !== void 0) {
          _.ctx.store.setState({
            renderIndex: index,
            pageIndex,
          });
          _.goToSlide(index, velocity, movementType);
        }
      },
    };
    _.init();
  }
  init() {
    this.bindEvents();
  }
  bindEvents() {
    const { emitter, events } = this.ctx;
    emitter.on(events.movement.requested, this.handlers.movementRequested);
  }
  goToSlide(slideIndex, velocity, movementType) {
    const _ = this;
    const widths = _.ctx.store.getWidths();
    const options = _.ctx.store.getOptions();
    const state = _.ctx.store.getState();
    _.goToTrackPosition(
      getTrackPosForIndex(slideIndex, widths, options, state),
      velocity,
      movementType
    );
  }
  goToTrackPosition(newPos, velocity, movementType) {
    const _ = this;
    if (movementType === "jump") {
      _.animator.goToPosition(newPos, 0, "jump", 0);
      return;
    }
    const currentPos = _.animator.currentPos;
    const trackWidth = _.ctx.store.getWidths().track;
    if (_.ctx.store.getState().canLoop) {
      const pageCount = _.ctx.store.getState().pageCount;
      const hasVelocity = velocity !== void 0 && velocity !== 0;
      if (pageCount <= 2 && hasVelocity) {
        const wantsForward = velocity < 0;
        if (wantsForward && newPos > currentPos) newPos -= trackWidth;
        else if (!wantsForward && newPos <= currentPos) newPos += trackWidth;
      } else {
        const posDelta = Math.abs(currentPos - newPos);
        const halfTrack = trackWidth / 2;
        if (posDelta === halfTrack) {
          if (hasVelocity) {
            if (velocity < 0 && newPos > currentPos) newPos -= trackWidth;
            else if (velocity > 0 && newPos <= currentPos) newPos += trackWidth;
          } else if (newPos > currentPos) newPos -= trackWidth;
        } else if (posDelta > halfTrack)
          if (newPos >= currentPos) newPos -= trackWidth;
          else newPos += trackWidth;
      }
    }
    if (velocity === void 0) velocity = newPos < currentPos ? -15 : 15;
    else {
      velocity *= 1.2;
      if (Math.abs(velocity) < 15) velocity *= 1.3;
    }
    let direction = 0;
    if (newPos < currentPos) direction = -1;
    else if (newPos > currentPos) direction = 1;
    _.animator.goToPosition(newPos, velocity, movementType, direction);
  }
  /**
   * Destroy the transition manager and clean up event listeners
   */
  destroy() {
    const _ = this;
    const { emitter, events } = _.ctx;
    emitter.off(events.movement.requested, _.handlers.movementRequested);
    _.ctx = null;
    _.animator = null;
    _.handlers = null;
  }
};
//#endregion
//#region src/scripts/core/window-events.js
/**
 * handles window and viewport events for the carousel
 */
var WindowEvents = class {
  /**
   * creates a new window events instance
   * @param {object} ctx - shared module context
   * @param {object} ctx.emitter
   * @param {object} ctx.events
   * @param {HTMLElement} ctx.carousel
   * @param {HTMLElement} ctx.viewport
   */
  constructor(ctx) {
    const _ = this;
    _.ctx = ctx;
    _.carousel = ctx.carousel;
    _.viewport = ctx.viewport;
    _.lastViewportWidth = null;
    _.observedWidths = /* @__PURE__ */ new WeakMap();
    _.boundsElement = null;
    _.isInsideCarousel = (e) => {
      const path = e?.composedPath?.() || [];
      if (path.length) return path.includes(_.carousel);
      return _.carousel.contains(e?.target);
    };
    _.handlers = {
      handleResize: (event) => {
        _.ctx.emitter.emit(_.ctx.events.window.resize, { event });
      },
      handleCarouselClick: (event) => {
        if (
          !event.target.matches(
            'input, select, textarea, button, a, label, [contenteditable=""], [contenteditable="true"], [tabindex]:not([tabindex="-1"])'
          )
        )
          _.carousel.focus({ preventScroll: true });
      },
      handleWindowFocus: (event) => {
        _.ctx.emitter.emit(_.ctx.events.window.hasFocus, {});
      },
      handleWindowBlur: (event) => {
        _.ctx.emitter.emit(_.ctx.events.window.lostFocus, {});
      },
      handleCarouselFocus: (event) => {
        _.ctx.emitter.emit(_.ctx.events.carousel.hasFocus, {});
        _.ctx.emitter.emit(_.ctx.events.user.interacted, {
          via: "focus",
          event,
        });
      },
      handleCarouselBlur: (event) => {
        _.ctx.emitter.emit(_.ctx.events.carousel.lostFocus, {});
      },
      handleVisibilityChange: () => {
        _.ctx.emitter.emit(_.ctx.events.window.visibilityChange, { hidden: document.hidden });
      },
      handleKeyDown: (event) => {
        _.ctx.emitter.emit(_.ctx.events.user.interacted, {
          via: "key",
          event,
        });
        if (["ArrowLeft", "ArrowRight"].includes(event.key) && event.target === _.carousel) {
          event.preventDefault();
          const direction = event.key === "ArrowLeft" ? -1 : 1;
          _.ctx.emitter.emit(_.ctx.events.keyboard.arrow, {
            direction,
            event,
          });
        }
      },
      handleWheel: (event) => {
        if (event.__tarotWheelHandled || event.__tarotWheelSeen) return;
        _.ctx.emitter.emit(_.ctx.events.user.interacted, {
          via: "wheel",
          event,
        });
      },
      unifiedResizeHandler: _.ctx.utils.debounce((event) => {
        const currentWidth = _.viewport?.clientWidth ?? window.innerWidth;
        if (
          event !== void 0 &&
          !(event instanceof ResizeObserverEntry) &&
          _.lastViewportWidth !== null &&
          currentWidth === _.lastViewportWidth
        )
          return;
        _.lastViewportWidth = currentWidth;
        _.handlers.handleResize(event);
      }, 4),
      handleOptionsChanged: ({ currentOptions, previousOptions }) => {
        if (!currentOptions) return;
        if (
          previousOptions &&
          previousOptions.visibilityBoundsElement === currentOptions.visibilityBoundsElement
        )
          return;
        _.syncBoundsObservation();
      },
    };
    _.unifiedObserver = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const w = entry?.contentRect?.width;
        if (w === void 0) continue;
        if (_.observedWidths.get(entry.target) === w) continue;
        _.observedWidths.set(entry.target, w);
        changed = true;
      }
      if (changed) _.handlers.unifiedResizeHandler(entries[0]);
    });
    _.init();
  }
  /**
   * initializes viewport observer and calls bindEvents
   */
  init() {
    const _ = this;
    if (_.viewport) _.unifiedObserver.observe(_.viewport);
    _.lastViewportWidth = _.viewport?.clientWidth ?? window.innerWidth;
    _.bindEvents();
    _.syncBoundsObservation();
  }
  /**
   * Resolves the current visibilityBoundsElement option and updates which
   * element is being observed for resize. Called on init and on options changes.
   */
  syncBoundsObservation() {
    const _ = this;
    const options = _.ctx.store.getOptions();
    const resolved = _.ctx.utils.resolveVisibilityBoundsElement(
      options.visibilityBoundsElement,
      _.carousel,
      _.viewport
    );
    if (resolved === _.boundsElement) return;
    if (_.boundsElement && _.boundsElement !== _.viewport) {
      _.unifiedObserver.unobserve(_.boundsElement);
      _.observedWidths.delete(_.boundsElement);
    }
    _.boundsElement = resolved;
    if (resolved && resolved !== _.viewport) _.unifiedObserver.observe(resolved);
    _.handlers.unifiedResizeHandler();
  }
  /**
   * binds all event listeners for window, document, and carousel
   */
  bindEvents() {
    const _ = this;
    const carousel = _.carousel;
    const handlers = _.handlers;
    window.addEventListener("resize", handlers.unifiedResizeHandler);
    window.addEventListener("orientationchange", handlers.unifiedResizeHandler);
    window.addEventListener("focus", handlers.handleWindowFocus);
    window.addEventListener("blur", handlers.handleWindowBlur);
    carousel.addEventListener("focus", handlers.handleCarouselFocus, true);
    carousel.addEventListener("blur", handlers.handleCarouselBlur, true);
    document.addEventListener("visibilitychange", handlers.handleVisibilityChange);
    carousel.addEventListener("keydown", handlers.handleKeyDown, true);
    carousel.addEventListener("wheel", handlers.handleWheel, { passive: true });
    carousel.addEventListener("click", handlers.handleCarouselClick, true);
    _.ctx.emitter.on(_.ctx.events.store.optionsChanged, handlers.handleOptionsChanged);
  }
  /**
   * cleans up events and observers
   */
  destroy() {
    const _ = this;
    window.removeEventListener("resize", _.handlers.unifiedResizeHandler);
    window.removeEventListener("orientationchange", _.handlers.unifiedResizeHandler);
    window.removeEventListener("focus", _.handlers.handleWindowFocus);
    window.removeEventListener("blur", _.handlers.handleWindowBlur);
    _.carousel.removeEventListener("focus", _.handlers.handleCarouselFocus, true);
    _.carousel.removeEventListener("blur", _.handlers.handleCarouselBlur, true);
    document.removeEventListener("visibilitychange", _.handlers.handleVisibilityChange);
    _.carousel.removeEventListener("keydown", _.handlers.handleKeyDown, true);
    _.carousel.removeEventListener("wheel", _.handlers.handleWheel, { passive: true });
    _.carousel.removeEventListener("click", _.handlers.handleCarouselClick, true);
    _.ctx.emitter.off(_.ctx.events.store.optionsChanged, _.handlers.handleOptionsChanged);
    if (_.unifiedObserver) {
      _.unifiedObserver.disconnect();
      _.unifiedObserver = null;
    }
    _.boundsElement = null;
    _.observedWidths = null;
  }
};
//#endregion
//#region src/scripts/core/slide-state-manager.js
/**
 * slide-state-manager
 * manages slide DOM state including classes, CSS custom properties, and ARIA attributes
 * - called directly by frame-engine at the end of the render pipeline
 * - updates slide visibility classes, selection state, and animation CSS variables
 * - handles accessibility attributes and keyboard navigation state
 * - coordinates slide state based on viewport position and carousel interactions
 */
var SlideStateManager = class {
  /** @type {object} shared module context */
  ctx;
  /**
   * @constructor
   * @param {object} ctx - shared module context
   * @param {object} ctx.emitter
   * @param {object} ctx.events
   * @param {HTMLElement} ctx.carousel
   * @param {HTMLElement} ctx.viewport
   * @param {import('../core/data-store.js').default} ctx.store
   */
  constructor(ctx) {
    const _ = this;
    _.ctx = ctx;
    _.#lastVisibilityInfo = /* @__PURE__ */ new Map();
    _.handlers = {
      renderIndexChanged: ({ currentIndex }) => {
        _.handleSlideNavigation(currentIndex);
      },
      visibilityChanged: ({ partiallyVisibleSlides, mostlyVisibleSlides, fullyVisibleSlides }) => {
        _.applyVisibilityClasses(partiallyVisibleSlides, mostlyVisibleSlides, fullyVisibleSlides);
      },
      optionsChanged: () => _.syncRenderMetrics(),
    };
    _.init();
  }
  /** @type {Map<HTMLElement, object>} cached visibility info per slide */
  #lastVisibilityInfo;
  /** @type {boolean} whether per-frame slide metric CSS vars are written (cached from options) */
  #renderMetrics = false;
  /**
   * initialize the slide state manager
   */
  init() {
    const _ = this;
    _.#renderMetrics = !!_.ctx.store.getOptions().renderSlideMetrics;
    _.bindEvents();
  }
  /**
   * bind event listeners
   */
  bindEvents() {
    const _ = this;
    _.ctx.emitter.on(_.ctx.events.store.renderIndexChanged, _.handlers.renderIndexChanged);
    _.ctx.emitter.on(_.ctx.events.slides.visibleChanged, _.handlers.visibilityChanged);
    _.ctx.emitter.on(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
  }
  /**
   * syncs the cached renderSlideMetrics flag from options; clears stale
   * metric CSS vars from all slides when the option is turned off
   */
  syncRenderMetrics() {
    const _ = this;
    const enabled = !!_.ctx.store.getOptions().renderSlideMetrics;
    const wasEnabled = _.#renderMetrics;
    _.#renderMetrics = enabled;
    if (wasEnabled && !enabled) {
      const slides = _.ctx.carousel.querySelectorAll("tarot-slide");
      for (const slide of slides) _.#clearSlideMetricProps(slide);
    }
  }
  /**
   * removes the per-frame metric CSS custom properties from a slide
   * @param {HTMLElement} slide - the slide element
   */
  #clearSlideMetricProps(slide) {
    slide.style.removeProperty("--tarot-visibility");
    slide.style.removeProperty("--tarot-left-visibility");
    slide.style.removeProperty("--tarot-right-visibility");
    slide.style.removeProperty("--tarot-parallax");
    slide.style.removeProperty("--tarot-parallax-visibility");
  }
  /**
   * updates visibility data per-frame: CSS custom properties and store
   * classes/ARIA are applied separately via event subscription (not per-frame)
   * @param {number|null} [trackPosition=null] - optional track position override
   */
  updateSlides(trackPosition = null) {
    const _ = this;
    if (trackPosition === null) trackPosition = _.ctx.store.getAnimation().trackPosition || 0;
    _.updateAllSlidesSelection();
    const slideInfos = _.ctx.utils.getSlidesInViewport(_.ctx, trackPosition);
    const partiallyVisibleSlides = [];
    const mostlyVisibleSlides = [];
    const fullyVisibleSlides = [];
    for (const info of slideInfos) {
      _.updateSlideProperties(info);
      _.#lastVisibilityInfo.set(info.slide, info);
      if (info.isPartiallyVisible) {
        partiallyVisibleSlides.push(info.slide);
        if (info.isMostlyVisible) {
          mostlyVisibleSlides.push(info.slide);
          if (info.isFullyVisible) fullyVisibleSlides.push(info.slide);
        }
      }
    }
    _.ctx.store.setVisibility({
      partiallyVisibleSlides,
      mostlyVisibleSlides,
      fullyVisibleSlides,
    });
  }
  /**
   * applies visibility classes and ARIA attributes (event-driven, not per-frame)
   * @param {HTMLElement[]} partiallyVisibleSlides - slides with any visibility (> 0%)
   * @param {HTMLElement[]} mostlyVisibleSlides - slides with >= 66% visibility
   * @param {HTMLElement[]} fullyVisibleSlides - slides with >= 98% visibility
   */
  applyVisibilityClasses(partiallyVisibleSlides, mostlyVisibleSlides, fullyVisibleSlides) {
    const _ = this;
    const allSlides = _.ctx.store.getSlides();
    const partiallyVisibleSet = new Set(partiallyVisibleSlides);
    const mostlyVisibleSet = new Set(mostlyVisibleSlides);
    const fullyVisibleSet = new Set(fullyVisibleSlides);
    for (const slide of allSlides) {
      const isPartiallyVisible = partiallyVisibleSet.has(slide);
      const isMostlyVisible = mostlyVisibleSet.has(slide);
      const isFullyVisible = fullyVisibleSet.has(slide);
      const visibilityPercent = _.#lastVisibilityInfo.get(slide)?.visibilityPercent ?? 0;
      slide.classList.remove(
        "tarot-hidden",
        "tarot-partially-visible",
        "tarot-mostly-visible",
        "tarot-fully-visible"
      );
      if (isFullyVisible) slide.classList.add("tarot-fully-visible");
      else if (isMostlyVisible) slide.classList.add("tarot-mostly-visible");
      else if (isPartiallyVisible) slide.classList.add("tarot-partially-visible");
      else slide.classList.add("tarot-hidden");
      _.updateSlideARIA(slide, isMostlyVisible, visibilityPercent);
      slide.inert = !isMostlyVisible;
    }
  }
  /**
   * updates CSS custom properties for a slide (per-frame for smooth animations)
   * @param {{ slide:HTMLElement, visibilityPercent:number, leftVisibility:number, rightVisibility:number, parallax:number, parallaxVisibility:number }} slideInfo
   */
  updateSlideProperties(slideInfo) {
    const {
      slide,
      visibilityPercent,
      leftVisibility,
      rightVisibility,
      parallax,
      parallaxVisibility,
    } = slideInfo;
    slide._visibility = visibilityPercent;
    if (!this.#renderMetrics) return;
    slide.style.setProperty("--tarot-visibility", visibilityPercent.toFixed(3));
    slide.style.setProperty("--tarot-left-visibility", leftVisibility.toFixed(3));
    slide.style.setProperty("--tarot-right-visibility", rightVisibility.toFixed(3));
    slide.style.setProperty("--tarot-parallax", parallax.toFixed(3));
    slide.style.setProperty("--tarot-parallax-visibility", parallaxVisibility.toFixed(3));
  }
  /**
   * updates selection state (tarot-selected class) on all slides
   */
  updateAllSlidesSelection() {
    const allSlides = this.ctx.store.getSlides();
    for (const slide of allSlides)
      if (slide._selected) slide.classList.add("tarot-selected");
      else slide.classList.remove("tarot-selected");
  }
  /**
   * updates aria attributes for a slide
   * @param {HTMLElement} slide - the slide element
   * @param {boolean} isVisible - whether the slide is visible in viewport
   * @param {number} visibilityPercent - percentage of slide visible (0..1)
   */
  updateSlideARIA(slide, isVisible, visibilityPercent) {
    const _ = this;
    slide.setAttribute("aria-hidden", String(!isVisible));
    if (!slide.hasAttribute("aria-label") && !slide.hasAttribute("aria-labelledby")) {
      const indexAttr = slide.getAttribute("index") || "0";
      const index = parseInt(indexAttr, 10) || 0;
      const total = _.ctx.store.getState().slideCount || _.ctx.store.getSlides().length || 0;
      slide.setAttribute("aria-label", `${index + 1} of ${total}`);
    }
    const renderIndex = _.ctx.store.getState().renderIndex;
    const slideIndexAttr = slide.getAttribute("index");
    if (slideIndexAttr != null && Number(slideIndexAttr) === renderIndex)
      slide.setAttribute("aria-current", "true");
    else slide.removeAttribute("aria-current");
  }
  /**
   * handles slide navigation announcements for screen readers
   * @param {number} slideIndex - the newly selected slide index
   */
  handleSlideNavigation(slideIndex) {
    const _ = this;
    if (!_.ctx.store.getOptions().announcements || !_.ctx.announcements) return;
    const total = _.ctx.store.getSlides().length;
    const announcement = `Slide ${slideIndex + 1} of ${total}`;
    _.ctx.announcements.textContent = announcement;
  }
  /** cleanup: unbind events and reset slide state */
  destroy() {
    const _ = this;
    if (_.handlers?.renderIndexChanged)
      _.ctx.emitter.off(_.ctx.events.store.renderIndexChanged, _.handlers.renderIndexChanged);
    if (_.handlers?.visibilityChanged)
      _.ctx.emitter.off(_.ctx.events.slides.visibleChanged, _.handlers.visibilityChanged);
    if (_.handlers?.optionsChanged)
      _.ctx.emitter.off(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
    _.#lastVisibilityInfo?.clear();
    const slides = _.ctx.carousel.querySelectorAll("tarot-slide");
    for (const slide of slides) {
      slide.classList.remove(
        "tarot-hidden",
        "tarot-partially-visible",
        "tarot-mostly-visible",
        "tarot-fully-visible",
        "tarot-selected"
      );
      _.#clearSlideMetricProps(slide);
      slide.removeAttribute("aria-hidden");
      slide.removeAttribute("aria-current");
      slide.removeAttribute("aria-roledescription");
      slide.inert = false;
    }
  }
};
//#endregion
//#region src/scripts/core/utils/frame-utils.js
/**
 * Frame Utilities for Effect Rendering
 *
 * Pure utility functions for effect rendering calculations.
 * These functions are injected into effect render methods to provide
 * common positioning and range calculations.
 */
/**
 * Resolves a named point into an absolute numeric X position, offset by the current track position.
 *
 * Supports infinite sentinels:
 * - `"L+"` → `-Infinity`
 * - `"R+"` → `Infinity`
 *
 * @param {string} pointName - Point key (e.g. `"L1"`, `"C"`, `"R+"`)
 * @param {number} trackPosition - Current track offset in px
 * @param {Object} transformPoints - Named position points from frame
 * @returns {number} Absolute position in px
 * @throws {Error} If pointName is unknown and not an infinity keyword
 */
function getPointValue(pointName, trackPosition, transformPoints) {
  if (pointName === "L+") return Number.NEGATIVE_INFINITY;
  if (pointName === "R+") return Number.POSITIVE_INFINITY;
  const base = transformPoints?.[pointName];
  if (base == null)
    throw new Error(
      `getPointValue: unknown point "${pointName}". Available points: ${Object.keys(
        transformPoints || {}
      ).join(", ")}`
    );
  return base + trackPosition;
}
/**
 * Computes a normalized range between two named points, with start ≥ end.
 *
 * @param {string} pointNameA - First point name
 * @param {string} pointNameB - Second point name
 * @param {number} trackPosition - Current track offset in px
 * @param {Object} transformPoints - Named position points from frame
 * @returns {{ start: number, end: number }} Range in px, offset for the current track position
 */
function getRange(pointNameA, pointNameB, trackPosition, transformPoints) {
  const a = getPointValue(pointNameA, trackPosition, transformPoints);
  const b = getPointValue(pointNameB, trackPosition, transformPoints);
  return a > b
    ? {
        start: a,
        end: b,
      }
    : {
        start: b,
        end: a,
      };
}
/**
 * Checks if a slide's center is within the given point range and calculates its normalized position.
 *
 * @param {HTMLElement} slide - Slide element with centerPoint property
 * @param {string} pointNameA - First point name
 * @param {string} pointNameB - Second point name
 * @param {number} trackPosition - Current track offset in px
 * @param {Object} transformPoints - Named position points from frame
 * @returns {{
 *   isInRange: boolean,
 *   percent: number,
 *   start: number,
 *   end: number
 * }} Range check result
 */
function isSlideInRange(slide, pointNameA, pointNameB, trackPosition, transformPoints) {
  const { start, end } = getRange(pointNameA, pointNameB, trackPosition, transformPoints);
  const roundedStart = roundSubPixel(start);
  const roundedEnd = roundSubPixel(end);
  const roundedCenter = roundSubPixel(slide._centerPoint);
  const isInRange = roundedCenter <= roundedStart && roundedCenter > roundedEnd;
  let percent = 0;
  if (isInRange)
    if (Number.isFinite(roundedStart) && Number.isFinite(roundedEnd)) {
      const full = roundedStart - roundedEnd;
      percent = full > 0 ? Math.max(0, Math.min(1, (roundedCenter - roundedEnd) / full)) : 1;
    } else percent = 1;
  return {
    isInRange,
    percent,
    start: roundedStart,
    end: roundedEnd,
  };
}
/**
 * Creates a frame utilities object with pre-bound transform points and track position.
 * This provides a cleaner API for effects to use.
 *
 * @param {Object} frame - Complete frame object
 * @returns {Object} Utilities object with bound helper functions
 */
function createFrameUtils(frame) {
  const { animation, transformPoints } = frame;
  const trackPosition = animation.trackPosition === 0 ? 0 : -animation.trackPosition;
  return {
    /**
     * Get absolute position for a named point
     * @param {string} pointName - Point name (e.g. "L1", "C", "R2")
     * @returns {number} Absolute position in px
     */
    getPointValue: (pointName) => getPointValue(pointName, trackPosition, transformPoints),
    /**
     * Get range between two named points
     * @param {string} pointNameA - First point name
     * @param {string} pointNameB - Second point name
     * @returns {{ start: number, end: number }} Range object
     */
    getRange: (pointNameA, pointNameB) =>
      getRange(pointNameA, pointNameB, trackPosition, transformPoints),
    /**
     * Check if slide is in range and get progress
     * @param {HTMLElement} slide - Slide element
     * @param {string} pointNameA - First point name
     * @param {string} pointNameB - Second point name
     * @returns {{ isInRange: boolean, percent: number, start: number, end: number }}
     */
    isSlideInRange: (slide, pointNameA, pointNameB) =>
      isSlideInRange(slide, pointNameA, pointNameB, trackPosition, transformPoints),
    trackPosition,
    transformPoints,
    frame,
  };
}
//#endregion
//#region src/scripts/core/frame-engine.js
var FrameEngine = class {
  #slideStateManager;
  ctx;
  constructor(ctx) {
    const _ = this;
    _.ctx = ctx;
    _.#slideStateManager = new SlideStateManager(ctx);
    _.effect = null;
    _.rafId = null;
    _.handlers = {
      effectChanged: () => {
        _.effect = ctx.commands.getEffect();
        _.requestFrame();
      },
      storeDirty: () => {
        _.requestFrame();
      },
    };
    _.init();
  }
  init() {
    this.bindEvents();
  }
  bindEvents() {
    const { emitter, events } = this.ctx;
    emitter.on(events.effect.changed, this.handlers.effectChanged);
    emitter.on(events.store.changedDirty, this.handlers.storeDirty);
  }
  requestFrame() {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(this.onFrame.bind(this));
  }
  cancel() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
  onFrame(time) {
    const _ = this;
    _.rafId = null;
    _.ctx.commands.getSlideManager().prepSlidesForFrame();
    const snapshot = _.ctx.store.getSnapshot();
    const sortedSlides = [...snapshot.slides].sort((a, b) => a._renderIndex - b._renderIndex);
    const frame = Object.freeze({
      state: snapshot.state,
      widths: snapshot.widths,
      options: snapshot.options,
      slides: sortedSlides,
      animation: snapshot.animation,
      transformPoints: snapshot.transformPoints,
      time,
    });
    _.renderFrame(frame);
    _.ctx.store.markAsClean();
    if (snapshot.animation.isAnimating) {
      _.ctx.emitter.emit(_.ctx.events.track.requestFrame, { time });
      _.requestFrame();
    }
  }
  renderFrame(frame) {
    const _ = this;
    if (!_.effect) return;
    _.ctx.emitter.emit(_.ctx.events.frame.beforeRender, frame);
    const utils = createFrameUtils(frame);
    _.effect.render(frame, utils);
    _.#slideStateManager.updateSlides(frame.animation.trackPosition);
    _.ctx.emitter.emit(_.ctx.events.frame.afterRender, frame);
  }
  destroy() {
    const _ = this;
    const { emitter, events } = _.ctx;
    _.cancel();
    emitter.off(events.effect.changed, _.handlers.effectChanged);
    emitter.off(events.store.changedDirty, _.handlers.storeDirty);
    if (_.#slideStateManager) {
      _.#slideStateManager.destroy();
      _.#slideStateManager = null;
    }
    _.effect = null;
    _.ctx = null;
  }
};
//#endregion
//#region src/scripts/core/data-store.js
/**
 * datastore – central storage for all runtime data slices
 * - options: validated configuration (merged patches)
 * - state: runtime flags and positions (merged patches)
 * - widths: measured layout numbers (replaced wholesale)
 * - slides: internal slide descriptors (replaced wholesale)
 *
 * all writes must go through the mutators so events fire.
 * reads return freshly frozen copies to prevent accidental mutation.
 */
var DataStore = class {
  /** @type {any} private emitter */
  #emitter;
  /** @type {object} private live objects (never expose directly) */
  #options;
  #state;
  #widths;
  #slides;
  #transformPoints;
  #animation;
  #visibility;
  /** @type {boolean} private dirty state tracking */
  #isDirty;
  /**
   * creates a new datastore instance
   * @param {object} emitter - shared emitter for pub/sub (must implement emit)
   */
  constructor(emitter) {
    const _ = this;
    if (!emitter || typeof emitter.emit !== "function")
      throw new Error("data-store requires an emitter with an emit method");
    _.#emitter = emitter;
    _.#isDirty = false;
    _.#options = {};
    _.#state = {
      selectedIndex: 0,
      renderIndex: 0,
      pageIndex: 0,
      pageCount: 1,
      canLoop: false,
      isDragging: false,
      slideCount: 0,
      snapPoints: [],
      firstSnapPoint: 0,
      lastSnapPoint: 0,
    };
    _.#widths = {
      viewport: 0,
      track: 0,
      slide: 0,
      slideMin: 0,
      gap: 0,
      slideAndGap: 0,
      paddingLeft: 0,
      paddingRight: 0,
      visibilityBoundsWidth: 0,
      visibilityBoundsOffset: 0,
    };
    _.#slides = [];
    _.#transformPoints = {};
    _.#animation = {
      movementType: "jump",
      trackPosition: 0,
      trackDelta: 0,
      velocity: 0,
      progress: 1,
      isAnimating: false,
      direction: 0,
      trackPercent: 0,
    };
    _.#visibility = {
      partiallyVisibleSlides: [],
      mostlyVisibleSlides: [],
      fullyVisibleSlides: [],
    };
  }
  /**
   * returns a readonly copy of options
   * @returns {Readonly<object>}
   */
  getOptions() {
    return Object.freeze({ ...this.#options });
  }
  /**
   * merges a patch into options and emits options:changed
   * @param {object} [patch={}] - partial options to merge
   */
  setOptions(patch = {}) {
    const _ = this;
    const previousOptions = _.getOptions();
    _.#options = {
      ..._.#options,
      ...patch,
    };
    const currentOptions = _.getOptions();
    _.#markAsDirty();
    _.#emitter.emit(EVENTS.store.optionsChanged, {
      previousOptions,
      currentOptions,
    });
  }
  /**
   * returns a readonly copy of state
   * @returns {Readonly<object>}
   */
  getState() {
    return Object.freeze({
      ...this.#state,
      snapPoints: Object.freeze([...this.#state.snapPoints]),
    });
  }
  /**
   * merges a patch into state, emits state:changed,
   * and fires fine-grained index events when applicable
   * @param {object} [patch={}] - partial state updates
   */
  setState(patch = {}) {
    const _ = this;
    const previousState = _.getState();
    _.#state = {
      ..._.#state,
      ...patch,
    };
    const currentState = _.getState();
    _.#markAsDirty();
    _.#emitter.emit(EVENTS.store.stateChanged, {
      previousState,
      currentState,
    });
    if (patch.selectedIndex !== void 0 && patch.selectedIndex !== previousState.selectedIndex)
      _.#emitter.emit(EVENTS.store.selectedIndexChanged, {
        previousIndex: previousState.selectedIndex,
        currentIndex: patch.selectedIndex,
      });
    if (patch.renderIndex !== void 0 && patch.renderIndex !== previousState.renderIndex)
      _.#emitter.emit(EVENTS.store.renderIndexChanged, {
        previousIndex: previousState.renderIndex,
        currentIndex: patch.renderIndex,
      });
    if (patch.pageIndex !== void 0 && patch.pageIndex !== previousState.pageIndex)
      _.#emitter.emit(EVENTS.store.pageIndexChanged, {
        previousPageIndex: previousState.pageIndex,
        currentPageIndex: patch.pageIndex,
      });
    if (patch.pageCount !== void 0 && patch.pageCount !== previousState.pageCount)
      _.#emitter.emit(EVENTS.store.pageCountChanged, { count: patch.pageCount });
    if (patch.canLoop !== void 0 && patch.canLoop !== previousState.canLoop)
      _.#emitter.emit(EVENTS.store.canLoopChanged, { canLoop: patch.canLoop });
    if (patch.snapPoints !== void 0)
      _.#emitter.emit(EVENTS.store.snapPointsChanged, {
        snapPoints: patch.snapPoints,
        firstSnapPoint: patch.firstSnapPoint,
        lastSnapPoint: patch.lastSnapPoint,
      });
  }
  /**
   * returns a readonly copy of widths
   * @returns {Readonly<object>}
   */
  getWidths() {
    return Object.freeze({ ...this.#widths });
  }
  /**
   * replaces all width metrics and emits layout:changed
   * @param {object} [nextWidths={}] - full set of layout metrics
   */
  setWidths(nextWidths = {}) {
    const _ = this;
    const previousWidths = _.getWidths();
    _.#widths = { ...nextWidths };
    const currentWidths = _.getWidths();
    _.#markAsDirty();
    _.#emitter.emit(EVENTS.store.layoutChanged, {
      previousWidths,
      currentWidths,
    });
  }
  /**
   * returns a readonly copy of slides (array)
   * @returns {Readonly<Array>}
   */
  getSlides() {
    return Object.freeze([...(this.#slides || [])]);
  }
  /**
   * replaces the slides array, syncs slideCount in state,
   * and emits slides:changed
   * @param {Array} [slides=[]] - new slide descriptors
   */
  setSlides(slides = []) {
    const _ = this;
    const previousSlides = _.getSlides();
    _.#slides = [...slides];
    const currentSlides = _.getSlides();
    _.setState({ slideCount: _.#slides.length });
    _.#markAsDirty();
    _.#emitter.emit(EVENTS.store.slidesChanged, {
      previousSlides,
      currentSlides,
    });
  }
  /**
   * returns a readonly copy of transformPoints
   * @returns {Readonly<object>}
   */
  getTransformPoints() {
    return Object.freeze({ ...this.#transformPoints });
  }
  /**
   * replaces the transformPoints object and emits transformPoints:changed
   * @param {object} [nextPoints={}] - new transform points mapping
   */
  setTransformPoints(nextPoints = {}) {
    const _ = this;
    const previousPoints = _.getTransformPoints();
    _.#transformPoints = { ...nextPoints };
    _.#markAsDirty();
    _.#emitter.emit(EVENTS.store.transformPointsChanged, {
      previousPoints,
      currentPoints: Object.freeze({ ..._.#transformPoints }),
    });
  }
  /**
   * updates animation state for frame-based rendering
   * @param {object} animationData - animation data
   * @param {string} animationData.movementType - movement type ('animate' | 'jump' | 'settle' | 'drag' | 'momentum' | 'scroll')
   * @param {number} [animationData.trackPosition] - current track position
   * @param {number} [animationData.trackDelta] - change in track position
   * @param {number} [animationData.velocity] - current velocity
   * @param {number} [animationData.progress] - animation progress (0-1)
   * @param {boolean} [animationData.isAnimating] - whether animation is active
   */
  setAnimation(animationData = {}) {
    const _ = this;
    const previousAnimation = { ..._.#animation };
    _.#animation = {
      ..._.#animation,
      ...animationData,
    };
    if (animationData.trackPosition !== void 0)
      _.#animation.trackPercent = _.#calculateTrackPercent(animationData.trackPosition);
    _.#markAsDirty();
    if (
      animationData.trackPosition !== void 0 &&
      animationData.trackPosition !== previousAnimation.trackPosition
    )
      _.#emitter.emit(EVENTS.track.positionChanged, {
        previousTrackPosition: previousAnimation.trackPosition,
        currentTrackPosition: animationData.trackPosition,
        trackDelta: animationData.trackPosition - previousAnimation.trackPosition,
        movementType: animationData.movementType || "unknown",
        trackPercent: _.#animation.trackPercent,
      });
  }
  /**
   * calculates the track percent (spatial progress) from track position
   * @param {number} trackPosition - current track position
   * @returns {number} progress value: usually 0-1, may overflow (<0 or >1) in elastic/loop states
   * @private
   */
  #calculateTrackPercent(trackPosition) {
    const { firstSnapPoint, lastSnapPoint, canLoop } = this.#state;
    const { track: trackWidth } = this.#widths;
    const range = firstSnapPoint - lastSnapPoint;
    if (range === 0) return 0;
    const percent = (firstSnapPoint - trackPosition) / range;
    if (!canLoop) return percent;
    if (percent > 1) {
      const overflowDistance = Math.abs(trackPosition - lastSnapPoint);
      const loopRange = trackWidth - Math.abs(lastSnapPoint - firstSnapPoint);
      if (loopRange <= 0) return percent;
      return 1 + overflowDistance / loopRange;
    }
    if (percent < 0) {
      const overflowDistance = Math.abs(firstSnapPoint - trackPosition);
      const loopRange = trackWidth - Math.abs(lastSnapPoint - firstSnapPoint);
      if (loopRange <= 0) return percent;
      return -(overflowDistance / loopRange);
    }
    return percent;
  }
  /**
   * returns a readonly copy of animation
   * @returns {Readonly<object>}
   */
  getAnimation() {
    return Object.freeze({ ...this.#animation });
  }
  /**
   * returns a readonly copy of visibility state
   * @returns {Readonly<{partiallyVisibleSlides: HTMLElement[], mostlyVisibleSlides: HTMLElement[], fullyVisibleSlides: HTMLElement[]}>}
   */
  getVisibility() {
    return Object.freeze({
      partiallyVisibleSlides: Object.freeze([...this.#visibility.partiallyVisibleSlides]),
      mostlyVisibleSlides: Object.freeze([...this.#visibility.mostlyVisibleSlides]),
      fullyVisibleSlides: Object.freeze([...this.#visibility.fullyVisibleSlides]),
    });
  }
  /**
   * updates the visibility state with current visible slides
   * @param {object} visibility - visibility data
   * @param {HTMLElement[]} visibility.partiallyVisibleSlides - slides with any visibility (> 0%)
   * @param {HTMLElement[]} visibility.mostlyVisibleSlides - slides with >= 66% visibility
   * @param {HTMLElement[]} visibility.fullyVisibleSlides - slides with >= 98% visibility
   */
  setVisibility({
    partiallyVisibleSlides = [],
    mostlyVisibleSlides = [],
    fullyVisibleSlides = [],
  } = {}) {
    const _ = this;
    const prev = _.#visibility;
    const partiallyChanged =
      partiallyVisibleSlides.length !== prev.partiallyVisibleSlides.length ||
      partiallyVisibleSlides.some((s, i) => s !== prev.partiallyVisibleSlides[i]);
    const mostlyChanged =
      mostlyVisibleSlides.length !== prev.mostlyVisibleSlides.length ||
      mostlyVisibleSlides.some((s, i) => s !== prev.mostlyVisibleSlides[i]);
    const fullyChanged =
      fullyVisibleSlides.length !== prev.fullyVisibleSlides.length ||
      fullyVisibleSlides.some((s, i) => s !== prev.fullyVisibleSlides[i]);
    if (!partiallyChanged && !mostlyChanged && !fullyChanged) return;
    _.#visibility = {
      partiallyVisibleSlides: [...partiallyVisibleSlides],
      mostlyVisibleSlides: [...mostlyVisibleSlides],
      fullyVisibleSlides: [...fullyVisibleSlides],
    };
    _.#emitter.emit(EVENTS.slides.visibleChanged, {
      partiallyVisibleSlides: _.#visibility.partiallyVisibleSlides,
      mostlyVisibleSlides: _.#visibility.mostlyVisibleSlides,
      fullyVisibleSlides: _.#visibility.fullyVisibleSlides,
      partiallyVisibleIndices: _.#visibility.partiallyVisibleSlides.map((s) => s._index),
      mostlyVisibleIndices: _.#visibility.mostlyVisibleSlides.map((s) => s._index),
      fullyVisibleIndices: _.#visibility.fullyVisibleSlides.map((s) => s._index),
    });
  }
  /**
   * returns the current dirty state
   * @returns {boolean} true if store has pending changes
   */
  isDirty() {
    return this.#isDirty;
  }
  /**
   * marks the store as clean (no pending changes)
   * emits store:changed-clean event
   */
  markAsClean() {
    if (this.#isDirty) {
      this.#isDirty = false;
      this.#emitter.emit(EVENTS.store.changedClean);
    }
  }
  /**
   * private method to mark store as dirty and emit event
   * @private
   */
  #markAsDirty() {
    if (!this.#isDirty) {
      this.#isDirty = true;
      this.#emitter.emit(EVENTS.store.changedDirty);
    }
  }
  /**
   * returns a complete snapshot of all store data for frame rendering
   * @returns {Readonly<object>} complete frozen snapshot with all data slices
   */
  getSnapshot() {
    const _ = this;
    return Object.freeze({
      state: _.getState(),
      widths: _.getWidths(),
      slides: _.getSlides(),
      transformPoints: _.getTransformPoints(),
      options: _.getOptions(),
      animation: _.getAnimation(),
      visibility: _.getVisibility(),
    });
  }
  /**
   * cleans up the data store and clears all references
   * should be called when the carousel is destroyed to prevent memory leaks
   */
  destroy() {
    const _ = this;
    _.#emitter = null;
    _.#options = null;
    _.#state = null;
    _.#widths = null;
    _.#slides = null;
    _.#transformPoints = null;
    _.#animation = null;
    _.#visibility = null;
    _.#isDirty = false;
  }
};
//#endregion
//#region src/scripts/core/metrics.js
function calculateWidths({ viewportEl, options, slideCount, boundsEl }) {
  const viewport = viewportEl.offsetWidth || 0;
  const resolvedBoundsEl = boundsEl || viewportEl;
  let visibilityBoundsWidth = viewport;
  let visibilityBoundsOffset = 0;
  if (resolvedBoundsEl !== viewportEl) {
    const viewportRect = viewportEl.getBoundingClientRect();
    const boundsRect = resolvedBoundsEl.getBoundingClientRect();
    visibilityBoundsWidth = resolvedBoundsEl.offsetWidth || viewport;
    visibilityBoundsOffset = boundsRect.left - viewportRect.left;
  }
  const slidesPerView = Math.max(1, Number(options.slidesPerView) || 1);
  const gap = convertValueToNumber(options.gap, viewport);
  let paddingLeft = convertValueToNumber(options.paddingLeft, viewport);
  let paddingRight = convertValueToNumber(options.paddingRight, viewport);
  if (options.rules) {
    const minLeft = convertValueToNumber(options.rules.minPaddingLeft, viewport);
    const minRight = convertValueToNumber(options.rules.minPaddingRight, viewport);
    if (paddingLeft < minLeft) paddingLeft = minLeft;
    if (paddingRight < minRight) paddingRight = minRight;
  }
  const totalPaddingWidth = paddingLeft + paddingRight;
  const totalGapWidth = gap * (slidesPerView - 1);
  const totalSlideWidth = Math.max(0, viewport - totalGapWidth - totalPaddingWidth);
  let slide = slidesPerView > 0 ? Math.round((totalSlideWidth / slidesPerView) * 1e3) / 1e3 : 0;
  const slideMin = convertValueToNumber(options.slideMinWidth, slide);
  if (slide < slideMin) slide = slideMin;
  const track = Math.max(0, slideCount) * (slide + gap);
  const groupWidth = Math.max(0, slideCount) * slide + Math.max(0, slideCount - 1) * gap;
  const innerViewport = viewport - paddingLeft - paddingRight;
  let centerOffset = 0;
  if (options.centerInsufficientSlides && groupWidth < innerViewport)
    centerOffset = Math.max(0, (innerViewport - groupWidth) / 2);
  return {
    viewport,
    track,
    slide,
    slideMin,
    gap,
    slideAndGap: Math.round((slide + gap) * 1e3) / 1e3,
    paddingLeft,
    paddingRight,
    centerOffset,
    visibilityBoundsWidth,
    visibilityBoundsOffset,
  };
}
function calculatePageCount({
  loop,
  slidesPerMove,
  slidesPerView,
  slideCount,
  centerSelectedSlide,
}) {
  if (slideCount === 0) return 0;
  if (slideCount <= slidesPerView) return 1;
  if (loop || centerSelectedSlide) return Math.ceil(slideCount / slidesPerMove);
  const validSlidePositions = slideCount - slidesPerView;
  return Math.ceil(validSlidePositions / slidesPerMove) + 1;
}
function calculateTransformPoints(ctx) {
  const { store } = ctx;
  const widths = store.getWidths();
  const options = store.getOptions();
  const halfSlideWidth = widths.slide / 2;
  const stepDistance = widths.slideAndGap;
  const visibleSlides = options.slidesPerView;
  const CL1 = widths.paddingLeft + halfSlideWidth;
  const points = { CL1 };
  for (let i = 1; i <= visibleSlides; i++) points[`CL${i}`] = CL1 + stepDistance * (i - 1);
  for (let i = 1; i <= visibleSlides; i++) {
    const mirroredIndex = visibleSlides - i + 1;
    points[`CR${i}`] = points[`CL${mirroredIndex}`];
  }
  if (visibleSlides === 1) points.C = points.CL1;
  else points.C = (points.CL1 + points[`CL${visibleSlides}`]) / 2;
  for (let i = 1; i <= 10; i++) points[`L${i}`] = CL1 - stepDistance * i;
  const lastVisiblePos = points[`CL${visibleSlides}`];
  for (let i = 1; i <= 10; i++) points[`R${i}`] = lastVisiblePos + stepDistance * i;
  return points;
}
/**
 * Calculate snap points (track positions) for each page
 * @param {Object} widths - Width measurements from store
 * @param {Object} options - Carousel options from store
 * @param {Object} state - Carousel state from store
 * @returns {Object} { snapPoints: number[], firstSnapPoint: number, lastSnapPoint: number }
 */
function calculateSnapPoints(widths, options, state) {
  const { pageCount } = state;
  const { slidesPerMove } = options;
  const snapPoints = [];
  for (let page = 0; page < pageCount; page++) {
    const slideIndex = page * slidesPerMove;
    snapPoints.push(getTrackPosForIndex(slideIndex, widths, options, state));
  }
  return {
    snapPoints,
    firstSnapPoint: snapPoints[0] ?? 0,
    lastSnapPoint: snapPoints[snapPoints.length - 1] ?? 0,
  };
}
//#endregion
//#region src/scripts/effects/tarot-effect.js
var TarotEffect = class {
  static rules = {
    minSlidesPerView: 1,
    maxSlidesPerView: Infinity,
    loopBuffer: {
      left: 0,
      right: 1,
    },
    minPaddingLeft: 0,
    minPaddingRight: 0,
  };
  /**
   * @param {object} ctx - The shared context object containing emitter, store, etc.
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.currentSlideWidth = 0;
    this.currentTrackWidth = 0;
  }
  init() {}
  reInit() {}
  renderSlideWidth(width) {
    if (this.currentSlideWidth !== width) {
      this.currentSlideWidth = width;
      this.ctx.viewport.style.setProperty("--tarot-slide-width", `${width}px`);
    }
  }
  renderTrackPosition(animation) {
    let transformValue = animation.isAnimating
      ? `translate3d(${animation.trackPosition}px,0,0)`
      : `translateX(${animation.trackPosition}px)`;
    this.ctx.track.style.transform = transformValue;
  }
  renderTrackWidth(width) {
    if (this.currentTrackWidth !== width) {
      this.currentTrackWidth = width;
      this.ctx.track.style.width = `${width}px`;
    }
  }
  /**
   * Render method called by the frame engine for each animation frame.
   * Child effects must override this method to implement their visual transformations.
   * @param {Object} frame - Complete frame object with all carousel data
   * @param {Array} frame.slides - Sorted slides array with calculated positions
   * @param {Object} frame.widths - Layout measurements (viewport, slide, gap, etc.)
   * @param {Object} frame.state - Carousel state (selectedIndex, renderIndex, etc.)
   * @param {Object} frame.animation - Animation data (trackPosition, velocity, progress, etc.)
   * @param {Object} frame.transformPoints - Named position points (L1, C, R1, etc.)
   * @param {Object} frame.options - Current carousel options
   * @param {Object} utils - Frame utilities for position calculations
   * @param {Function} utils.getPointValue - Get absolute position for named point
   * @param {Function} utils.getRange - Get range between two named points
   * @param {Function} utils.isSlideInRange - Check if slide is in range with progress
   */
  render(frame, utils) {}
  get rules() {
    return this.constructor.rules;
  }
  /**
   * Cleanup method called when the effect is destroyed.
   * Child classes should override and call super.destroy() if they have resources to clean up.
   */
  destroy() {}
};
//#endregion
//#region src/scripts/effects/carousel.js
var CarouselEffect = class extends TarotEffect {
  static effectName = "carousel";
  constructor(ctx) {
    super(ctx);
  }
  /**
   * position all slides on the track using frame-based rendering
   * runs with every animation frame when track is moving
   * @param {Object} frame - complete frame object with all data
   * @param {Array} frame.slides - prepped slides with calculated positions
   * @param {Object} frame.widths - layout measurements
   * @param {Object} frame.state - carousel state (selectedIndex, renderIndex, etc.)
   * @param {Object} frame.animation - animation data
   * @param {Object} frame.transformPoints - named position points
   * @param {Object} utils - frame utilities for position calculations
   * @param {Function} utils.getPointValue - Get absolute position for named point
   * @param {Function} utils.getRange - Get range between two named points
   * @param {Function} utils.isSlideInRange - Check if slide is in range with progress
   * @returns {void}
   */
  render(frame, utils) {
    const { slides, widths, state, animation } = frame;
    this.renderTrackWidth(widths.track);
    this.renderSlideWidth(widths.slide);
    this.renderTrackPosition(animation);
    for (let i = 0, n = slides.length; i < n; ++i) {
      const slide = slides[i];
      if (slide && slide.style) slide.style.transform = `translateX(${slide._trackPosition}px)`;
    }
  }
  destroy() {
    this.ctx.track.style.transform = "";
    this.ctx.track.style.width = "";
  }
};
//#endregion
//#region src/scripts/effects/fade.js
var Fade = class extends TarotEffect {
  static effectName = "fade";
  static defaultOptions = {
    fade: {
      blur: 10,
      scale: 0.1,
      xOffset: 0,
      yOffset: 0,
    },
  };
  static rules = {
    minSlidesPerView: 1,
    maxSlidesPerView: 1,
    loopBuffer: {
      left: 0,
      right: 1,
    },
  };
  constructor(ctx) {
    super(ctx);
    this.lastState = /* @__PURE__ */ new WeakMap();
    this.#loadFadeOptions();
  }
  #loadFadeOptions() {
    const _ = this;
    const fadeOpts = _.ctx.store.getOptions().fade || {};
    _.blurAmount = fadeOpts.blur;
    _.scaleAmount = fadeOpts.scale;
    _.xOffset = fadeOpts.xOffset;
    _.yOffset = fadeOpts.yOffset;
  }
  reInit() {
    this.#loadFadeOptions();
    this.lastState = /* @__PURE__ */ new WeakMap();
  }
  /**
   * Main render function called every animation frame
   * Uses the frame-based architecture with dependency injection for utilities
   *
   * @param {Object} frame - Complete frame object with all carousel data
   * @param {Array} frame.slides - Sorted slides array with calculated positions
   * @param {Object} frame.widths - Layout measurements
   * @param {Object} frame.state - Carousel state
   * @param {Object} frame.animation - Animation data including trackPosition
   * @param {Object} frame.transformPoints - Named position points
   * @param {Object} utils - Frame utilities for position calculations
   * @param {Function} utils.isSlideInRange - Check if slide is in range with progress
   */
  render(frame, utils) {
    const _ = this;
    const { slides, widths, animation } = frame;
    _.renderSlideWidth(widths.slide);
    const lastState = _.lastState;
    for (let i = 0, n = slides.length; i < n; ++i) {
      const slide = slides[i];
      if (utils.isSlideInRange(slide, "L+", "L1").isInRange) {
        if (lastState.get(slide) !== "hiddenLeft") {
          _.applyHiddenLeftFilter(slide);
          lastState.set(slide, "hiddenLeft");
        }
        continue;
      }
      const fadeLeft = utils.isSlideInRange(slide, "CL1", "L1");
      if (fadeLeft.isInRange) {
        const key = `fadeLeft:${Math.round(fadeLeft.percent * 100)}`;
        if (lastState.get(slide) !== key) {
          _.applyFadeLeftFilter(slide, fadeLeft.percent);
          lastState.set(slide, key);
        }
        continue;
      }
      if (utils.isSlideInRange(slide, "R1", "CL1").isInRange) {
        if (lastState.get(slide) !== "fadeRight") {
          _.applyFadeRightFilter(slide);
          lastState.set(slide, "fadeRight");
        }
        continue;
      }
      if (utils.isSlideInRange(slide, "R+", "R1").isInRange) {
        if (lastState.get(slide) !== "hiddenRight") {
          _.applyHiddenRightFilter(slide);
          lastState.set(slide, "hiddenRight");
        }
        continue;
      }
    }
  }
  applyHiddenLeftFilter(slide) {
    const _ = this;
    const style = slide.style;
    slide.hide();
    style.opacity = "0";
    style.zIndex = "1";
    style.filter = `blur(${_.blurAmount}px)`;
    style.transform = `scale(${1 + _.scaleAmount}) translateX(${_.xOffset}px) translateY(${
      _.yOffset
    }px)`;
  }
  applyFadeLeftFilter(slide, percent) {
    if (percent > 0.995) percent = 1;
    const _ = this;
    const remaining = 1 - percent;
    const blur = remaining * _.blurAmount;
    const scale = 1 + remaining * _.scaleAmount;
    const tx = remaining * _.xOffset;
    const ty = remaining * _.yOffset;
    const style = slide.style;
    style.opacity = String(percent);
    slide.show();
    style.zIndex = "1";
    style.filter = `blur(${blur}px)`;
    style.transform = `scale(${scale}) translateX(${tx}px) translateY(${ty}px)`;
  }
  applyFadeRightFilter(slide) {
    const style = slide.style;
    style.opacity = "1";
    slide.show();
    style.zIndex = "0";
    style.filter = "blur(0px)";
    style.transform = "scale(1) translateX(0px) translateY(0px)";
  }
  applyHiddenRightFilter(slide) {
    const style = slide.style;
    style.opacity = "0";
    slide.hide();
    style.zIndex = "0";
    style.filter = "blur(0px)";
    style.transform = "scale(1) translateX(0px) translateY(0px)";
  }
  destroy() {
    super.destroy();
    const slides = this.ctx.store.getSlides() || [];
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      if (!slide || !slide.style) continue;
      slide.style.opacity = "";
      slide.show?.();
      slide.style.zIndex = "";
      slide.style.filter = "";
      slide.style.transform = "";
    }
    this.lastState = null;
  }
};
//#endregion
//#region src/scripts/plugins/as-nav-for.js
var AsNavFor = class {
  static pluginName = "as-nav-for";
  /**
   * @constructor
   * @param {Object} ctx - the carousel context that will be synced with another
   */
  constructor(ctx) {
    const _ = this;
    _.ctx = ctx;
    _.otherCarousel = null;
    _.isNavCarousel = true;
    _.isActive = false;
    _.isSyncing = false;
    _.handlers = {
      otherMovementRequested: ({ index }) => {
        if (_.isSyncing) return;
        if (_.ctx.store.getState().selectedIndex === index) return;
        _.isSyncing = true;
        setTimeout(() => {
          _.ctx.commands.goToSlide(index);
          _.isSyncing = false;
        }, 1);
      },
      renderIndexChanged: ({ currentIndex }) => {
        if (!_.isActive) return;
        if (_.ctx.store.getState().selectedIndex !== currentIndex)
          _.ctx.store.setState({ selectedIndex: currentIndex });
      },
      optionsChanged: () => {
        _.reInit();
      },
      selectedIndexChanged: ({ previousIndex, currentIndex }) => {
        if (!_.isActive) return;
        _.updateOtherCarousel();
        _.updateNavClasses(previousIndex, currentIndex);
      },
      keyDown: (event) => {
        if (!_.isActive) return;
        _.handleKeyDown(event);
      },
      slideClick: ({ index }) => {
        if (!_.isActive) return;
        const targetSlide = _.ctx.store.getSlides()[index];
        if (targetSlide && typeof targetSlide.focus === "function")
          try {
            targetSlide.focus({ preventScroll: true });
          } catch {}
        _.ctx.commands.goToSlide(index);
      },
    };
    _.init();
  }
  /**
   * query the other carousel from the DOM
   */
  queryDOM() {
    const _ = this;
    const otherCarouselSelector = _.ctx.store.getOptions().asNavFor;
    if (!otherCarouselSelector) {
      _.disableNavUI?.();
      _.isActive = false;
      return false;
    }
    const otherCarousel = document.querySelector(otherCarouselSelector);
    if (!otherCarousel) {
      _.disableNavUI?.();
      _.isActive = false;
      return false;
    }
    _.otherCarousel = otherCarousel;
    _.isActive = true;
    return true;
  }
  /**
   * initialize the sync functionality and nav-specific features
   */
  init() {
    this.bindEvents();
    this.setupConnection();
  }
  /**
   * setup the connection to the other carousel
   * Called from init() and reInit()
   */
  setupConnection() {
    const _ = this;
    if (!_.queryDOM()) return;
    _.enableNavUI?.();
    setTimeout(() => {
      try {
        _.otherCarousel.on(_.ctx.events.movement.requested, _.handlers.otherMovementRequested);
      } catch {
        console.warn(
          "AsNavFor: failed to bind to other carousel - ensure target is a tarot-carousel element"
        );
        _.isActive = false;
        return;
      }
      _.updateNavClasses(-1, _.ctx.store.getState().selectedIndex);
      const { renderIndex, selectedIndex } = _.ctx.store.getState();
      if (renderIndex !== selectedIndex) _.ctx.store.setState({ selectedIndex: renderIndex });
    }, 40);
  }
  /**
   * reinitialize on carousel option changes
   */
  reInit() {
    const _ = this;
    if (_.otherCarousel) {
      try {
        _.otherCarousel.off(_.ctx.events.movement.requested, _.handlers.otherMovementRequested);
      } catch {}
      _.otherCarousel = null;
    }
    _.disableNavUI();
    _.isActive = false;
    _.setupConnection();
  }
  /**
   * bind carousel events to handlers
   */
  bindEvents() {
    const emitter = this.ctx.emitter;
    const EVENTS = this.ctx.events;
    const handlers = this.handlers;
    emitter.on(EVENTS.store.optionsChanged, handlers.optionsChanged);
    emitter.on(EVENTS.store.renderIndexChanged, handlers.renderIndexChanged);
    emitter.on(EVENTS.store.selectedIndexChanged, handlers.selectedIndexChanged);
    emitter.on(EVENTS.slides.click, handlers.slideClick);
  }
  /** enable nav-specific UI and keyboard only when active */
  enableNavUI() {
    const _ = this;
    const ctx = _.ctx;
    const carousel = ctx.carousel;
    if (!_.isActive) return;
    carousel.classList.add("tarot-nav-carousel");
    ctx.track.addEventListener("keydown", _.handlers.keyDown, true);
    carousel.setAttribute("tabindex", "0");
    carousel.setAttribute("role", "tablist");
    carousel.setAttribute("aria-label", "Carousel Navigation");
    carousel.removeAttribute("aria-roledescription");
    const slides = ctx.store.getSlides();
    const sel = ctx.store.getState().selectedIndex;
    for (let i = 0; i < slides.length; i++) {
      const s = slides[i];
      s.setAttribute("role", "tab");
      s.removeAttribute("aria-roledescription");
      s.setAttribute("tabindex", i === sel ? "0" : "-1");
    }
  }
  /** disable nav-specific UI and keyboard when not active */
  disableNavUI() {
    const _ = this;
    const ctx = _.ctx;
    const carousel = ctx.carousel;
    carousel.classList.remove("tarot-nav-carousel");
    ctx.track.removeEventListener("keydown", _.handlers.keyDown, true);
    carousel.removeAttribute("aria-label");
    carousel.setAttribute("role", "group");
    carousel.setAttribute("aria-roledescription", "carousel");
    ctx.store.getSlides().forEach((slide) => {
      slide.removeAttribute("aria-selected");
      slide.removeAttribute("tabindex");
      slide.setAttribute("role", "group");
      slide.setAttribute("aria-roledescription", "slide");
    });
  }
  /**
   * Handle keyboard navigation for nav carousel
   */
  handleKeyDown(event) {
    const _ = this;
    const currentIndex = _.ctx.store.getState().selectedIndex;
    const totalSlides = _.ctx.store.getState().slideCount;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowUp": {
        event.preventDefault();
        event.stopPropagation();
        const prevIndex =
          currentIndex > 0
            ? currentIndex - 1
            : _.ctx.store.getOptions().loop
            ? totalSlides - 1
            : currentIndex;
        _.ctx.commands.goToSlide(prevIndex);
        const prevTarget = _.ctx.store.getSlides()[prevIndex];
        if (prevTarget && typeof prevTarget.focus === "function")
          setTimeout(() => {
            try {
              prevTarget.focus({ preventScroll: true });
            } catch {}
          }, 0);
        break;
      }
      case "ArrowRight":
      case "ArrowDown": {
        event.preventDefault();
        event.stopPropagation();
        const nextIndex =
          currentIndex < totalSlides - 1
            ? currentIndex + 1
            : _.ctx.store.getOptions().loop
            ? 0
            : currentIndex;
        _.ctx.commands.goToSlide(nextIndex);
        const nextTarget = _.ctx.store.getSlides()[nextIndex];
        if (nextTarget && typeof nextTarget.focus === "function")
          setTimeout(() => {
            try {
              nextTarget.focus({ preventScroll: true });
            } catch {}
          }, 0);
        break;
      }
      case "Home": {
        event.preventDefault();
        event.stopPropagation();
        _.ctx.commands.goToSlide(0);
        const slides = _.ctx.store.getSlides();
        if (slides[0]?.focus)
          setTimeout(() => {
            try {
              slides[0].focus({ preventScroll: true });
            } catch {}
          }, 0);
        break;
      }
      case "End": {
        event.preventDefault();
        event.stopPropagation();
        _.ctx.commands.goToSlide(totalSlides - 1);
        const slides2 = _.ctx.store.getSlides();
        const last = totalSlides - 1;
        if (slides2[last]?.focus)
          setTimeout(() => {
            try {
              slides2[last].focus({ preventScroll: true });
            } catch {}
          }, 0);
        break;
      }
    }
  }
  /**
   * Update navigation-specific classes on slides
   * Note: The main tarot-selected class is handled by ClassManager,
   * but we add nav-specific ARIA attributes for accessibility
   */
  updateNavClasses(previousIndex, currentIndex) {
    const slides = this.ctx.store.getSlides();
    if (previousIndex >= 0 && slides[previousIndex]) {
      slides[previousIndex].setAttribute("aria-selected", "false");
      slides[previousIndex].setAttribute("tabindex", "-1");
    }
    if (slides[currentIndex]) {
      slides[currentIndex].setAttribute("aria-selected", "true");
      slides[currentIndex].setAttribute("role", "tab");
      slides[currentIndex].setAttribute("tabindex", "0");
    }
  }
  /**
   * update the other carousel to match this one
   */
  updateOtherCarousel() {
    const _ = this;
    if (!_.otherCarousel) return;
    if (_.isSyncing) return;
    const currentIndex = _.ctx.store.getState().selectedIndex;
    setTimeout(() => {
      try {
        _.otherCarousel.goToSlide(currentIndex);
      } catch (e) {}
    }, 1);
  }
  /**
   * destroy the sync, unbinding all events and cleaning up nav functionality
   */
  destroy() {
    const _ = this;
    const emitter = _.ctx.emitter;
    const EVENTS = _.ctx.events;
    emitter.off(EVENTS.store.optionsChanged, _.handlers.optionsChanged);
    emitter.off(EVENTS.store.renderIndexChanged, _.handlers.renderIndexChanged);
    emitter.off(EVENTS.store.selectedIndexChanged, _.handlers.selectedIndexChanged);
    emitter.off(EVENTS.slides.click, _.handlers.slideClick);
    _.disableNavUI();
    if (_.otherCarousel)
      try {
        _.otherCarousel.off(_.ctx.events.movement.requested, _.handlers.otherMovementRequested);
      } catch (e) {}
    _.otherCarousel = null;
    _.isActive = false;
  }
};
//#endregion
//#region src/scripts/plugins/sync-with.js
/**
 * Sync two carousels by mirroring movement requests in both directions.
 * - When the other carousel requests movement, mirror it here with same velocity/type.
 * - When this carousel requests movement, push that request to the other carousel.
 */
var SyncWith = class {
  /**
   * @constructor
   * @param {Object} ctx - the carousel context that will be synced with another
   */
  constructor(ctx) {
    const _ = this;
    _.ctx = ctx;
    _.otherCarousel = null;
    _.isSyncing = false;
    _.handlers = {
      otherMovementRequested: ({ index, velocity, movementType }) => {
        if (_.isSyncing) return;
        if (_.ctx.store.getState().renderIndex === index) return;
        _.isSyncing = true;
        setTimeout(() => {
          _.ctx.commands.goToSlide(index, velocity, movementType);
          _.isSyncing = false;
        }, 1);
      },
      optionsChanged: (data) => {
        _.reInit();
      },
      movementRequested: ({ index, velocity, movementType }) => {
        if (_.isSyncing) return;
        if (!_.otherCarousel) return;
        _.isSyncing = true;
        setTimeout(() => {
          _.otherCarousel.goToSlide(index, velocity, movementType);
          _.isSyncing = false;
        }, 1);
      },
    };
    _.init();
  }
  /**
   * query the other carousel from the DOM
   */
  queryDOM() {
    const _ = this;
    const otherCarouselId = _.ctx.store.getOptions().syncWith;
    if (!otherCarouselId) return false;
    _.otherCarousel = document.querySelector(otherCarouselId);
    if (!_.otherCarousel) return false;
    return true;
  }
  /**
   * initialize the sync functionality
   */
  init() {
    this.bindEvents();
    this.setupConnection();
  }
  /**
   * setup the connection to the other carousel
   */
  setupConnection() {
    const _ = this;
    if (!_.queryDOM()) return;
    setTimeout(() => {
      _.otherCarousel.on(_.ctx.events.movement.requested, _.handlers.otherMovementRequested);
    }, 100);
  }
  /**
   * reinitialize on carousel option changes
   */
  reInit() {
    const _ = this;
    if (_.otherCarousel) {
      _.otherCarousel.off(_.ctx.events.movement.requested, _.handlers.otherMovementRequested);
      _.otherCarousel = null;
    }
    _.setupConnection();
  }
  /**
   * bind carousel events to handlers
   */
  bindEvents() {
    const _ = this;
    _.ctx.emitter.on(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
    _.ctx.emitter.on(_.ctx.events.movement.requested, _.handlers.movementRequested);
  }
  /**
   * destroy the sync, unbinding all events
   */
  destroy() {
    const _ = this;
    _.ctx.emitter.off(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
    _.ctx.emitter.off(_.ctx.events.movement.requested, _.handlers.movementRequested);
    if (_.otherCarousel)
      _.otherCarousel.off(_.ctx.events.movement.requested, _.handlers.otherMovementRequested);
    _.otherCarousel = null;
  }
};
//#endregion
//#region src/scripts/plugins/autoplay.js
/**
 * Controls automatic play/advance of the carousel.
 * Uses CSS @keyframes + @property for smooth progress animation
 * and setTimeout for slide-advance timing — no rAF loop needed.
 */
var cssInjected = false;
function injectCSS() {
  if (cssInjected) return;
  cssInjected = true;
  const style = document.createElement("style");
  style.textContent = [
    "@property --tarot-autoplay-progress {",
    '  syntax: "<number>";',
    "  inherits: true;",
    "  initial-value: 0;",
    "}",
    "@keyframes tarot-autoplay-progress {",
    "  from { --tarot-autoplay-progress: 0; }",
    "  to   { --tarot-autoplay-progress: 1; }",
    "}",
  ].join("\n");
  document.head.appendChild(style);
}
var Autoplay = class {
  static pluginName = "autoplay";
  /**
   * @constructor
   * @param {Object} ctx - the carousel context to control autoplay for
   */
  constructor(ctx) {
    const _ = this;
    _.ctx = ctx;
    _.autoplayOptions = _.ctx.store.getOptions().autoplay || {};
    _.isRunning = false;
    _.isSuspended = false;
    _.interval = 0;
    _.timerId = null;
    _.remainingTime = 0;
    _.runToken = 0;
    _.reducedMotionQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    _.debouncedResume = _.ctx.utils.debounce(() => _.start(), 1e4);
    _.handlers = {
      userInteracted: () => {
        _.pause();
      },
      optionsChanged: () => {
        _.autoplayOptions = _.ctx.store.getOptions().autoplay || {};
        _.reInit();
      },
      canLoopChanged: ({ canLoop }) => {
        if (_.ctx.store.getOptions().loop && !canLoop) _.stop();
      },
      windowFocused: () => {
        if (_.isSuspended) _.resume();
      },
      windowBlurred: () => {
        if (_.isRunning && !_.isSuspended) _.suspend();
      },
      visibilityChanged: ({ hidden }) => {
        if (hidden) {
          if (_.isRunning && !_.isSuspended) _.suspend();
        } else if (_.isSuspended) _.resume();
      },
      reducedMotionChanged: () => {
        _.reInit();
      },
    };
    injectCSS();
    _.init();
  }
  /**
   * initialize autoplay
   */
  init() {
    this.bindEvents();
    this.reInit();
  }
  /**
   * reinitialize on carousel option changes
   */
  reInit() {
    const _ = this;
    _.autoplayOptions = _.ctx.store.getOptions().autoplay || {};
    if (_.autoplayOptions.interval) _.start();
    else _.stop();
  }
  /**
   * bind carousel events to handlers
   */
  bindEvents() {
    const _ = this;
    _.ctx.emitter.on(_.ctx.events.user.interacted, _.handlers.userInteracted);
    _.ctx.emitter.on(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
    _.ctx.emitter.on(_.ctx.events.store.canLoopChanged, _.handlers.canLoopChanged);
    _.ctx.emitter.on(_.ctx.events.window.hasFocus, _.handlers.windowFocused);
    _.ctx.emitter.on(_.ctx.events.window.lostFocus, _.handlers.windowBlurred);
    _.ctx.emitter.on(_.ctx.events.window.visibilityChange, _.handlers.visibilityChanged);
    _.reducedMotionQuery?.addEventListener("change", _.handlers.reducedMotionChanged);
  }
  /**
   * whether autoplay should hold off because the user prefers reduced motion
   * (on by default; opt out with autoplay.respectReducedMotion: false)
   * @returns {boolean}
   */
  respectsReducedMotion() {
    const _ = this;
    return _.autoplayOptions.respectReducedMotion !== false && !!_.reducedMotionQuery?.matches;
  }
  /** toggle aria-live on the announcements element based on autoplay state */
  updateAriaLive() {
    const announcements = this.ctx.announcements;
    if (!announcements) return;
    announcements.setAttribute("aria-live", this.isRunning ? "off" : "polite");
  }
  /**
   * start the CSS keyframe animation on the carousel element
   */
  startAnimation() {
    const el = this.ctx.carousel;
    el.style.animation = "none";
    el.offsetHeight;
    el.style.animation = `tarot-autoplay-progress ${this.interval}ms linear forwards`;
    el.style.animationPlayState = "running";
  }
  /**
   * stop the CSS animation — @property initial-value resets progress to 0
   */
  stopAnimation() {
    const el = this.ctx.carousel;
    el.style.animation = "none";
  }
  /**
   * start the autoplay timer
   */
  start() {
    const _ = this;
    _.stop();
    if (!_.autoplayOptions.interval) return;
    let interval = _.autoplayOptions.interval;
    if (interval === 0 || interval === false) return;
    if (interval === true) interval = 4e3;
    if (!Number.isFinite(interval) || interval <= 0) return;
    if (_.respectsReducedMotion()) return;
    const options = _.ctx.store.getOptions();
    const state = _.ctx.store.getState();
    if (options.loop && !state.canLoop) return;
    if (!options.loop && !_.autoplayOptions.rewind && state.pageIndex >= state.pageCount - 1)
      return;
    _.interval = interval;
    _.isRunning = true;
    _.isSuspended = false;
    _.remainingTime = interval;
    _.runToken++;
    _.updateAriaLive();
    const token = _.runToken;
    _.startAnimation();
    _.timerId = setTimeout(() => {
      if (_.runToken === token) _.advance();
    }, interval);
  }
  /**
   * advance to next slide and restart countdown
   */
  advance() {
    const _ = this;
    const options = _.ctx.store.getOptions();
    const state = _.ctx.store.getState();
    if (!options.loop && state.pageIndex >= state.pageCount - 1)
      if (_.autoplayOptions.rewind) _.ctx.commands.goToSlide(0, -5);
      else {
        _.stop();
        return;
      }
    else _.ctx.commands.next(-5);
    const newState = _.ctx.store.getState();
    if (
      !options.loop &&
      !_.autoplayOptions.rewind &&
      newState.pageIndex >= newState.pageCount - 1
    ) {
      _.stop();
      return;
    }
    _.remainingTime = _.interval;
    _.runToken++;
    const token = _.runToken;
    _.startAnimation();
    _.timerId = setTimeout(() => {
      if (_.runToken === token) _.advance();
    }, _.interval);
  }
  /**
   * suspend autoplay (window blur / visibility hidden) — preserves position
   */
  suspend() {
    const _ = this;
    if (!_.isRunning || _.isSuspended) return;
    _.isSuspended = true;
    _.ctx.carousel.style.animationPlayState = "paused";
    if (_.timerId !== null) {
      clearTimeout(_.timerId);
      _.timerId = null;
    }
    const progress = getComputedStyle(_.ctx.carousel).getPropertyValue("--tarot-autoplay-progress");
    const elapsed = parseFloat(progress) * _.interval;
    _.remainingTime = Math.max(0, Math.min(_.interval, _.interval - elapsed));
  }
  /**
   * resume after suspend — picks up from where it left off
   */
  resume() {
    const _ = this;
    if (!_.isSuspended) return;
    _.isSuspended = false;
    _.ctx.carousel.style.animationPlayState = "running";
    _.runToken++;
    const token = _.runToken;
    _.timerId = setTimeout(() => {
      if (_.runToken === token) _.advance();
    }, _.remainingTime);
  }
  /**
   * pause autoplay temporarily (user interaction) — resets progress to 0
   */
  pause() {
    const _ = this;
    _.isRunning = false;
    _.isSuspended = false;
    _.stopAnimation();
    if (_.timerId !== null) {
      clearTimeout(_.timerId);
      _.timerId = null;
    }
    _.runToken++;
    _.updateAriaLive();
    if (_.autoplayOptions.interval) _.debouncedResume();
  }
  /**
   * stop the autoplay timer completely
   */
  stop() {
    const _ = this;
    _.isRunning = false;
    _.isSuspended = false;
    _.runToken++;
    if (_.timerId !== null) {
      clearTimeout(_.timerId);
      _.timerId = null;
    }
    if (_.ctx?.carousel) _.stopAnimation();
    _.updateAriaLive();
  }
  /**
   * destroy the autoplay, unbinding all events and clearing timers
   */
  destroy() {
    const _ = this;
    _.stop();
    if (_.ctx?.carousel) {
      _.ctx.carousel.style.removeProperty("animation");
      _.ctx.carousel.style.removeProperty("animation-play-state");
    }
    _.ctx.emitter.off(_.ctx.events.user.interacted, _.handlers.userInteracted);
    _.ctx.emitter.off(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
    _.ctx.emitter.off(_.ctx.events.store.canLoopChanged, _.handlers.canLoopChanged);
    _.ctx.emitter.off(_.ctx.events.window.hasFocus, _.handlers.windowFocused);
    _.ctx.emitter.off(_.ctx.events.window.lostFocus, _.handlers.windowBlurred);
    _.ctx.emitter.off(_.ctx.events.window.visibilityChange, _.handlers.visibilityChanged);
    _.reducedMotionQuery?.removeEventListener("change", _.handlers.reducedMotionChanged);
    if (_.debouncedResume.cancel) _.debouncedResume.cancel();
  }
};
//#endregion
//#region src/scripts/plugins/buttons.js
var Buttons = class {
  static pluginName = "buttons";
  /**
   * @constructor
   * @param {Object} ctx - the carousel context that the buttons will control
   */
  constructor(ctx) {
    const _ = this;
    _.ctx = ctx;
    _.navOptions = {};
    _.prevButton = null;
    _.nextButton = null;
    _.smartButtonImage = null;
    _.smartButtonsRaf = 0;
    _.initTimers = [];
    _.handlers = {
      previousClick: (e) => {
        _.ctx.emitter.emit(_.ctx.events.user.interacted, {
          via: "button",
          event: e,
        });
        _.ctx.commands.previous(5);
      },
      nextClick: (e) => {
        _.ctx.emitter.emit(_.ctx.events.user.interacted, {
          via: "button",
          event: e,
        });
        _.ctx.commands.next(-5);
      },
      buttonFocus: (e) => {
        _.ctx.emitter.emit(_.ctx.events.user.interacted, {
          via: "focus",
          event: e,
        });
      },
      optionsChanged: () => {
        _.reInit();
      },
      debouncedCheckDisabledState: _.ctx.utils.debounce(() => {
        _.checkDisabledState();
      }, 4),
      windowResize: _.ctx.utils.debounce(() => {
        _.#scheduleSmartButtonsUpdate();
      }, 60),
      imageLoad: () => {
        _.#scheduleSmartButtonsUpdate();
      },
    };
    _.init();
  }
  /**
   * initialize the navigation buttons
   */
  init() {
    const _ = this;
    _.navOptions = _.ctx.store.getOptions().navigation || {};
    _.queryDOM();
    if (!_.nextButton) _.nextButton = _.buildButton("next");
    if (!_.prevButton) _.prevButton = _.buildButton("prev");
    _.checkButtonOptions();
    _.bindEvents();
    _.checkDisabledState();
    _.initTimers.push(
      setTimeout(() => {
        _.updateSmartButtons();
      }, 8),
      setTimeout(() => {
        _.updateSmartButtons();
      }, 30)
    );
  }
  /**
   * reinitialize on carousel option changes
   */
  reInit() {
    const _ = this;
    _.navOptions = _.ctx.store.getOptions().navigation || {};
    _.checkButtonOptions();
    _.checkDisabledState();
    _.#scheduleSmartButtonsUpdate();
  }
  /**
   * bind all events (DOM and emitter)
   */
  bindEvents() {
    const _ = this;
    if (_.prevButton) {
      _.prevButton.addEventListener("click", _.handlers.previousClick, true);
      _.prevButton.addEventListener("focus", _.handlers.buttonFocus);
    }
    if (_.nextButton) {
      _.nextButton.addEventListener("click", _.handlers.nextClick, true);
      _.nextButton.addEventListener("focus", _.handlers.buttonFocus);
    }
    const slides = _.ctx.store.getSlides();
    if (slides.length > 0) {
      let firstImage = slides[0]?.querySelector("img") || false;
      if (firstImage && firstImage.complete) _.#scheduleSmartButtonsUpdate();
      else if (firstImage) {
        _.smartButtonImage = firstImage;
        firstImage.addEventListener("load", _.handlers.imageLoad, { once: true });
      }
    }
    _.ctx.emitter.on(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
    _.ctx.emitter.on(_.ctx.events.store.pageIndexChanged, _.handlers.debouncedCheckDisabledState);
    _.ctx.emitter.on(_.ctx.events.store.pageCountChanged, _.handlers.debouncedCheckDisabledState);
    _.ctx.emitter.on(_.ctx.events.store.slidesChanged, _.handlers.debouncedCheckDisabledState);
    _.ctx.emitter.on(_.ctx.events.store.canLoopChanged, _.handlers.debouncedCheckDisabledState);
    _.ctx.emitter.on(_.ctx.events.window.resize, _.handlers.windowResize);
  }
  /**
   * check button options and show/hide buttons accordingly
   */
  checkButtonOptions() {
    this.navOptions.showButtons ? this.showButtons() : this.hideButtons();
  }
  /**
   * query buttons from the dom
   */
  queryDOM() {
    const _ = this;
    const navOptions = _.navOptions;
    if (navOptions.previousButtonSelector)
      _.prevButton = document.querySelector(navOptions.previousButtonSelector);
    if (navOptions.nextButtonSelector)
      _.nextButton = document.querySelector(navOptions.nextButtonSelector);
    if (!_.prevButton) {
      const allPrevButtons = _.ctx.carousel.querySelectorAll("[data-action-tarot-previous]");
      _.prevButton =
        Array.from(allPrevButtons).find(
          (btn) => btn.closest("tarot-carousel") === _.ctx.carousel
        ) || null;
    }
    if (!_.nextButton) {
      const allNextButtons = _.ctx.carousel.querySelectorAll("[data-action-tarot-next]");
      _.nextButton =
        Array.from(allNextButtons).find(
          (btn) => btn.closest("tarot-carousel") === _.ctx.carousel
        ) || null;
    }
  }
  /**
   * build a navigation button if it doesn't exist
   * @param {string} type - 'prev' or 'next'
   * @returns {Element} the created button element
   */
  buildButton(type) {
    const isNext = type === "next";
    const dataAttr = isNext ? "data-action-tarot-next" : "data-action-tarot-previous";
    const html = `
			<button class="tarot-button" ${dataAttr} aria-label="${isNext ? "next slide" : "previous slide"}">
				<svg fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
					<title>${isNext ? "angle right" : "angle left"}</title>
					<path d="${
            isNext ? "m11 25 9-9-9-9" : "m21 7-9 9 9 9"
          }" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
				</svg>
			</button>
		`;
    this.ctx.carousel.insertAdjacentHTML("afterbegin", html);
    return this.ctx.carousel.querySelector(`[${dataAttr}]`);
  }
  /**
   * show the navigation buttons
   */
  showButtons() {
    const _ = this;
    const prevButton = _.prevButton;
    const nextButton = _.nextButton;
    if (prevButton && _.navOptions.showPreviousButton !== false) {
      prevButton.style.display = "";
      prevButton.classList.add("tarot-button", "tarot-previous");
    } else _.hidePrevButton();
    if (nextButton && _.navOptions.showNextButton !== false) {
      nextButton.style.display = "";
      nextButton.classList.add("tarot-button", "tarot-next");
    } else _.hideNextButton();
  }
  /**
   * hide both buttons
   */
  hideButtons() {
    this.hidePrevButton();
    this.hideNextButton();
  }
  /**
   * hide the prev button
   */
  hidePrevButton() {
    if (this.prevButton) this.prevButton.style.display = "none";
  }
  /**
   * hide the next button
   */
  hideNextButton() {
    if (this.nextButton) this.nextButton.style.display = "none";
  }
  #scheduleSmartButtonsUpdate() {
    const _ = this;
    if (_.smartButtonsRaf) cancelAnimationFrame(_.smartButtonsRaf);
    _.smartButtonsRaf = requestAnimationFrame(() => {
      _.smartButtonsRaf = 0;
      _.updateSmartButtons();
    });
  }
  updateSmartButtons() {
    const _ = this;
    const smartButtons = _.ctx.store.getOptions().navigation?.smartButtons || false;
    const prevButton = _.prevButton;
    const nextButton = _.nextButton;
    const viewport = _.ctx.viewport;
    const slides = _.ctx.store.getSlides();
    if (!viewport) return;
    if (!slides || slides.length === 0) return;
    if (!smartButtons) {
      if (prevButton) prevButton.classList.remove("tarot-smart-position");
      if (nextButton) nextButton.classList.remove("tarot-smart-position");
      return;
    }
    const firstSlide = slides[0];
    if (!firstSlide) return;
    const viewportStyles = window.getComputedStyle(viewport);
    const viewportTopPadding = parseInt(viewportStyles.paddingTop) || 0;
    let buttonTopPos = viewport.offsetHeight;
    const firstImage = firstSlide.querySelector("img");
    if (firstImage && firstImage.offsetHeight < buttonTopPos)
      buttonTopPos = firstImage.height + viewportTopPadding * 2;
    buttonTopPos = buttonTopPos / 2;
    if (prevButton) {
      prevButton.classList.add("tarot-smart-position");
      prevButton.style.top = `${buttonTopPos}px`;
    }
    if (nextButton) {
      nextButton.classList.add("tarot-smart-position");
      nextButton.style.top = `${buttonTopPos}px`;
    }
  }
  /**
   * check and update disabled state of buttons
   */
  checkDisabledState() {
    const _ = this;
    const state = _.ctx.store.getState();
    const page = state.pageIndex;
    const pageCount = state.pageCount;
    if (state.slideCount === 0 || pageCount <= 1) {
      if (_.prevButton) _.prevButton.disabled = true;
      if (_.nextButton) _.nextButton.disabled = true;
      return;
    }
    if (state.canLoop) {
      if (_.prevButton) _.prevButton.disabled = false;
      if (_.nextButton) _.nextButton.disabled = false;
      return;
    }
    if (_.prevButton) _.prevButton.disabled = page === 0;
    if (_.nextButton) _.nextButton.disabled = page === pageCount - 1;
  }
  /**
   * destroy the buttons, unbinding all events
   */
  destroy() {
    const _ = this;
    const emitter = _.ctx.emitter;
    const handlers = _.handlers;
    const EVENTS = _.ctx.events;
    if (_.prevButton) {
      _.prevButton.removeEventListener("click", handlers.previousClick, true);
      _.prevButton.removeEventListener("focus", handlers.buttonFocus);
    }
    if (_.nextButton) {
      _.nextButton.removeEventListener("click", handlers.nextClick, true);
      _.nextButton.removeEventListener("focus", handlers.buttonFocus);
    }
    if (_.smartButtonImage) {
      _.smartButtonImage.removeEventListener("load", _.handlers.imageLoad);
      _.smartButtonImage = null;
    }
    emitter.off(EVENTS.store.optionsChanged, handlers.optionsChanged);
    emitter.off(EVENTS.store.pageIndexChanged, handlers.debouncedCheckDisabledState);
    emitter.off(EVENTS.store.pageCountChanged, handlers.debouncedCheckDisabledState);
    emitter.off(EVENTS.store.slidesChanged, handlers.debouncedCheckDisabledState);
    emitter.off(EVENTS.store.canLoopChanged, handlers.debouncedCheckDisabledState);
    emitter.off(EVENTS.window.resize, handlers.windowResize);
    if (handlers.debouncedCheckDisabledState?.cancel) handlers.debouncedCheckDisabledState.cancel();
    if (handlers.windowResize?.cancel) handlers.windowResize.cancel();
    if (_.smartButtonsRaf) {
      cancelAnimationFrame(_.smartButtonsRaf);
      _.smartButtonsRaf = 0;
    }
    _.initTimers.forEach(clearTimeout);
    _.initTimers.length = 0;
    _.prevButton = null;
    _.nextButton = null;
  }
};
//#endregion
//#region src/scripts/plugins/pagination.js
/**
 * I used this link for referencing how to implement the pagedots
 * https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
 * "It is recommended that tabs activate automatically when they
 * receive focus as long as their associated tab panels are displayed
 * without noticeable latency. This typically requires tab panel
 * content to be preloaded. Otherwise, automatic activation slows
 * focus movement, which significantly hampers users' ability
 * to navigate efficiently across the tab list."
 * */
var paginationInstanceCount = 0;
var Pagination = class {
  static pluginName = "pagination";
  constructor(ctx) {
    const _ = this;
    _.ctx = ctx;
    _.instanceId = ++paginationInstanceCount;
    _.navOptions = {};
    _.paginationContainer = null;
    _.dotsList = null;
    _.isAutoGenerated = false;
    _.debouncedRender = _.ctx.utils.debounce(() => _.render(), 20);
    _.handlers = {
      paginationClick: (event) => {
        _.ctx.emitter.emit(_.ctx.events.user.interacted, {
          via: "pagination",
          event,
        });
        const target = event.target.closest("[data-action-tarot-go-to-page]");
        if (!target) return;
        const pageIndex = parseInt(target.getAttribute("data-page-index"), 10);
        _.activateDot(pageIndex);
      },
      keyDown: (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const tabs = Array.from(_.paginationContainer.querySelectorAll(".tarot-dots-button"));
        const currentIndex = tabs.findIndex((tab) => tab.getAttribute("tabIndex") === "0");
        let newIndex = currentIndex;
        const state = _.ctx.store.getState();
        switch (event.key) {
          case "ArrowRight":
            newIndex = currentIndex + 1;
            if (newIndex >= tabs.length) newIndex = state.canLoop ? 0 : currentIndex;
            break;
          case "ArrowLeft":
            newIndex = currentIndex - 1;
            if (newIndex < 0) newIndex = state.canLoop ? tabs.length - 1 : currentIndex;
            break;
          case "Home":
            newIndex = 0;
            break;
          case "End":
            newIndex = tabs.length - 1;
            break;
          default:
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        tabs.forEach((tab, i) => {
          tab.tabIndex = i === newIndex ? 0 : -1;
        });
        tabs[newIndex].focus();
        _.ctx.emitter.emit(_.ctx.events.user.interacted, {
          via: "key",
          event,
        });
        _.activateDot(newIndex);
      },
      optionsChanged: () => {
        _.reInit();
      },
      slidesChanged: () => {
        _.reInit();
      },
      pageChanged: () => {
        _.updateSelectedDot();
      },
    };
    _.init();
  }
  /**
   * query and setup the pagination container
   */
  queryDOM() {
    const _ = this;
    let container = null;
    if (_.navOptions && _.navOptions.paginationSelector)
      container = document.querySelector(_.navOptions.paginationSelector) || null;
    if (!container) {
      const allPaginationContainers = _.ctx.carousel.querySelectorAll("[data-tarot-pagination]");
      container =
        Array.from(allPaginationContainers).find(
          (el) => el.closest("tarot-carousel") === _.ctx.carousel
        ) || null;
    }
    _.dotsList = document.createElement("ul");
    _.dotsList.classList.add("tarot-dots-list");
    _.dotsList.setAttribute("role", "tablist");
    _.dotsList.setAttribute("aria-orientation", "horizontal");
    _.dotsList.setAttribute("aria-label", "carousel navigation");
    if (container) {
      _.isAutoGenerated = false;
      container.innerHTML = "";
      container.appendChild(_.dotsList);
      _.paginationContainer = container;
    } else {
      _.isAutoGenerated = true;
      _.ctx.carousel.appendChild(_.dotsList);
      _.paginationContainer = _.dotsList;
    }
  }
  init() {
    const _ = this;
    _.navOptions = _.ctx.store.getOptions().navigation || {};
    _.isAutoGenerated = false;
    _.queryDOM();
    _.bindEvents();
    _.render();
  }
  reInit() {
    this.navOptions = this.ctx.store.getOptions().navigation || {};
    this.debouncedRender();
  }
  bindEvents() {
    const _ = this;
    const emitter = _.ctx.emitter;
    const events = _.ctx.events.store;
    emitter.on(events.optionsChanged, _.handlers.optionsChanged);
    emitter.on(events.slidesChanged, _.handlers.slidesChanged);
    emitter.on(events.pageIndexChanged, _.handlers.pageChanged);
    _.paginationContainer.addEventListener("click", _.handlers.paginationClick, false);
    _.paginationContainer.addEventListener("keydown", _.handlers.keyDown, false);
  }
  render() {
    const _ = this;
    const state = _.ctx.store.getState();
    const page = state.pageIndex;
    const pageCount = state.pageCount;
    const carouselID = _.ctx.carousel.id || "";
    const tabIdPrefix = carouselID || `tarot-${_.instanceId}`;
    _.dotsList.innerHTML = "";
    for (let i = 0; i < pageCount; ++i) {
      const listItem = document.createElement("li");
      listItem.setAttribute("role", "presentation");
      const button = document.createElement("button");
      button.type = "button";
      button.classList.add("tarot-dots-button");
      button.setAttribute("role", "tab");
      button.setAttribute("data-page-index", i);
      button.setAttribute("data-action-tarot-go-to-page", "");
      button.setAttribute("aria-selected", page === i ? "true" : "false");
      button.tabIndex = page === i ? 0 : -1;
      button.setAttribute("aria-label", `page ${i + 1}`);
      button.id = `${tabIdPrefix}-tab-${i + 1}`;
      if (carouselID) button.setAttribute("aria-controls", carouselID);
      const span = document.createElement("span");
      span.className = "tarot-visually-hidden";
      span.textContent = `slide ${i + 1}`;
      button.appendChild(span);
      listItem.appendChild(button);
      _.dotsList.appendChild(listItem);
    }
    _.updateSelectedDot();
    if (_.navOptions && _.navOptions.showPagination) _.show();
    else _.hide();
  }
  activateDot(index) {
    this.ctx.commands.goToPage(index);
    this.updateSelectedDot();
  }
  updateSelectedDot() {
    const _ = this;
    const dots = _.paginationContainer.querySelectorAll(".tarot-dots-button");
    const currentPage = `${_.ctx.store.getState().pageIndex}`;
    dots.forEach((dot) => {
      if (dot.dataset.pageIndex === currentPage) {
        dot.setAttribute("aria-selected", "true");
        dot.tabIndex = 0;
      } else {
        dot.setAttribute("aria-selected", "false");
        dot.tabIndex = -1;
      }
    });
  }
  show() {
    this.paginationContainer.style.display = "";
  }
  hide() {
    this.paginationContainer.style.display = "none";
  }
  destroy() {
    const _ = this;
    if (_.paginationContainer) {
      _.paginationContainer.removeEventListener("click", _.handlers.paginationClick, false);
      _.paginationContainer.removeEventListener("keydown", _.handlers.keyDown, false);
    }
    _.ctx.emitter.off(_.ctx.events.store.optionsChanged, _.handlers.optionsChanged);
    _.ctx.emitter.off(_.ctx.events.store.slidesChanged, _.handlers.slidesChanged);
    _.ctx.emitter.off(_.ctx.events.store.pageIndexChanged, _.handlers.pageChanged);
    if (_.debouncedRender && typeof _.debouncedRender.cancel === "function")
      _.debouncedRender.cancel();
    if (
      _.isAutoGenerated &&
      _.paginationContainer &&
      _.paginationContainer.parentNode === _.ctx.carousel
    )
      _.ctx.carousel.removeChild(_.paginationContainer);
    _.paginationContainer = null;
    _.dotsList = null;
    _.debouncedRender = null;
  }
};
//#endregion
//#region src/scripts/tarot.js
/** 🔮 ✨ 🕯️ 🍄 🌙 ⭐ TAROT ⭐ 🌙 🍄 🕯️ ✨ 🔮 */
var Tarot = class Tarot extends HTMLElement {
  /** core effects (always included) */
  static effects = {
    carousel: CarouselEffect,
    fade: Fade,
  };
  /** @type {Array<Function>} core plugins (always included) */
  static plugins = [AsNavFor, SyncWith, Autoplay, Buttons, Pagination];
  /** @type {Map<string, Function>} optional plugins registered via registerPlugin() */
  static optionalPlugins = /* @__PURE__ */ new Map();
  /** @type {number} count of carousel instances created */
  static instanceCount = 0;
  /** @type {object} accumulated default options from registered plugins */
  static pluginDefaultOptions = {};
  /**
   * register an effect class using a canonical key
   * prefers a static identifier (effectName/slug/key), falls back to class name
   * @param {Function} effectClass
   */
  static registerEffect(effectClass) {
    const _ = this;
    if (!effectClass) {
      console.warn("tarot-carousel.registerEffect requires an effect class");
      return;
    }
    let effectName = effectClass.effectName;
    if (!effectName) {
      console.warn(
        "tarot-carousel.registerEffect: effect must have a static string id (e.g., effectName)"
      );
      return;
    }
    const key = String(effectName)
      .trim()
      .toLowerCase()
      .replace(/effect$/, "");
    if (_.effects[key]) console.warn(`tarot-carousel: overwriting existing effect '${key}'`);
    _.effects[key] = effectClass;
    if (effectClass.defaultOptions && typeof effectClass.defaultOptions === "object")
      _.pluginDefaultOptions = utils.deepMerge(_.pluginDefaultOptions, effectClass.defaultOptions);
    try {
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function")
        window.dispatchEvent(
          new CustomEvent("tarot:effect-registered", { detail: { effectName: key } })
        );
    } catch (e) {}
  }
  /**
   * derive a canonical key from a plugin class
   * prefers pluginName, falls back to class name
   * @param {Function} pluginClass
   * @returns {string|null}
   */
  static #getPluginKey(pluginClass) {
    let name = pluginClass.pluginName || pluginClass.name;
    if (!name) return null;
    return String(name)
      .trim()
      .toLowerCase()
      .replace(/plugin$/, "");
  }
  /**
   * register an optional plugin class
   * adds it to the static plugins array for future instances and
   * dispatches an event so already-connected instances can pick it up
   * @param {Function} pluginClass
   */
  static registerPlugin(pluginClass) {
    const _ = this;
    if (!pluginClass) {
      console.warn("tarot-carousel.registerPlugin requires a plugin class");
      return;
    }
    const key = _.#getPluginKey(pluginClass);
    if (!key) {
      console.warn(
        "tarot-carousel.registerPlugin: plugin must have a static pluginName or class name"
      );
      return;
    }
    if (_.optionalPlugins.has(key)) {
      console.warn(`tarot-carousel: overwriting existing optional plugin '${key}'`);
      const oldPlugin = _.optionalPlugins.get(key);
      const idx = _.plugins.indexOf(oldPlugin);
      if (idx !== -1) _.plugins.splice(idx, 1);
    }
    _.optionalPlugins.set(key, pluginClass);
    if (pluginClass.defaultOptions && typeof pluginClass.defaultOptions === "object")
      _.pluginDefaultOptions = utils.deepMerge(_.pluginDefaultOptions, pluginClass.defaultOptions);
    if (!_.plugins.includes(pluginClass)) _.plugins.push(pluginClass);
    try {
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function")
        window.dispatchEvent(
          new CustomEvent("tarot:plugin-registered", {
            detail: {
              pluginName: key,
              pluginClass,
            },
          })
        );
    } catch (e) {}
  }
  /**
   * register a plugin class to be initialized on new instances
   * delegates to registerPlugin so late-loaded plugins also reach connected instances
   * @param {Function} plugin
   * @returns {typeof Tarot}
   */
  static use(plugin) {
    this.registerPlugin(plugin);
    return this;
  }
  #eventEmitter;
  #store;
  #ctx;
  #transitionManager;
  #trackAnimator;
  #slideManager;
  #optionsManager;
  #effectManager;
  #dragHandler;
  #windowEvents;
  #frameEngine;
  #pluginInstances = [];
  #initializedPluginKeys = /* @__PURE__ */ new Set();
  #pluginRegisteredHandler = null;
  #coreHandlers = null;
  #isRefreshing = false;
  #viewport;
  #track;
  #announcements;
  /** creates a new tarotcarousel instance */
  constructor() {
    super();
    const _ = this;
    if (!_.id) _.id = `tarot-carousel-${Tarot.instanceCount}`;
    Tarot.instanceCount++;
    _.#eventEmitter = new EventEmitter();
    _.#store = new DataStore(_.#eventEmitter);
  }
  /** custom element connected lifecycle hook */
  async connectedCallback() {
    const _ = this;
    if (!customElements.get("tarot-slide")) {
      await customElements.whenDefined("tarot-slide");
      await new Promise(requestAnimationFrame);
    }
    if (!_.isConnected) return;
    if (!_.#eventEmitter) _.#eventEmitter = new EventEmitter();
    if (!_.#store) _.#store = new DataStore(_.#eventEmitter);
    _.#queryDOMElements();
    _.setAttribute("tabindex", "0");
    _.setAttribute("role", "group");
    _.setAttribute("aria-roledescription", "carousel");
    _.#ctx = _.#createModuleContext();
    const ctx = _.#ctx;
    _.#optionsManager = new OptionsManager(ctx);
    _.#windowEvents = new WindowEvents(ctx);
    _.#slideManager = new SlideManager(ctx);
    _.#effectManager = new EffectManager(ctx, _.constructor.effects);
    _.#dragHandler = new DragHandler(ctx);
    _.#trackAnimator = new TrackAnimator(ctx);
    _.#transitionManager = new TransitionManager(ctx, _.#trackAnimator);
    _.#frameEngine = new FrameEngine(ctx);
    _.#bindCoreEvents();
    _.#effectManager.loadCurrentEffect();
    _.#recomputeLayout();
    _.#effectManager.reInit();
    _.constructor.plugins.forEach((PluginClass) => {
      try {
        const key = _.constructor.#getPluginKey(PluginClass);
        if (key && _.#initializedPluginKeys.has(key)) return;
        const pluginInstance = new PluginClass(ctx);
        _.#pluginInstances.push(pluginInstance);
        if (key) _.#initializedPluginKeys.add(key);
      } catch (error) {
        console.error(`plugin ${PluginClass?.name || "(anonymous)"} failed to initialize:`, error);
      }
    });
    _.#pluginRegisteredHandler = (e) => {
      const { pluginName, pluginClass } = e.detail;
      if (_.#initializedPluginKeys.has(pluginName)) return;
      try {
        const pluginInstance = new pluginClass(ctx);
        _.#pluginInstances.push(pluginInstance);
        _.#initializedPluginKeys.add(pluginName);
        if (pluginClass.defaultOptions) _.#optionsManager.setUserOptions({});
      } catch (error) {
        console.error(`plugin ${pluginName} failed to late-initialize:`, error);
      }
    };
    window.addEventListener("tarot:plugin-registered", _.#pluginRegisteredHandler);
    const initial = _.#store.getOptions().initialIndex ?? 0;
    _.jumpToSlide(initial);
    _.#frameEngine.requestFrame();
    _.#eventEmitter.emit(EVENTS.carousel.ready, {});
  }
  /**
   * build and freeze a shared module context
   * @returns {object} ctx
   */
  #createModuleContext() {
    const _ = this;
    return Object.freeze({
      emitter: _.#eventEmitter,
      events: EVENTS,
      store: _.#store,
      getPluginDefaults: () => Tarot.pluginDefaultOptions,
      getEffectClass: (name) => _.constructor.effects[name] || null,
      utils,
      carousel: _,
      viewport: _.#viewport,
      track: _.#track,
      announcements: _.#announcements,
      commands: {
        goToSlide: (index, velocity = 0, movementType = "animate") =>
          _.goToSlide(index, velocity, movementType),
        jumpToSlide: (index) => _.jumpToSlide(index),
        next: (velocity = 0) => _.next(velocity),
        previous: (velocity = 0) => _.previous(velocity),
        goToPage: (page, velocity = 0, movementType = "animate") =>
          _.goToPage(page, velocity, movementType),
        jumpToPage: (page) => _.jumpToPage(page),
        settleTrack: () => _.#settleTrack(),
        stopAnimations: () => _.#trackAnimator.stop(),
        requestTrackPosition: (position) => _.requestTrackPosition(position),
        getEffect: () => _.#effectManager.getEffect(),
        getSlideManager: () => _.#slideManager,
        requestFrame: () => _.#frameEngine.requestFrame(0),
        driveTrackPosition: ({
          deltaPx,
          positionPercent,
          velocity = 0,
          movementType = "scroll",
        } = {}) => {
          _.#trackAnimator.drivePosition({
            deltaPx,
            positionPercent,
            velocity,
            movementType,
          });
        },
      },
    });
  }
  /**
   * find or create required child elements
   * ensures there is a <tarot-viewport> wrapping a <tarot-track>
   * creates announcement element for screen reader navigation feedback
   */
  #queryDOMElements() {
    const _ = this;
    let viewport = _.querySelector(":scope tarot-viewport");
    let track = _.querySelector(":scope tarot-track");
    if (!viewport && !track)
      throw new Error("tarot-carousel: missing both <tarot-viewport> and <tarot-track> elements");
    if (track && !viewport) {
      viewport = document.createElement("tarot-viewport");
      track.parentNode.insertBefore(viewport, track);
      viewport.appendChild(track);
    }
    if (viewport && !track) {
      track = document.createElement("tarot-track");
      while (viewport.firstChild) track.appendChild(viewport.firstChild);
      viewport.appendChild(track);
    }
    const announcements = document.createElement("div");
    announcements.className = "tarot-visually-hidden tarot-announcements";
    announcements.id = `tarot-announcements-${_.id}`;
    announcements.setAttribute("aria-live", "polite");
    announcements.setAttribute("aria-atomic", "true");
    _.insertBefore(announcements, _.firstChild);
    _.#viewport = viewport;
    _.#track = track;
    _.#announcements = announcements;
  }
  /** subscribe to core events and coordinate managers */
  #bindCoreEvents() {
    const _ = this;
    const { emitter, events } = _.#ctx;
    const debouncedRefreshLayout = _.#ctx.utils.debounce(() => _.#refreshLayout(), 4);
    _.#coreHandlers = {
      debouncedRefreshLayout,
      effectLoaded: ({ effectName }) => {
        if (_.#isRefreshing) return;
        if (effectName !== _.#optionsManager.userOptions?.effect) return;
        _.#optionsManager.applyMergedOptions();
        debouncedRefreshLayout.cancel();
        _.#effectManager.getEffect()?.reInit?.();
        _.#recomputeLayout();
        _.jumpToSlide(_.#store.getState().renderIndex);
      },
      slidesClick: ({ index }) => {
        _.#store.setState({ selectedIndex: index });
        if (_.#store.getOptions().goToSelectedSlide) _.goToSlide(index);
      },
      keyboardArrow: ({ direction }) => {
        direction === -1 ? _.previous() : _.next();
      },
    };
    emitter.on(events.store.optionsChanged, _.#coreHandlers.debouncedRefreshLayout);
    emitter.on(events.window.resize, _.#coreHandlers.debouncedRefreshLayout);
    emitter.on(events.store.slidesChanged, _.#coreHandlers.debouncedRefreshLayout);
    emitter.on(events.effect.loaded, _.#coreHandlers.effectLoaded);
    emitter.on(events.slides.click, _.#coreHandlers.slidesClick);
    emitter.on(events.keyboard.arrow, _.#coreHandlers.keyboardArrow);
  }
  /** unbind all core event handlers registered in #bindCoreEvents */
  #unbindCoreEvents() {
    const _ = this;
    if (!_.#coreHandlers || !_.#ctx) return;
    const { emitter, events } = _.#ctx;
    emitter.off(events.store.optionsChanged, _.#coreHandlers.debouncedRefreshLayout);
    emitter.off(events.window.resize, _.#coreHandlers.debouncedRefreshLayout);
    emitter.off(events.store.slidesChanged, _.#coreHandlers.debouncedRefreshLayout);
    emitter.off(events.effect.loaded, _.#coreHandlers.effectLoaded);
    emitter.off(events.slides.click, _.#coreHandlers.slidesClick);
    emitter.off(events.keyboard.arrow, _.#coreHandlers.keyboardArrow);
    _.#coreHandlers.debouncedRefreshLayout?.cancel?.();
    _.#coreHandlers = null;
  }
  /**
   * recompute layout widths and page count using current slides/options
   * @param {object} [optOverride] - optional options to use for this pass
   */
  #recomputeLayout(optOverride) {
    const _ = this;
    const options = optOverride || _.#store.getOptions();
    const slides = _.#store.getSlides();
    const boundsEl = resolveVisibilityBoundsElement(
      options.visibilityBoundsElement,
      _,
      _.#viewport
    );
    const widths = calculateWidths({
      viewportEl: _.#viewport,
      boundsEl,
      options,
      slideCount: slides.length,
    });
    _.#store.setWidths(widths);
    const transformPoints = calculateTransformPoints(_.#ctx);
    _.#store.setTransformPoints(transformPoints);
    const pageCount = calculatePageCount({
      loop: options.loop,
      slidesPerMove: options.slidesPerMove,
      slidesPerView: options.slidesPerView,
      slideCount: slides.length,
      centerSelectedSlide: options.centerSelectedSlide,
    });
    const loopBuffer = options.rules.loopBuffer;
    const canLoop = _.#ctx.utils.canLoop(slides.length, options, loopBuffer);
    _.#store.setState({
      pageCount,
      canLoop,
    });
    const { snapPoints, firstSnapPoint, lastSnapPoint } = calculateSnapPoints(
      widths,
      options,
      _.#store.getState()
    );
    _.#store.setState({
      snapPoints,
      firstSnapPoint,
      lastSnapPoint,
    });
  }
  /**
   * Refreshes layout metrics, reinits effect, and maintains slide position
   * Used by options/resize/slides change handlers
   */
  #refreshLayout() {
    const _ = this;
    _.#isRefreshing = true;
    _.#recomputeLayout();
    _.#effectManager.reInit();
    _.#isRefreshing = false;
    _.jumpToSlide(_.#store.getState().renderIndex);
  }
  /**
   * advance to the next page
   * @param {number} [velocity=0]
   */
  next(velocity = 0) {
    if (!this.#store) return;
    this.goToPage(this.state.pageIndex + 1, velocity);
  }
  /**
   * go back to the previous page
   * @param {number} [velocity=0]
   */
  previous(velocity = 0) {
    if (!this.#store) return;
    this.goToPage(this.state.pageIndex - 1, velocity);
  }
  /**
   * settle the track back to current position
   * used after drag below threshold
   */
  #settleTrack(velocity = 0) {
    const state = this.#store.getState();
    this.#eventEmitter.emit(EVENTS.movement.requested, {
      index: state.renderIndex,
      pageIndex: state.pageIndex,
      velocity,
      movementType: "settle",
    });
  }
  /**
   * animate to a specific slide index (logical)
   * @param {number} index
   * @param {number} [velocity=0]
   */
  goToSlide(index, velocity = 0, movementType = "animate") {
    if (index === void 0) return;
    if (!this.#store) return;
    const _ = this;
    const state = _.#store.getState();
    const slides = _.#store.getSlides();
    const slideCount = state.slideCount ?? slides.length;
    if (slideCount === 0) return;
    if (index < 0) {
      index = state.canLoop ? ((index % slideCount) + slideCount) % slideCount : 0;
      if (!state.canLoop && !velocity) velocity = 10;
    } else if (index >= slideCount) {
      index = state.canLoop ? index % slideCount : slideCount - 1;
      if (!state.canLoop && !velocity) velocity = -10;
    }
    _.#eventEmitter.emit(EVENTS.movement.requested, {
      index,
      pageIndex: _.#getPageIndexForSlide(index),
      velocity,
      movementType,
    });
  }
  /**
   * jump (no animation) to a specific slide
   * @param {number} index
   */
  jumpToSlide(index) {
    this.goToSlide(index, 0, "jump");
  }
  /**
   * go to a page (converts page -> slide) with animation
   * @param {number} newPage
   * @param {number} [velocity=0]
   * @param {string} [movementType='animate']
   */
  goToPage(newPage, velocity = 0, movementType = "animate") {
    if (newPage === void 0) return;
    if (!this.#store) return;
    const _ = this;
    const state = _.#store.getState();
    const options = _.#store.getOptions();
    if (state.pageCount === 0) return;
    if (newPage < 0) {
      newPage = state.canLoop
        ? ((newPage % state.pageCount) + state.pageCount) % state.pageCount
        : 0;
      if (!state.canLoop && !velocity) velocity = 10;
    } else if (newPage >= state.pageCount) {
      newPage = state.canLoop ? 0 : state.pageCount - 1;
      if (!state.canLoop && !velocity) velocity = -10;
    }
    const newIndex = newPage * (options.slidesPerMove ?? 1);
    _.goToSlide(newIndex, velocity, movementType);
  }
  /**
   * jump directly to a page (no animation)
   * @param {number} newPage
   */
  jumpToPage(newPage) {
    this.goToPage(newPage, 0, "jump");
  }
  /**
   * request a specific track position (continuous positioning system)
   * @param {number|string} position - position to move to:
   *   - number: treated as percentage (0-100)
   *   - string ending in '%': percentage (e.g., '50%')
   *   - string ending in 'px': pixel position (e.g., '200px')
   *   - other string: treated as percentage number
   */
  requestTrackPosition(position) {
    const _ = this;
    if (position === void 0 || position === null) return;
    if (!_.#store) return;
    let trackPosition = 0;
    if (typeof position === "string")
      if (position.endsWith("px")) trackPosition = parseFloat(position.replace("px", ""));
      else if (position.endsWith("%")) {
        const percent = parseFloat(position.replace("%", ""));
        trackPosition = _.#convertPercentToTrackPos(percent);
      } else {
        const percent = parseFloat(position);
        trackPosition = _.#convertPercentToTrackPos(percent);
      }
    else if (typeof position === "number") trackPosition = _.#convertPercentToTrackPos(position);
    else {
      console.warn("requestTrackPosition: invalid position type", position);
      return;
    }
    _.#eventEmitter.emit(EVENTS.movement.requested, {
      trackPosition,
      velocity: 0,
      movementType: "jump",
    });
  }
  /**
   * convert percentage (0-100) to track position based on last page position
   * @param {number} percent - percentage from 0 to 100
   * @returns {number} track position in pixels
   * @private
   */
  #convertPercentToTrackPos(percent) {
    const _ = this;
    const state = _.#store.getState();
    const options = _.#store.getOptions();
    percent = Math.max(0, Math.min(100, percent));
    if (state.pageCount <= 1) return 0;
    const lastPageTrackPos = getTrackPosForIndex(
      (state.pageCount - 1) * (options.slidesPerMove ?? 1),
      _.#store.getWidths(),
      options,
      state
    );
    return (percent / 100) * lastPageTrackPos;
  }
  /** compute page index for a given slide index */
  #getPageIndexForSlide(slideIndex) {
    const perMove = this.#store.getOptions().slidesPerMove ?? 1;
    return Math.floor(slideIndex / perMove);
  }
  /** immutable runtime state snapshot (empty after disconnect) */
  get state() {
    return this.#store?.getState() ?? {};
  }
  /** immutable visibility snapshot (empty after disconnect) */
  get visibility() {
    return this.#store?.getVisibility() ?? {};
  }
  /** readonly slides (internal descriptors; empty after disconnect) */
  get slides() {
    return this.#store?.getSlides() ?? [];
  }
  /** immutable options snapshot (empty after disconnect) */
  get options() {
    return this.#store?.getOptions() ?? {};
  }
  get viewport() {
    return this.#viewport;
  }
  get track() {
    return this.#track;
  }
  /** registered effect keys */
  get effects() {
    return Object.keys(this.constructor.effects);
  }
  /** user-provided options (before defaults applied) */
  get userOptions() {
    return this.#optionsManager?.userOptions ?? {};
  }
  /** update options (merges with existing) */
  updateOptions(newOptions) {
    this.#optionsManager?.setUserOptions(newOptions);
  }
  /** current slide index */
  get index() {
    return this.state.renderIndex;
  }
  /** current page index */
  get page() {
    return this.state.pageIndex;
  }
  /** selected slide index */
  get selectedIndex() {
    return this.state.selectedIndex;
  }
  setSelectedIndex(index) {
    const _ = this;
    if (!_.#store) return;
    const slideCount = _.#store.getSlides().length;
    if (index < 0 || index >= slideCount) {
      console.warn(`setSelectedIndex: index ${index} out of bounds (0-${slideCount - 1})`);
      return;
    }
    _.#store.setState({ selectedIndex: index });
    if (_.#store.getOptions().goToSelectedSlide) _.goToSlide(index);
  }
  /** currently selected slide element */
  get selectedSlide() {
    return this.#store?.getSlides()[this.state.selectedIndex];
  }
  getSlideAtIndex(index) {
    return this.#store?.getSlides()[index];
  }
  /**
   * Add a slide to the carousel
   * @param {string|HTMLElement} element - HTML string or DOM element to add
   * @param {number} [index] - Optional index to insert at (appends to end if omitted)
   */
  addSlide(element, index) {
    this.#slideManager?.addSlide(element, index);
  }
  /**
   * Remove a slide from the carousel
   * @param {number} index - Index of slide to remove
   */
  removeSlide(index) {
    this.#slideManager?.removeSlide(index);
  }
  /**
   * Set slide state for visibility/transitions
   * @param {string|number} indexOrState - State to apply to all slides, or slide index
   * @param {string} [state] - State when first param is index ('active', 'hidden', 'disabled')
   */
  setSlideState(indexOrState, state) {
    if (!this.#store) return;
    const slides = this.#store.getSlides();
    if (typeof indexOrState === "string")
      slides.forEach((slide) => {
        if (slide.getAttribute("state") !== "disabled") slide.setAttribute("state", indexOrState);
      });
    else {
      const slide = slides[indexOrState];
      if (slide) slide.setAttribute("state", state);
    }
  }
  /**
   * subscribe to an event
   * External listeners are deferred to next tick to prevent blocking the carousel
   * @param {string} event
   * @param {Function} listener
   */
  on(event, listener) {
    this.#eventEmitter?.on(event, listener, { defer: true });
  }
  /**
   * unsubscribe from an event
   * @param {string} event
   * @param {Function} listener
   */
  off(event, listener) {
    this.#eventEmitter?.off(event, listener);
  }
  /** custom element disconnected lifecycle hook — full teardown */
  disconnectedCallback() {
    const _ = this;
    if (_.#pluginRegisteredHandler) {
      window.removeEventListener("tarot:plugin-registered", _.#pluginRegisteredHandler);
      _.#pluginRegisteredHandler = null;
    }
    _.#initializedPluginKeys.clear();
    _.#pluginInstances.forEach((plugin) => plugin?.destroy?.());
    _.#pluginInstances.length = 0;
    _.#unbindCoreEvents();
    _.#frameEngine?.destroy?.();
    _.#transitionManager?.destroy?.();
    _.#trackAnimator?.destroy?.();
    _.#dragHandler?.destroy?.();
    _.#effectManager?.destroy?.();
    _.#slideManager?.destroy?.();
    _.#windowEvents?.destroy?.();
    _.#optionsManager?.destroy?.();
    _.#frameEngine = null;
    _.#transitionManager = null;
    _.#trackAnimator = null;
    _.#dragHandler = null;
    _.#effectManager = null;
    _.#slideManager = null;
    _.#windowEvents = null;
    _.#optionsManager = null;
    _.removeAttribute("role");
    _.removeAttribute("aria-roledescription");
    if (_.#announcements?.parentNode) _.#announcements.parentNode.removeChild(_.#announcements);
    _.#announcements = null;
    _.#store?.destroy?.();
    _.#store = null;
    _.#eventEmitter?.destroy?.();
    _.#eventEmitter = null;
    _.#ctx = null;
  }
};
for (const effectClass of Object.values(Tarot.effects))
  if (effectClass.defaultOptions && typeof effectClass.defaultOptions === "object")
    Tarot.pluginDefaultOptions = utils.deepMerge(
      Tarot.pluginDefaultOptions,
      effectClass.defaultOptions
    );
//#endregion
//#region src/scripts/core/custom-elements.js
var TarotViewport = class extends HTMLElement {
  constructor() {
    super();
  }
};
var TarotTrack = class extends HTMLElement {
  constructor() {
    super();
  }
};
var TarotSlide = class extends HTMLElement {
  constructor() {
    super();
    this._index = 0;
    this._renderIndex = 0;
    this._selected = false;
    this._trackPosition = 0;
    this._renderPosition = 0;
    this._centerPoint = 0;
  }
  connectedCallback() {
    this.setAttribute("role", "group");
    this.setAttribute("aria-roledescription", "slide");
  }
  hide() {
    this.style.visibility = "hidden";
    this.style.pointerEvents = "none";
  }
  show() {
    this.style.visibility = "";
    this.style.pointerEvents = "";
  }
};
var TarotContent = class extends HTMLElement {
  constructor() {
    super();
  }
};
var TarotSlideIcon = class extends HTMLElement {
  constructor() {
    super();
  }
};
if (!customElements.get("tarot-viewport")) customElements.define("tarot-viewport", TarotViewport);
if (!customElements.get("tarot-track")) customElements.define("tarot-track", TarotTrack);
if (!customElements.get("tarot-slide")) customElements.define("tarot-slide", TarotSlide);
if (!customElements.get("tarot-content")) customElements.define("tarot-content", TarotContent);
if (!customElements.get("tarot-slide-icon"))
  customElements.define("tarot-slide-icon", TarotSlideIcon);
//#endregion
//#region src/index.js
(function () {
  if (typeof window !== "undefined" && Array.isArray(window.TarotEffectQueue))
    window.TarotEffectQueue.forEach(function (item) {
      if (item && item.factory) {
        var EffectClass = item.factory(TarotEffect);
        Tarot.registerEffect(EffectClass);
      } else if (typeof item === "function") Tarot.registerEffect(item);
    });
  if (typeof window !== "undefined")
    window.TarotEffectQueue = {
      push: function (item) {
        if (item && item.factory) {
          var EffectClass = item.factory(TarotEffect);
          Tarot.registerEffect(EffectClass);
        } else if (typeof item === "function") Tarot.registerEffect(item);
      },
    };
})();
(function () {
  if (typeof window !== "undefined" && Array.isArray(window.TarotPluginQueue))
    window.TarotPluginQueue.forEach(function (item) {
      if (item && item.plugin) Tarot.registerPlugin(item.plugin);
      else if (typeof item === "function") Tarot.registerPlugin(item);
    });
  if (typeof window !== "undefined")
    window.TarotPluginQueue = {
      push: function (item) {
        if (item && item.plugin) Tarot.registerPlugin(item.plugin);
        else if (typeof item === "function") Tarot.registerPlugin(item);
      },
    };
})();
if (!customElements.get("tarot-carousel")) customElements.define("tarot-carousel", Tarot);
//#endregion
export { Tarot, Tarot as default, TarotEffect };

//# sourceMappingURL=tarot.esm.js.map
