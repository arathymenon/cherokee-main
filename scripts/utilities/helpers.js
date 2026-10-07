export function findAncestor(el, sel) {
  while ((el = el.parentElement) && !(el.matches || el.matchesSelector).call(el, sel));
  return el;
}

/**
 * Returns closest parent Shopify section ID and element.
 * @param {Element} $element
 * @returns {[string, Element] | [null, null]}
 */
export const getShopifySection = ($element) => {
  const sectionPrefix = "shopify-section-";
  const $section = $element.closest(`[id^="${sectionPrefix}"]`);
  if (!$section) return [null, null];
  const sectionId = $section.id.replace(sectionPrefix, "");
  return [sectionId, $section];
};

/**
 *
 * @param {Element} $target
 * @param {string} selector
 * @returns {Array<Element>}
 */
export function querySelectorAllOwn($target, selector) {
  return Array.from(document.querySelectorAll(selector)).filter(($element) => {
    return isOwnElement($target, $element);
  });
}

/**
 *
 * @param {Element} $target
 * @param {Element} $element
 * @returns {boolean}
 */
export function isOwnElement($target, $element) {
  if ($element.hasAttribute("data-vegax-for")) {
    return $target.id === $element.getAttribute("data-vegax-for");
  } else {
    return $element.closest($target.tagName) === $target;
  }
}

export const toggleClassFromAttribute = ($context, attributeName, on) => {
  $context.querySelectorAll(`[${attributeName}]`).forEach(($element) => {
    const className = $element.getAttribute(attributeName);
    if (className) {
      if (on) $element.classList.add(className);
      else $element.classList.remove(className);
    }
  });
};

export const isInViewport = (elem) => {
  const bounding = elem && elem.getBoundingClientRect();
  return bounding && bounding.top < window.innerHeight && bounding.bottom >= 0;
};

export function serializeForm(form) {
  let obj = {};
  let formData = new FormData(form);

  for (let key of formData.keys()) {
    obj[key] = formData.get(key);
  }

  return obj;
}

export function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

export function parseTag(url) {
  const regex = /[^/]+$/;
  return url.match(regex)[0];
}

/** Locale-aware storefront root (e.g. "/" or "/en-ca/"), falling back to "/". */
export function shopifyRoot() {
  return (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
}

/**
 * Format cents as localized currency.
 * Uses liquidAjaxCart cart currency when available; falls back to "$X.XX".
 * @param {number} cents
 * @returns {string}
 */
export function formatMoney(cents) {
  const currency = window.liquidAjaxCart?.cart?.currency || "USD";
  const locale = window.Shopify?.locale || "en";

  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

/**
 * Digits-only cart group id for `_group_id` (links parent/child line items).
 * @returns {string}
 */
export function createGroupId() {
  return Math.random().toString(36).slice(2, 9).padEnd(7, "0");
}

/**
 * Parse a JSON array attribute (e.g. cart `line-keys`) into string[].
 * @param {string | null | undefined} value
 * @returns {string[]}
 */
export function parseLineKeys(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Batch-update cart line quantities via liquid-ajax-cart.
 * @param {string[]} keys
 * @param {number} quantity
 */
export function updateCartLineQuantities(keys, quantity) {
  if (!window.liquidAjaxCart || !keys.length) return;

  window.liquidAjaxCart.update({
    updates: Object.fromEntries(keys.map((key) => [key, quantity])),
  });
}

export function getCollectionUrl(url) {
  const regex = /\/\S+\//;
  return url.match(regex)[0];
}

export async function loadJS(FILE_URL, cb) {
  let $script = document.createElement("script");

  $script.setAttribute("src", FILE_URL);
  $script.setAttribute("type", "text/javascript");

  document.body.appendChild($script);

  cb && cb($script);
  return new Promise((resolve, reject) => {
    $script.addEventListener("load", () => {
      resolve(true);
    });
    $script.addEventListener("error", () => {
      reject(false);
    });
  });
}

/**
 * Wrapper for the document.startViewTransition method until it is widely supported
 * https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition
 *
 * @returns {(updateCallback: () => void) => void}
 */
export function getViewTransitionFn() {
  let viewTransition = null;

  const startViewTransition = async (updateCallback) => {
    if (document.startViewTransition) {
      viewTransition?.skipTransition();
      viewTransition = document.startViewTransition(updateCallback);
      // A skipped transition rejects its `ready` promise with
      // "AbortError: Transition was skipped" — expected, not an error.
      viewTransition.ready.catch(() => {});
      return viewTransition.finished;
    } else {
      updateCallback();
    }
  };

  return startViewTransition;
}
