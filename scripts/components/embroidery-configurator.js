import { formatMoney } from "../utilities/helpers.js";

const MAX_LINE_LENGTH = 20;
const LINE_PATTERN = /^[A-Za-z0-9 !/'&.,\-]*$/;
const LINE_DIRTY = "data-embroidery-line-dirty";
const SET_CODE_COUNT = 100;

const selectors = {
  config: "[data-embroidery-config]",
  open: "[data-embroidery-open]",
  panel: "[data-embroidery-panel]",
  status: "[data-embroidery-status]",
  price: "[data-embroidery-price]",
  priceStarting: "[data-embroidery-price-starting]",
  priceStartingValue: "[data-embroidery-price-starting-value]",
  priceApplied: "[data-embroidery-price-applied]",
  tab: "[data-embroidery-tab]",
  tabLabel: "[data-embroidery-tab-label]",
  positionValue: "[data-embroidery-position-value]",
  lineCountValue: "[data-embroidery-line-count-value]",
  colorValue: "[data-embroidery-color-value]",
  fontValue: "[data-embroidery-font-value]",
  summaryIcon: "[data-embroidery-summary-icon]",
  editor: "[data-embroidery-editor]",
  summary: "[data-embroidery-summary]",
  summaryDetails: "[data-embroidery-summary-details]",
  lineCount: "[data-embroidery-line-count-input]",
  lineField: "[data-embroidery-line-field]",
  lineInput: "[data-embroidery-line-input]",
  lineCountDisplay: "[data-embroidery-line-count-display]",
  lineError: "[data-embroidery-line-error]",
  color: "[data-embroidery-color-input]",
  font: "[data-embroidery-font-input]",
  dropdown: "[data-embroidery-dropdown]",
  dropdownTrigger: "[data-embroidery-dropdown-trigger]",
  dropdownList: "[data-embroidery-dropdown-list]",
  dropdownOption: "[data-embroidery-dropdown-option]",
  dropdownLabel: "[data-embroidery-dropdown-label]",
  apply: "[data-embroidery-apply]",
  cancel: "[data-embroidery-cancel]",
  edit: "[data-embroidery-edit]",
  remove: "[data-embroidery-remove]",
  quantityHost: "[data-embroidery-quantity-host]",
  addToCart: 'button[type="submit"][name="add"]',
};

class EmbroideryConfigurator extends HTMLElement {
  #config = null;
  #mode = "closed";
  #activePosition = "";
  #applied = new Map();
  #editingExisting = false;
  #abortController = null;

  // --- Lifecycle -----------------------------------------------------------
  connectedCallback() {
    this.#abortController?.abort();
    this.#abortController = new AbortController();
    const { signal } = this.#abortController;
    const $productFetcher = this.#productFetcher();

    this.#config = this.#parseConfig();
    this.#activePosition = this.#defaultPosition();

    this.addEventListener("click", this.#onClick, { signal });
    this.addEventListener("change", this.#onChange, { signal });
    this.addEventListener("input", this.#onInput, { signal });
    this.addEventListener("keydown", this.#onKeydown, { signal });
    document.addEventListener("click", this.#onDocumentClick, { signal });
    $productFetcher?.addEventListener("click", this.#onAddToCartClick, { capture: true, signal });
    $productFetcher?.addEventListener("product-fetcher:state-change", this.#syncAddToCart, {
      signal,
    });

    this.#syncLineFields();
    this.#syncUi();
  }

  disconnectedCallback() {
    this.#abortController?.abort();
    this.#abortController = null;
  }

  // --- Events --------------------------------------------------------------
  #onClick = (event) => {
    if (!(event.target instanceof Element)) return;
    if (this.#handleDropdownClick(event)) return;

    const actions = [
      [selectors.open, () => this.#openPanel()],
      [selectors.apply, () => this.#applyCurrent()],
      [selectors.cancel, () => this.#cancelEdit()],
      [selectors.edit, () => this.#startEdit()],
      [selectors.remove, () => this.#removeCurrent()],
    ];

    for (const [selector, action] of actions) {
      if (!event.target.closest(selector)) continue;
      event.preventDefault();
      action();
      return;
    }
  };

  #onDocumentClick = (event) => {
    if (!(event.target instanceof Element) || this.contains(event.target)) return;
    this.#closeAllDropdowns();
  };

  #onKeydown = (event) => {
    if (!(event.target instanceof Element)) return;

    if (event.key === "Escape") {
      const $openDropdown = this.#activeDropdown();
      if (!($openDropdown instanceof HTMLElement)) return;
      event.preventDefault();
      this.#closeDropdown($openDropdown, { focusTrigger: true });
      return;
    }

    const $option = event.target.closest(selectors.dropdownOption);
    if ($option instanceof HTMLElement) {
      this.#handleDropdownOptionKeydown(event, $option);
      return;
    }

    const $trigger = event.target.closest(selectors.dropdownTrigger);
    if ($trigger instanceof HTMLElement) this.#handleDropdownTriggerKeydown(event, $trigger);
  };

  #onChange = (event) => {
    const $target = event.target;
    if (!($target instanceof HTMLElement)) return;

    if ($target.matches(selectors.tab) && $target instanceof HTMLInputElement) {
      this.#switchPosition($target.value);
      return;
    }

    if (!$target.matches(selectors.lineCount)) return;

    this.#syncLineFields();
    this.#syncEditorActions();
    this.#syncLegends();
    this.#syncPrice();
  };

  #onInput = (event) => {
    if (!(event.target instanceof HTMLElement) || !event.target.matches(selectors.lineInput)) {
      return;
    }

    event.target.setAttribute(LINE_DIRTY, "");
    this.#syncLineMeta();
    this.#syncEditorActions();
  };

  // --- Panel flow ----------------------------------------------------------
  #openPanel() {
    this.#applied.clear();
    this.#editingExisting = false;
    this.#activePosition = this.#defaultPosition();
    this.#resetEditorForm();
    this.#selectTab(this.#activePosition);
    this.#mode = "editing";
    this.#syncUi();
    this.#announce(this.#strings.a11yStatusOpened);
    this.#focusPanel();
  }

  #closePanel({ announceClosed = true, focusOpen = true } = {}) {
    this.#applied.clear();
    this.#editingExisting = false;
    this.#mode = "closed";
    this.#activePosition = this.#defaultPosition();
    this.#resetEditorForm();
    this.#syncUi();
    if (announceClosed) this.#announce(this.#strings.a11yStatusClosed);
    if (focusOpen) this.#focusElement(selectors.open);
  }

  #switchPosition(position) {
    this.#activePosition = position;
    this.#editingExisting = false;

    if (this.#applied.has(position)) {
      this.#showSummary({ focusEdit: true });
      return;
    }

    this.#mode = "editing";
    this.#resetEditorForm();
    this.#syncUi();
  }

  #applyCurrent() {
    const draft = this.#readDraft();
    if (!draft) return;

    this.#applied.set(this.#activePosition, draft);
    this.#editingExisting = false;
    this.#showSummary({
      announce: this.#strings.a11yStatusApplied.replace("__POSITION__", this.#activePosition),
      focusEdit: true,
    });
  }

  #cancelEdit() {
    if (this.#applied.size === 0) {
      this.#closePanel();
      return;
    }

    if (this.#editingExisting && this.#applied.has(this.#activePosition)) {
      this.#editingExisting = false;
      this.#showSummary({ focusEdit: true });
      return;
    }

    const fallback =
      [...this.#applied.keys()].find((position) => position !== this.#activePosition) ||
      [...this.#applied.keys()][0];

    if (!fallback) {
      this.#closePanel();
      return;
    }

    this.#activePosition = fallback;
    this.#selectTab(fallback);
    this.#editingExisting = false;
    this.#showSummary();
  }

  #startEdit() {
    const config = this.#applied.get(this.#activePosition);
    if (!config) return;

    this.#editingExisting = true;
    this.#mode = "editing";
    this.#fillEditor(config);
    this.#syncUi();
    this.#announce(this.#strings.a11yStatusEditing.replace("__POSITION__", this.#activePosition));
    this.#focusElement(selectors.color);
  }

  #removeCurrent() {
    const removedPosition = this.#activePosition;
    this.#applied.delete(this.#activePosition);
    this.#editingExisting = false;

    const removedMessage = this.#strings.a11yStatusRemoved.replace("__POSITION__", removedPosition);

    if (this.#applied.size === 0) {
      this.#closePanel({ announceClosed: false });
      this.#announce(removedMessage);
      return;
    }

    const next = [...this.#applied.keys()][0];
    this.#activePosition = next;
    this.#selectTab(next);
    this.#showSummary({ announce: removedMessage, focusEdit: true });
  }

  #showSummary({ announce = "", focusEdit = false } = {}) {
    this.#mode = "summary";
    this.#syncUi();
    if (announce) this.#announce(announce);
    if (focusEdit) this.#focusElement(selectors.edit);
  }

  // --- Editor form ---------------------------------------------------------
  #resetEditorForm() {
    const $lineCount = this.querySelector(`${selectors.lineCount}[value="1"]`);
    if ($lineCount instanceof HTMLInputElement) $lineCount.checked = true;

    this.#setDropdownValue(this.querySelector(selectors.color), "");
    this.#setDropdownValue(this.querySelector(selectors.font), "");
    this.#closeAllDropdowns();
    this.#clearLineInputs({ clearValues: true, clearDirty: true });
    this.#syncLineFields();
    this.#syncSelectLabels();
  }

  #fillEditor(config) {
    const $lineCount = this.querySelector(`${selectors.lineCount}[value="${config.lineCount}"]`);
    if ($lineCount instanceof HTMLInputElement) $lineCount.checked = true;

    this.#setDropdownValue(this.querySelector(selectors.color), config.color);
    this.#setDropdownValue(this.querySelector(selectors.font), config.font);
    this.#closeAllDropdowns();

    this.querySelectorAll(selectors.lineInput).forEach(($input) => {
      if (!($input instanceof HTMLInputElement)) return;
      const index = Number($input.getAttribute("data-embroidery-line-input"));
      $input.value = config.lines[index - 1] || "";
      $input.removeAttribute("aria-invalid");
      $input.removeAttribute(LINE_DIRTY);
    });

    this.#clearLineErrors();
    this.#syncLineFields();
    this.#syncSelectLabels();
  }

  #clearLineInputs({ clearValues = false, clearDirty = false } = {}) {
    this.querySelectorAll(selectors.lineInput).forEach(($input) => {
      if (!($input instanceof HTMLInputElement)) return;
      if (clearValues) $input.value = "";
      $input.removeAttribute("aria-invalid");
      if (clearDirty) $input.removeAttribute(LINE_DIRTY);
    });
    this.#clearLineErrors();
  }

  #clearLineErrors() {
    this.querySelectorAll(selectors.lineError).forEach(($error) => {
      $error.textContent = "";
      $error.setAttribute("hidden", "");
    });
  }

  #syncLineFields() {
    const lineCount = this.#selectedLineCount();

    this.querySelectorAll(selectors.lineField).forEach(($field) => {
      const lineIndex = Number($field.getAttribute("data-embroidery-line-field"));
      const hidden = lineIndex > lineCount;
      $field.toggleAttribute("hidden", hidden);
      if (!hidden) return;

      const $input = $field.querySelector(selectors.lineInput);
      if ($input instanceof HTMLInputElement) {
        $input.value = "";
        $input.removeAttribute("aria-invalid");
        $input.removeAttribute(LINE_DIRTY);
      }

      const $error = $field.querySelector(selectors.lineError);
      if (!$error) return;
      $error.textContent = "";
      $error.setAttribute("hidden", "");
    });

    this.#syncLineMeta();
  }

  #syncLineMeta() {
    this.querySelectorAll(selectors.lineInput).forEach(($input) => {
      if (!($input instanceof HTMLInputElement)) return;

      const value = $input.value;
      const $field = $input.closest(selectors.lineField);
      if (!$field) return;

      const $count = $field.querySelector(selectors.lineCountDisplay);
      const $error = $field.querySelector(selectors.lineError);
      const message = this.#lineErrorMessage($input, $field, value);

      if ($count) {
        $count.textContent = `${value.length}/${MAX_LINE_LENGTH}`;
        $count.setAttribute(
          "aria-label",
          this.#strings.a11yCharacters
            .replace("__COUNT__", String(value.length))
            .replace("__MAX__", String(MAX_LINE_LENGTH))
        );
      }

      if (message) $input.setAttribute("aria-invalid", "true");
      else $input.removeAttribute("aria-invalid");

      const describedBy = [$count?.id, message ? $error?.id : null].filter(Boolean).join(" ");
      if (describedBy) $input.setAttribute("aria-describedby", describedBy);
      else $input.removeAttribute("aria-describedby");

      if (!$error) return;
      $error.textContent = message;
      $error.toggleAttribute("hidden", !message);
    });
  }

  #lineErrorMessage($input, $field, value) {
    if (!value) {
      return !$field.hasAttribute("hidden") && $input.hasAttribute(LINE_DIRTY)
        ? this.#strings.fieldRequired
        : "";
    }
    if (value.length >= MAX_LINE_LENGTH) return this.#strings.maxCharacters;
    if (!LINE_PATTERN.test(value)) return this.#strings.invalidCharacters;
    return "";
  }

  #selectedLineCount() {
    const $checked = this.querySelector(`${selectors.lineCount}:checked`);
    return Number($checked instanceof HTMLInputElement ? $checked.value : 1) || 1;
  }

  #readDraft() {
    const position = this.#activePosition;
    if (!position) return null;

    const lineCount = this.#selectedLineCount();
    const $color = this.querySelector(selectors.color);
    const $font = this.querySelector(selectors.font);
    const color = this.#getDropdownValue($color);
    const font = this.#getDropdownValue($font);
    if (!color || !font) return null;

    const lines = [];
    for (let index = 1; index <= lineCount; index += 1) {
      const $input = this.querySelector(`[data-embroidery-line-input="${index}"]`);
      const value = $input instanceof HTMLInputElement ? $input.value.trim() : "";
      if (!value || value.length > MAX_LINE_LENGTH || !LINE_PATTERN.test(value)) return null;
      lines.push(value);
    }

    const variant = this.#findVariant(position, lineCount);
    if (!variant) return null;

    return {
      lineCount,
      color,
      colorCode: this.#dropdownOptionAttr($color, color, "data-color-code"),
      font,
      lines,
      price: Number(variant.price) || 0,
      variantId: Number(variant.id),
    };
  }

  #findVariant(position, lineCount) {
    const variants = this.#config?.monogramProduct?.variants;
    if (!Array.isArray(variants)) return null;

    const positionNeedle = position.toLowerCase();
    return (
      variants.find((variant) => {
        const option1 = String(variant.option1 || "").toLowerCase();
        const option2 = String(variant.option2 || "").toLowerCase();
        return option1.includes(positionNeedle) && option2.includes(String(lineCount));
      }) || null
    );
  }

  #syncEditorActions() {
    const $apply = this.querySelector(selectors.apply);
    if ($apply instanceof HTMLButtonElement) $apply.disabled = !this.#readDraft();
  }

  // --- Dropdown ------------------------------------------------------------
  #handleDropdownClick(event) {
    const $option = event.target.closest(selectors.dropdownOption);
    if ($option instanceof HTMLElement) {
      event.preventDefault();
      const $dropdown = $option.closest(selectors.dropdown);
      if (!($dropdown instanceof HTMLElement)) return true;

      this.#selectDropdownOption($dropdown, $option);
      return true;
    }

    const $trigger = event.target.closest(selectors.dropdownTrigger);
    if (!($trigger instanceof HTMLElement)) return false;

    event.preventDefault();
    const $dropdown = $trigger.closest(selectors.dropdown);
    if ($dropdown instanceof HTMLElement) this.#toggleDropdown($dropdown);
    return true;
  }

  #handleDropdownTriggerKeydown(event, $trigger) {
    const $dropdown = $trigger.closest(selectors.dropdown);
    if (!($dropdown instanceof HTMLElement)) return;

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    event.preventDefault();
    if ($trigger.getAttribute("aria-expanded") !== "true") this.#openDropdown($dropdown);
    else this.#focusDropdownOption($dropdown, event.key === "ArrowUp" ? "last" : "first");
  }

  #handleDropdownOptionKeydown(event, $option) {
    const $dropdown = $option.closest(selectors.dropdown);
    if (!($dropdown instanceof HTMLElement)) return;

    const $options = this.#dropdownOptions($dropdown);
    const index = $options.indexOf($option);

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        this.#focusOptionEl($options[Math.min(index + 1, $options.length - 1)]);
        break;
      case "ArrowUp":
        event.preventDefault();
        this.#focusOptionEl($options[Math.max(index - 1, 0)]);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        this.#selectDropdownOption($dropdown, $option);
        break;
      case "Tab":
        this.#closeDropdown($dropdown);
        break;
      default:
        break;
    }
  }

  #selectDropdownOption($dropdown, $option) {
    this.#setDropdownValue($dropdown, $option.getAttribute("data-value") || "");
    this.#closeDropdown($dropdown, { focusTrigger: true });
    this.#syncSelectLabels();
    this.#syncEditorActions();
  }

  #getDropdownValue($dropdown) {
    return $dropdown instanceof HTMLElement ? $dropdown.getAttribute("data-value") || "" : "";
  }

  #setDropdownValue($dropdown, value) {
    if (!($dropdown instanceof HTMLElement)) return;

    const nextValue = value || "";
    $dropdown.setAttribute("data-value", nextValue);

    const $label = $dropdown.querySelector(selectors.dropdownLabel);
    if ($label) {
      $label.textContent = nextValue || $dropdown.getAttribute("data-placeholder") || "";
    }

    $dropdown.querySelectorAll(selectors.dropdownOption).forEach(($option) => {
      if (!($option instanceof HTMLElement)) return;
      const selected = Boolean(nextValue) && $option.getAttribute("data-value") === nextValue;
      $option.setAttribute("aria-selected", String(selected));
    });
  }

  #dropdownOptionAttr($dropdown, value, attr) {
    if (!($dropdown instanceof HTMLElement) || !value) return "";
    const $option = $dropdown.querySelector(
      `${selectors.dropdownOption}[data-value="${CSS.escape(value)}"]`
    );
    return ($option instanceof HTMLElement && $option.getAttribute(attr)) || "";
  }

  #dropdownOptions($dropdown) {
    return [...$dropdown.querySelectorAll(selectors.dropdownOption)].filter(
      ($option) => $option instanceof HTMLElement
    );
  }

  #activeDropdown() {
    return (
      [...this.querySelectorAll(selectors.dropdown)].find(($dropdown) => {
        if (!($dropdown instanceof HTMLElement)) return false;
        return (
          $dropdown.querySelector(selectors.dropdownTrigger)?.getAttribute("aria-expanded") ===
          "true"
        );
      }) || null
    );
  }

  #focusOptionEl($option) {
    if (!($option instanceof HTMLElement)) return;
    $option.focus();
    $option.scrollIntoView({ block: "nearest" });
  }

  #focusDropdownOption($dropdown, which = "selected") {
    const $options = this.#dropdownOptions($dropdown);
    if (!$options.length) return;

    let $target = $options[0];
    if (which === "last") {
      $target = $options[$options.length - 1];
    } else if (which === "selected") {
      const value = this.#getDropdownValue($dropdown);
      $target =
        $options.find(($option) => $option.getAttribute("data-value") === value) || $options[0];
    }

    this.#focusOptionEl($target);
  }

  #toggleDropdown($dropdown) {
    const $trigger = $dropdown.querySelector(selectors.dropdownTrigger);
    if ($trigger?.getAttribute("aria-expanded") === "true") {
      this.#closeDropdown($dropdown, { focusTrigger: true });
    } else {
      this.#openDropdown($dropdown);
    }
  }

  #openDropdown($dropdown) {
    this.#closeAllDropdowns($dropdown);

    const $trigger = $dropdown.querySelector(selectors.dropdownTrigger);
    const $list = $dropdown.querySelector(selectors.dropdownList);
    if (!($trigger instanceof HTMLElement) || !($list instanceof HTMLElement)) return;

    $trigger.setAttribute("aria-expanded", "true");
    $list.hidden = false;
    this.#focusDropdownOption($dropdown, "selected");
  }

  #closeDropdown($dropdown, { focusTrigger = false } = {}) {
    const $trigger = $dropdown.querySelector(selectors.dropdownTrigger);
    const $list = $dropdown.querySelector(selectors.dropdownList);
    if ($trigger instanceof HTMLElement) $trigger.setAttribute("aria-expanded", "false");
    if ($list instanceof HTMLElement) $list.hidden = true;
    if (focusTrigger && $trigger instanceof HTMLElement) $trigger.focus();
  }

  #closeAllDropdowns($except = null) {
    this.querySelectorAll(selectors.dropdown).forEach(($dropdown) => {
      if (!($dropdown instanceof HTMLElement) || $dropdown === $except) return;
      this.#closeDropdown($dropdown);
    });
  }

  // --- Sync UI -------------------------------------------------------------
  #syncUi() {
    const isOpen = this.#mode !== "closed";
    const $open = this.querySelector(selectors.open);
    const $panel = this.querySelector(selectors.panel);

    $open?.toggleAttribute("hidden", isOpen);
    $open?.setAttribute("aria-expanded", String(isOpen));
    $panel?.toggleAttribute("hidden", !isOpen);
    this.querySelector(selectors.editor)?.toggleAttribute("hidden", this.#mode !== "editing");
    this.querySelector(selectors.summary)?.toggleAttribute("hidden", this.#mode !== "summary");

    if (!isOpen) {
      this.#syncAddToCart();
      return;
    }

    this.#selectTab(this.#activePosition);
    this.#syncTabLabels();
    this.#syncPrice();
    this.#syncLegends();
    this.#syncSelectLabels();

    if (this.#mode === "editing") this.#syncEditorActions();
    else this.#closeAllDropdowns();

    if (this.#mode === "summary") this.#renderSummary();
    this.#syncAddToCart();
  }

  #selectTab(position) {
    this.querySelectorAll(selectors.tab).forEach(($tab) => {
      if ($tab instanceof HTMLInputElement) $tab.checked = $tab.value === position;
    });
  }

  #syncTabLabels() {
    const hasAnyApplied = this.#applied.size > 0;

    this.querySelectorAll(selectors.tab).forEach(($tab) => {
      if (!($tab instanceof HTMLInputElement)) return;

      const $label = $tab.closest("label")?.querySelector(selectors.tabLabel);
      if (!$label) return;

      $label.classList.remove("text-brand-blue", "underline", "text-grey-dark", "text-grey-medium");

      if (!hasAnyApplied) {
        $label.textContent = "";
        return;
      }

      const configured = this.#applied.has($tab.value);
      const active = $tab.checked;

      if (configured && active) {
        $label.textContent = this.#strings.summary;
        $label.classList.add("text-grey-dark");
        return;
      }

      $label.textContent = configured ? this.#strings.viewEmbroidery : this.#strings.addEmbroidery;
      $label.classList.add("text-brand-blue");
    });
  }

  #selectedVariantPriceCents() {
    const variant = this.#findVariant(this.#activePosition, this.#selectedLineCount());
    return Number(variant?.price) || 0;
  }

  #syncPrice() {
    const $price = this.querySelector(selectors.price);
    if (!$price) return;

    const $starting = $price.querySelector(selectors.priceStarting);
    const $startingValue = $price.querySelector(selectors.priceStartingValue);
    const $applied = $price.querySelector(selectors.priceApplied);

    let total = 0;
    for (const [position, config] of this.#applied) {
      if (this.#mode === "editing" && position === this.#activePosition) continue;
      total += config.price;
    }
    if (this.#mode === "editing") total += this.#selectedVariantPriceCents();

    if (total > 0) {
      $price.dataset.state = "applied";
      if ($applied) {
        $applied.textContent = this.#strings.priceApplied.replace("__PRICE__", formatMoney(total));
        $applied.hidden = false;
      }
      $starting?.setAttribute("hidden", "");
      return;
    }

    $price.dataset.state = "starting";
    if ($startingValue) {
      $startingValue.textContent = this.#strings.startingAtPrice.replace(
        "__PRICE__",
        formatMoney(this.#config?.monogramProduct?.priceMin || 0)
      );
    }
    $starting?.removeAttribute("hidden");
    if ($applied) $applied.hidden = true;
  }

  #syncLegends() {
    const $positionValue = this.querySelector(selectors.positionValue);
    if ($positionValue) $positionValue.textContent = this.#activePosition;

    const $lineCountValue = this.querySelector(selectors.lineCountValue);
    if (!$lineCountValue || this.#mode !== "editing") return;

    const count = this.#selectedLineCount();
    $lineCountValue.textContent =
      count === 1
        ? this.#strings.lineCountOne
        : this.#strings.lineCountOther.replace("__COUNT__", String(count));
  }

  #syncSelectLabels() {
    const color = this.#getDropdownValue(this.querySelector(selectors.color));
    const font = this.#getDropdownValue(this.querySelector(selectors.font));
    const $colorValue = this.querySelector(selectors.colorValue);
    const $fontValue = this.querySelector(selectors.fontValue);

    if ($colorValue) $colorValue.textContent = color || this.#strings.pleaseSelect;
    if ($fontValue) $fontValue.textContent = font || this.#strings.pleaseSelect;
  }

  #renderSummary() {
    const config = this.#applied.get(this.#activePosition);
    const $details = this.querySelector(selectors.summaryDetails);
    if (!config || !$details) return;

    const rows = [
      [this.#strings.threadColor, config.color],
      [this.#strings.fontStyle, config.font],
      ...config.lines.map((line, index) => [
        this.#strings.line.replace("__NUMBER__", String(index + 1)),
        line,
      ]),
    ];

    $details.innerHTML = rows
      .map(
        ([label, value]) =>
          `<div><dt class="inline">${this.#escapeHtml(
            label
          )}:</dt> <dd class="inline">${this.#escapeHtml(value)}</dd></div>`
      )
      .join("");
    this.#syncSummaryIcon();
  }

  #syncSummaryIcon() {
    const $icon = this.querySelector(selectors.summaryIcon);
    if (!$icon) return;

    const $tab = [...this.querySelectorAll(selectors.tab)].find(
      ($el) => $el instanceof HTMLInputElement && $el.value === this.#activePosition
    );
    const src = ($tab instanceof HTMLElement && $tab.getAttribute("data-position-image")) || "";
    if (!src) return;

    $icon.innerHTML = `<img src="${src}" alt="" class="size-full object-contain" loading="lazy" width="160" height="160">`;
  }

  // --- Cart ----------------------------------------------------------------
  #syncAddToCart = () => {
    const $productFetcher = this.#productFetcher();
    if (!$productFetcher) return;

    const isOpen = this.#mode !== "closed";
    $productFetcher.querySelector(selectors.quantityHost)?.toggleAttribute("hidden", isOpen);

    const $addToCart = $productFetcher.querySelector(selectors.addToCart);
    if (!$addToCart) return;

    const embroideryOk =
      this.#mode === "closed" || (this.#mode === "summary" && this.#applied.size > 0);
    $addToCart.disabled = !($productFetcher.isComplete && embroideryOk);
  };

  #onAddToCartClick = (event) => {
    if (this.#mode === "closed" || this.#applied.size === 0) return;

    const $target = event.target instanceof Element ? event.target : null;
    const $addToCart = $target?.closest(selectors.addToCart);
    if (!$addToCart || $addToCart.disabled || $addToCart.closest("[selection-incomplete]")) return;

    event.preventDefault();
    event.stopPropagation();
    this.#addToCart($addToCart);
  };

  #addToCart($addToCart) {
    if (!window.liquidAjaxCart || this.#applied.size === 0) return;

    const garmentVariantId = this.#productFetcher()?.variantId;
    if (!garmentVariantId) return;

    const setCode = this.#createSetCode();
    const items = [
      {
        id: Number(garmentVariantId),
        quantity: 1,
        properties: {
          "_Set code": setCode,
          _final_sale: "true",
          _cart_template: "embroidery",
          "_embroidery.status": "true",
        },
      },
    ];

    for (const [position, config] of this.#applied) {
      const properties = {
        "_Set code": setCode,
        _final_sale: "true",
      };

      config.lines.forEach((line, index) => {
        properties[`Line ${index + 1}`] = line;
      });
      properties["Thread Color"] = config.color;
      properties["Font Style"] = config.font;
      if (config.colorCode) properties["_Color code"] = config.colorCode;

      items.push({ id: config.variantId, quantity: 1, properties });
    }

    const $form = this.#productFetcher()?.querySelector("ajax-cart-product-form");
    $form?.setAttribute("processing", "");

    window.liquidAjaxCart.add(
      { items },
      {
        lastCallback: (requestState) => {
          $form?.removeAttribute("processing");
          if (!requestState.responseData?.ok) return;
          this.#closePanel({ announceClosed: false, focusOpen: false });
        },
      }
    );
  }

  // --- Utils ---------------------------------------------------------------
  #productFetcher() {
    return this.closest("product-fetcher");
  }

  get #strings() {
    return this.#config?.strings || {};
  }

  #parseConfig() {
    try {
      return JSON.parse(this.querySelector(selectors.config)?.textContent || "null");
    } catch {
      return null;
    }
  }

  #positions() {
    return [...this.querySelectorAll(selectors.tab)].map(($tab) =>
      $tab instanceof HTMLInputElement ? $tab.value : ""
    );
  }

  #defaultPosition() {
    const positions = this.#positions();
    return (
      positions.find((position) => position.toLowerCase().includes("left")) || positions[0] || ""
    );
  }

  #escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  #announce(message) {
    const $status = this.querySelector(selectors.status);
    if (!$status || !message) return;
    $status.textContent = "";
    requestAnimationFrame(() => {
      $status.textContent = message;
    });
  }

  #focusElement(selector) {
    queueMicrotask(() => {
      const $el = this.querySelector(selector);
      if (!($el instanceof HTMLElement)) return;

      const $focusTarget = $el.matches(selectors.dropdown)
        ? $el.querySelector(selectors.dropdownTrigger)
        : $el;

      if ($focusTarget instanceof HTMLElement) $focusTarget.focus();
    });
  }

  #focusPanel() {
    queueMicrotask(() => {
      const $tab = this.querySelector(`${selectors.tab}:checked`);
      if ($tab instanceof HTMLElement) {
        $tab.focus();
        return;
      }
      this.#focusElement(selectors.color);
    });
  }

  #createSetCode() {
    const used = new Set();

    for (const item of window.liquidAjaxCart?.cart?.items || []) {
      if (item.properties?._cart_template !== "embroidery") continue;
      const id = String(item.properties["_Set code"] || item.properties._group_id || "");
      if (/^\d{2}$/.test(id)) used.add(id);
    }

    const allIds = Array.from({ length: SET_CODE_COUNT }, (_, i) => String(i).padStart(2, "0"));
    const pool = allIds.filter((id) => !used.has(id));
    const choices = pool.length ? pool : allIds;

    return choices[Math.floor(Math.random() * choices.length)];
  }
}

if (!customElements.get("embroidery-configurator")) {
  customElements.define("embroidery-configurator", EmbroideryConfigurator);
}
