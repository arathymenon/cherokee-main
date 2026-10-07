import "liquid-ajax-cart";
window.liquidAjaxCart.conf("updateOnWindowFocus", false);
window.liquidAjaxCart.conf("quantityTagAllowZero", true);

function getApplicableCodes() {
  return (window.liquidAjaxCart.cart?.discount_codes || [])
    .filter((d) => d.applicable)
    .map((d) => d.code);
}

function setDiscountUIDisabled(disabled) {
  const input = document.querySelector("[data-discount-code-form] input");
  if (input) input.disabled = disabled;
  document.querySelectorAll("[data-action-remove-discount]").forEach((btn) => {
    btn.disabled = disabled;
  });
}

function setDiscountError(message) {
  const input = document.querySelector("[data-discount-code-form] input");
  if (!input) return;
  const error = input
    .closest("[data-ajax-cart-static-element]")
    .querySelector("[data-discount-code-error]");
  if (message) {
    error.textContent = message;
    error.classList.remove("hidden");
    input.setAttribute("aria-invalid", "true");
  } else {
    error.textContent = "";
    error.classList.add("hidden");
    input.removeAttribute("aria-invalid");
  }
}

document.addEventListener("input", (e) => {
  const input = e.target.closest("[data-discount-code-form] input");
  if (!input) return;
  if (!input.value.trim()) setDiscountError("");
});

document.addEventListener("submit", (e) => {
  const form = e.target.closest("[data-discount-code-form]");
  if (!form) return;
  e.preventDefault();
  const input = form.querySelector("input");
  const code = input.value.trim();
  if (!code) return;

  const currentCodes = getApplicableCodes();
  const alreadyApplied = currentCodes.some((c) => c.toLowerCase() === code.toLowerCase());
  if (alreadyApplied) {
    input.value = "";
    setDiscountError("");
    return;
  }

  setDiscountError("");
  input.dataset.submittedCode = code;
  input.dataset.preservedCodes = currentCodes.join("|");
  setDiscountUIDisabled(true);

  const combined = [...currentCodes, code].join(",");
  window.liquidAjaxCart.update({ discount: combined });
});

document.addEventListener("liquid-ajax-cart:request-end", () => {
  const input = document.querySelector("[data-discount-code-form] input");
  if (!input) return;

  const submitted = input.dataset.submittedCode;
  if (!submitted) {
    setDiscountUIDisabled(false);
    return;
  }

  const preserved = (input.dataset.preservedCodes || "").split("|").filter(Boolean);
  delete input.dataset.submittedCode;
  delete input.dataset.preservedCodes;

  const applicableNow = new Set(getApplicableCodes().map((c) => c.toLowerCase()));
  const newCodeApplied = applicableNow.has(submitted.toLowerCase());

  if (newCodeApplied) {
    input.value = "";
    setDiscountError("");
    setDiscountUIDisabled(false);
    return;
  }

  setDiscountError("Unavailable code");

  const lost = preserved.filter((c) => !applicableNow.has(c.toLowerCase()));
  if (lost.length > 0) {
    window.liquidAjaxCart.update({ discount: preserved.join(",") });
    return;
  }

  setDiscountUIDisabled(false);
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action-remove-discount]");
  if (!btn) return;
  const codeToRemove = btn.dataset.discountCode || "";
  const remaining = getApplicableCodes().filter(
    (c) => c.toLowerCase() !== codeToRemove.toLowerCase()
  );
  setDiscountUIDisabled(true);
  window.liquidAjaxCart.update({ discount: remaining.join(",") });
});
