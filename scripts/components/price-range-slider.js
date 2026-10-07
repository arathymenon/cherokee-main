import { debounce } from "../utilities/helpers";

class PriceRangeSlider extends HTMLElement {
  connectedCallback() {
    this._rangeMax = parseFloat(this.dataset.rangeMax) || 100;

    this._minInput = this.querySelector('[data-price-range-input="min"]');
    this._maxInput = this.querySelector('[data-price-range-input="max"]');
    this._minHandle = this.querySelector('[data-price-range-handle="min"]');
    this._maxHandle = this.querySelector('[data-price-range-handle="max"]');
    this._fill = this.querySelector("[data-price-range-fill]");

    this._minHandle.addEventListener("input", () => {
      const minVal = parseFloat(this._minHandle.value);
      const maxVal = parseFloat(this._maxHandle.value);
      if (minVal > maxVal) this._minHandle.value = maxVal;
      this._minInput.value = this._minHandle.value;
      this._updateFill();
    });

    this._maxHandle.addEventListener("input", () => {
      const minVal = parseFloat(this._minHandle.value);
      const maxVal = parseFloat(this._maxHandle.value);
      if (maxVal < minVal) this._maxHandle.value = minVal;
      this._maxInput.value = this._maxHandle.value;
      this._updateFill();
    });

    this._minHandle.addEventListener("change", () => {
      this._minInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    this._maxHandle.addEventListener("change", () => {
      this._maxInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const syncFromInputs = debounce(() => {
      const minVal = parseFloat(this._minInput.value) || 0;
      const maxVal = parseFloat(this._maxInput.value) || this._rangeMax;
      this._minHandle.value = Math.min(minVal, maxVal);
      this._maxHandle.value = Math.max(minVal, maxVal);
      this._updateFill();
    }, 300);

    this._minInput.addEventListener("input", syncFromInputs);
    this._maxInput.addEventListener("input", syncFromInputs);

    this._updateFill();
  }

  _updateFill() {
    const min = parseFloat(this._minHandle.value) || 0;
    const max = parseFloat(this._maxHandle.value) || this._rangeMax;
    const leftPercent = (min / this._rangeMax) * 100;
    const rightPercent = (max / this._rangeMax) * 100;
    this._fill.style.left = leftPercent + "%";
    this._fill.style.width = rightPercent - leftPercent + "%";
  }
}

customElements.define("price-range-slider", PriceRangeSlider);
