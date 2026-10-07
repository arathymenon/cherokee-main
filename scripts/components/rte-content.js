class RTEContent extends HTMLElement {
  connectedCallback() {
    if (this.hasAttribute("ready")) return;

    this.$assets = Array.from(this.querySelectorAll("img, iframe"));

    this.parentClass();
    this.tables();

    this.setAttribute("ready", "");
  }

  parentClass() {
    this.$assets.forEach(($asset) => {
      if (
        ($asset.style.marginLeft === "auto" && $asset.style.marginRight === "auto") ||
        $asset.parentNode.style.textAlign === "center" ||
        $asset.tagName === "IFRAME"
      ) {
        const $nextSibling = $asset.nextSibling;
        const $wrapper = document.createElement("DIV");
        $wrapper.classList.add("extended-container");
        $asset.insertAdjacentElement("afterend", $wrapper);
        $wrapper.appendChild($asset);
        if ($nextSibling && $nextSibling.nodeType === Node.TEXT_NODE) {
          $wrapper.appendChild($nextSibling);
        }
      }
    });
  }

  tables() {
    this.querySelectorAll("table").forEach(($table) => {
      const $wrapper = document.createElement("custom-scroll");
      $wrapper.className = "block overflow-x-auto w-full no-scrollbar";
      $table.insertAdjacentElement("afterend", $wrapper);
      $wrapper.appendChild($table);
    });
  }
}

customElements.define("rte-content", RTEContent);
