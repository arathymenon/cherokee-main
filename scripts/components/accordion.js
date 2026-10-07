/**
 * <accordion-block> Web Component
 *
 * Adds smooth height animations to native <details>/<summary> elements using
 * the Web Animations API (WAAPI). Without this, <details> toggles open/closed
 * instantly — this component animates the height transition in both directions.
 *
 * The animation can be interrupted mid-way (e.g. clicking while expanding will
 * reverse into a collapse) because each new animation cancels the previous one.
 *
 * Configurable via data attributes:
 *   - data-animation-duration        — Duration in ms (default: 300).
 *   - data-animation-timing-function — CSS easing function (default: "ease").
 *
 * @see https://css-tricks.com/how-to-animate-the-details-element/
 *
 * @example
 * <accordion-block data-animation-duration="400">
 *   <details>
 *     <summary>Question</summary>
 *     <div>Answer content here.</div>
 *   </details>
 * </accordion-block>
 */
class AccordionBlock extends HTMLElement {
  connectedCallback() {
    this.el = this.querySelector("details");
    this.summary = this.querySelector("summary");
    this.content = this.summary.nextElementSibling;

    //config
    this.config = {
      animationDuration: this.dataset.animationDuration || 300,
      animationTimingFunction: this.dataset.animationTimingFunction || "ease",
    };

    // Store the animation object (so we can cancel it if needed)
    this.animation = null;
    // Store if the element is closing
    this.isClosing = false;
    // Store if the element is expanding
    this.isExpanding = false;
    // Detect user clicks on the summary element
    this.summary.addEventListener("click", (e) => this.onClick(e));
  }

  onClick(e) {
    e.preventDefault();
    this.el.style.overflow = "hidden";
    if (this.isClosing || !this.el.open) {
      this.open();
    } else if (this.isExpanding || this.el.open) {
      this.shrink();
    }
  }

  shrink() {
    // Set the element as "being closed"
    this.isClosing = true;

    // Store the current height of the element
    const startHeight = `${this.el.offsetHeight}px`;
    // Calculate the height of the summary
    const endHeight = `${this.summary.offsetHeight}px`;

    // If there is already an animation running
    if (this.animation) {
      // Cancel the current animation
      this.animation.cancel();
    }

    // Start a WAAPI animation
    this.startAnimation(startHeight, endHeight);

    // When the animation is complete, call onAnimationFinish()
    this.animation.onfinish = () => this.onAnimationFinish(false);
    // If the animation is cancelled, isClosing variable is set to false
    this.animation.oncancel = () => (this.isClosing = false);
  }

  open() {
    // Apply a fixed height on the element
    this.el.style.height = `${this.el.offsetHeight}px`;
    // Force the [open] attribute on the details element
    this.el.open = true;
    // Wait for the next frame to call the expand function
    window.requestAnimationFrame(() => this.expand());
  }

  expand() {
    // Set the element as "being expanding"
    this.isExpanding = true;
    // Get the current fixed height of the element
    const startHeight = `${this.el.offsetHeight}px`;
    // Calculate the open height of the element (summary height + content height)
    const endHeight = `${
      this.summary.offsetHeight + this.content.offsetHeight
    }px`;

    // If there is already an animation running
    if (this.animation) {
      // Cancel the current animation
      this.animation.cancel();
    }

    // Start a WAAPI animation
    this.startAnimation(startHeight, endHeight);
    // When the animation is complete, call onAnimationFinish()
    this.animation.onfinish = () => this.onAnimationFinish(true);
    // If the animation is cancelled, isExpanding variable is set to false
    this.animation.oncancel = () => (this.isExpanding = false);
  }

  onAnimationFinish(open) {
    // Set the open attribute based on the parameter
    this.el.open = open;
    // Clear the stored animation
    this.animation = null;
    // Reset isClosing & isExpanding
    this.isClosing = false;
    this.isExpanding = false;
    // Remove the overflow hidden and the fixed height
    this.el.style.height = this.el.style.overflow = "";
  }

  startAnimation(start, end) {
    this.animation = this.el.animate(
      { height: [start, end] },
      {
        duration: this.config.animationDuration,
        easing: this.config.animationTimingFunction,
      }
    );
  }
}

customElements.define("accordion-block", AccordionBlock);
