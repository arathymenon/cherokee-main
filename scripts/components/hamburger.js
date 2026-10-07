document.querySelectorAll("[data-action-toggle-mobile-menu]").forEach((button) => {
  const targetId = button.getAttribute("data-vegax-commandfor");
  const dialog = targetId && document.getElementById(targetId);

  if (dialog) {
    button.addEventListener("click", () => {
      button.classList.add("is-active");
    });
    dialog.addEventListener("close", () => {
      button.classList.remove("is-active");
    });
  } else {
    button.addEventListener("click", () => {
      button.classList.toggle("is-active");
    });
  }
});
