/**
 * <media-loader> Web Component
 *
 * Wraps <img> and <video> elements and signals when all of them have finished
 * loading. Once every child media element is ready, the component:
 *   1. Sets a `ready` attribute on itself (useful for CSS transitions).
 *   2. Dispatches a `media-loader:ready` CustomEvent.
 *
 * The `ready` attribute doubles as a guard so the event only fires once.
 *
 * @example
 * <media-loader>
 *   <img src="hero.jpg" alt="Hero">
 *   <video src="clip.mp4" autoplay muted></video>
 * </media-loader>
 *
 * // CSS
 * media-loader { opacity: 0; transition: opacity 0.3s; }
 * media-loader[ready] { opacity: 1; }
 *
 * // JS
 * document.querySelector('media-loader')
 *   .addEventListener('media-loader:ready', () => { ... });
 */
class MediaLoader extends HTMLElement {
  _$elements = [];

  connectedCallback() {
    this.querySelectorAll("img, video").forEach(($element) => {
      if ($element instanceof HTMLVideoElement) {
        $element.addEventListener("loadeddata", this._test.bind(this));
        $element.addEventListener("loadedmetadata", this._test.bind(this));
        $element.addEventListener("canplay", this._test.bind(this));
        $element.addEventListener("canplaythrough", this._test.bind(this));
        $element.addEventListener("playing", this._test.bind(this));
      } else {
        $element.addEventListener("load", this._test.bind(this));
      }
      this._$elements.push($element);
    });

    this._test();
  }

  _test() {
    if (this.hasAttribute("ready")) return;
    for (let i = 0; i < this._$elements.length; i++) {
      const $element = this._$elements[i];

      if (
        ($element instanceof HTMLVideoElement && $element.readyState < 3) ||
        ($element instanceof HTMLImageElement && !$element.complete)
      ) {
        return;
      }
    }
    this._setReady();
  }

  _setReady() {
    this.setAttribute("ready", "");
    const event = new CustomEvent(`media-loader:ready`);
    this.dispatchEvent(event);
  }
}

if (!customElements.get("media-loader")) {
  customElements.define("media-loader", MediaLoader);
}
