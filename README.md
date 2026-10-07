# Avex Shopify Theme

A custom Shopify theme boilerplate built and maintained by **Avex Designs**. This document is the onboarding guide for developers jumping into the codebase: the stack, folder structure, the scripts layer (web components), the styles layer (Tailwind v4 tokens + utilities), and the conventions to follow when building sections and snippets.

## Stack

| Piece | Detail |
|-------|--------|
| **Build** | [Vite 8](https://vite.dev) with `@tailwindcss/vite`, minified with terser |
| **CSS** | [Tailwind CSS v4](https://tailwindcss.com) — **no `tailwind.config.js`**; config lives in the `@theme {}` block in `styles/base/base.css` |
| **Theme tooling** | [Shopify CLI](https://shopify.dev/docs/themes/tools/cli) for local dev + push |
| **Carousels** | Vendored Tarot carousel (`scripts/packages/tarot.esm.js`) |
| **Cart** | `liquid-ajax-cart` for AJAX cart + section re-rendering |

## Getting started

1. Clone the repo and install dependencies:
   ```bash
   git clone <repo-url>
   npm install
   ```
   `npm install` runs the `prepare` script automatically, which sets up Husky git hooks.

2. Point the dev/deploy scripts at your store. In `package.json`, the `dev:shopify` and `deploy` scripts pass `--store=<your-store>` to the Shopify CLI — update this per project.

3. Start development:
   ```bash
   npm run dev
   ```
   This runs Vite (build + watch) and the Shopify CLI dev server concurrently. You'll be prompted to authenticate with the store on first run.

## npm scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite watch **and** Shopify theme dev, concurrently |
| `npm run dev:vite` | Vite build in watch mode only (`--mode development`, emits sourcemaps) |
| `npm run dev:shopify` | Shopify theme dev server only |
| `npm run build` | Production build |
| `npm run deploy` | Build, then `shopify theme push` |
| `npm run eslint` | Lint + auto-fix `scripts/**/*.js` |
| `npm run stylelint` | Lint + auto-fix `styles/**/*.css` |
| `npm run prettier` | Format the whole project |

Husky + lint-staged run Prettier/ESLint on staged JS and Prettier/Stylelint on staged CSS at commit time.

## Build system

Vite compiles **three** entry points into `assets/` (with `emptyOutDir: false`, so it never wipes the rest of the folder):

| Source | Output |
|--------|--------|
| `scripts/scripts-preload.js` | `assets/scripts-preload.min.js` |
| `scripts/scripts.js` | `assets/scripts.min.js` |
| `styles/styles.css` | `assets/styles.min.css` |

Sourcemaps are emitted in development mode only. Static assets (SVGs, fonts) live directly in `assets/` and are committed.

## Folder structure

```
assets/            Compiled JS/CSS (Vite output) + static SVGs & fonts
blocks/            Private reusable blocks, file names prefixed with _ (optional convention)
config/            settings_schema.json, settings_data.json, frames.json, markets.json
layout/            theme.liquid, password.liquid
locales/           Translation JSON (en.default.json)
scripts/
  components/      Web components — one custom element (or behavior module) per file
  packages/        Third-party / vendored JS (incl. tarot.esm.js)
  utilities/       Shared helpers, Vega-X bootstrap, button-command, html-fetcher-core
  scripts.js       Main JS entry point (imports everything)
  scripts-preload.js  Critical / above-the-fold JS
sections/          Shopify section Liquid files
snippets/          Shopify snippet Liquid files
styles/
  base/            base.css (@theme tokens), typography.css, layout.css, spacing.css
  elements/        buttons, inputs, badges, breadcrumbs, chips, hamburger, scrollbar, rich-text
  components/      accordion, dialog, header, mobile-menu-drawer, quantity-input, size-guide, …
  packages/        tarot.css, cart-progress-bar.css, scroll-trigger.css, panel-stack.css
  utilities/       colors.css (color schemes), layout.css, dialog.css (drawers)
  apps/            Third-party app overrides (e.g. review widgets)
  styles.css       CSS entry point (imports all of the above)
templates/         JSON / Liquid templates
```

## Conventions

These are enforced across the codebase — follow them in new code.

- **File label comments.** Every section/snippet starts with an identifying comment on line 1:
  ```liquid
  <!-- section: my-section -->
  <!-- snippet: my-snippet -->
  ```
- **Snippet docs.** Document snippet params with a `{% doc %}` block (with `@param` / `@example`) rather than `{% comment %}`.
- **Tailwind classes only — no BEM.** Compose utilities in the template; reach for component CSS only for things utilities can't express (gradients, complex states, custom transitions).
- **Write HTML directly in Liquid.** Don't `echo`/`capture` HTML unless you're passing it as a string to another snippet.
- **No `<h1>`–`<h6>` tags.** Use `<div role="heading" aria-level="N">` with the matching `fs-display-N` class.
- **Custom-element attributes use bare names** (`product-handle="…"`), not `data-` prefixes. Generic JS bindings still use `data-action-*` / `data-content-*` / `data-component-*`.
- **Color scheme on the section root.** `color-{{ s.color_scheme }}` paints background + text automatically — don't also add `bg-scheme` / `text-scheme` to the root.
- **Liquid inline comments are `{% # Comment %}`** — never `{%# … #}`.
- **Hand-written CSS media queries use `theme(--breakpoint-lg)`**, not hardcoded pixels.

### Section anatomy

```liquid
<!-- section: my-section -->

{%- liquid
  assign s = section.settings
-%}

<section class="color-{{ s.color_scheme }} py-section">
  <div class="container">
    {% if s.heading != blank %}
      <div role="heading" aria-level="2" class="fs-display-2 mb-md text-pretty">{{ s.heading | escape }}</div>
    {% endif %}

    {% for block in section.blocks %}
      {%- assign b = block.settings -%}
      <div {{ block.shopify_attributes }}>{{ b.text }}</div>
    {% endfor %}
  </div>
</section>

{% schema %}{ … }{% endschema %}
```

Conventions: `assign s = section.settings` at the top, `assign b = block.settings` in block loops, `{{ block.shopify_attributes }}` on every block wrapper, `container` for centered max-width content, `py-section` / `pt-section` / `pb-section` for vertical padding, `color_scheme` first in the schema, and a `preset` with a `category` so the section appears in the editor.

## Styles layer

Tailwind v4 with the config expressed as CSS custom properties in `styles/base/base.css` (`@theme {}`). The `styles.css` entry imports base → packages → elements → components → apps → utilities.

### Typography

Heading/body presets are `@utility` classes in `styles/base/typography.css`. Sizes scale up at `lg` (≥1024px).

| Class | Mobile → Desktop | Notes |
|-------|------------------|-------|
| `fs-display-1` | 2.5rem → 5rem | Display font, 800, uppercase |
| `fs-display-2` | 1.5rem → 2.5rem | |
| `fs-display-3` | 1.125rem → 1.5rem | |
| `fs-display-4` | 0.875rem | |
| `fs-display-5` | 0.75rem → 1rem | Inter, 500 |
| `fs-display-6` | 0.75rem | 400, tracked, uppercase |
| `fs-eyebrow` | same as display-5 | Eyebrow/overline; no heading color |
| `fs-body-lg / -md / -sm / -xs` | 1 / 0.875 / 0.75 / 0.625rem | Body text |

Font families: `font-body` (Inter), `font-display` (GT Walsheim). Avoid `.h1`–`.h6`, `fs-{px}`, `fw-{weight}` — they don't exist.

### Spacing scale

Tokens in `styles/base/spacing.css` and `layout.css`. Most **double at `lg`**. Use as Tailwind utilities on any spacing property (`p-md`, `px-gutter`, `py-section`, `mb-sm`, `gap-gap`, `-mx-gutter`, …).

| Token | Mobile | Desktop (≥lg) |
|-------|--------|---------------|
| `2xs` | 0.25rem | 0.5rem |
| `xs` | 0.5rem | 1rem |
| `sm` | 1rem | 1.5rem |
| `md` | 1.5rem | 2.5rem |
| `lg` | 2.5rem | 5rem |
| `gutter` | 1.25rem | 2.5rem |
| `gap` | 0.5rem | — |
| `section` | 24px | 40px |

Breakpoints are Tailwind v4 defaults (`sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536). In CSS, reference them as `theme(--breakpoint-lg)`.

### Buttons

Defined in `styles/elements/buttons.css`.

| Class | Purpose |
|-------|---------|
| `button` | Pill button, brand-primary fill by default |
| `button-secondary` | White fill, brand text → inverts on hover |
| `button-outline-black` / `button-outline-white` | Transparent with border → fills on hover |
| `button-sm` / `button-lg` | Size variants |
| `arrow-button` | Inline text + icon, underline on hover |
| `underline-button` | Inline text, persistent underline that fades on hover |

### Color scheme utilities

Apply `color-{{ s.color_scheme }}` on the section root; children inherit via these (from `styles/utilities/colors.css`):

| Class | Purpose |
|-------|---------|
| `bg-scheme` / `bg-scheme-fg` | Background (gradient-aware) / foreground-as-background |
| `text-scheme` / `text-scheme-bg` | Foreground text / background-as-text |
| `text-scheme-heading` / `text-heading` | Heading color |
| `text-scheme-links` / `text-scheme-icons` | Link / icon colors |
| `border-fg` / `border-bg` | Border colors |

### Other utilities

| Utility | What it does |
|---------|--------------|
| `container` | Centered max-width with responsive `px-gutter` |
| `flex-center` | `display:flex; align-items:center; justify-content:center` |
| `thin-scrollbar` / `thin-h-scrollbar` / `no-scrollbar` | Scrollbar styling |
| `input-no-spinner` | Removes number-input spinner arrows |
| `rounded-theme` / `rounded-theme-sm` | Theme border radii |
| `aspect-product-image` | Theme product-image aspect ratio |
| `rte` | Rich-text editor content styling |
| `dialog-{t,r,b,l}-drawer` | Slide-in dialog drawers (see below) |

## Scripts layer

The JS is split into two bundles:

- **`scripts-preload.js`** — critical path, loaded early. Imports only the vendored Tarot carousel, `<media-loader>`, and `<header-manager>` (needed before the page is visually stable).
- **`scripts.js`** — everything else. Loads the third-party packages, bootstraps `window.VegaX` via `utilities/vegax-init.js` (must run first), then registers all components and global behavior modules.

### Theme-owned custom elements

One custom element per file in `scripts/components/`. Verify the live list anytime with:

```bash
grep -rhoE "customElements.define\(['\"][a-z-]+" scripts/
```

| Area | Elements |
|------|----------|
| **Layout / nav** | `header-manager`, `mobile-menu-drawer`, `sticky-content`, `pagination-link` |
| **Product / PDP** | `product-fetcher`, `product-option`, `product-gallery`, `product-zoom-gallery`, `image-zoom`, `sticky-add-to-cart`, `quantity-input`, `product-set-group`, `product-set-item`, `shop-by-color`, `swatch-overflow`, `bis-form-klaviyo` |
| **Cart** | `set-cart-item` (cart line behavior is driven by `liquid-ajax-cart`) |
| **Collection / facets** | `facets-form`, `filter-show-more`, `price-range-slider` |
| **Media / content** | `media-loader`, `deferred-media`, `video-player`, `rte-content`, `accordion-block`, `faq-content` |
| **Generic / utility** | `openable-component`, `html-fetcher-trigger`, `predictive-search`, `custom-scroll` |
| **Carousel (vendored)** | `tarot-carousel`, `tarot-viewport`, `tarot-track`, `tarot-slide`, `tarot-content`, `tarot-slide-icon` |

### Behavior modules (register no custom element)

These are imported for side effects only — don't write them as tags: `cart.js`, `cart-progress-bar.js`, `cart-max-qty-notice.js`, `cart-upsell-carousel.js`, `hamburger.js`, `quick-shop.js`, plus `utilities/button-command.js`, `utilities/cart-hash-open.js`, `utilities/vegax-init.js`. `utilities/helpers.js` and `utilities/html-fetcher-core.js` are pure helper modules (imported transitively).

### Third-party packages

| Package | Role |
|---------|------|
| `liquid-ajax-cart` | AJAX cart engine + section re-rendering; fires `liquid-ajax-cart:request-end` |
| `@magic-spells/cart-progress-bar` | `<cart-progress-bar>` free-shipping bar |
| `@magic-spells/panel-stack` | Nested sliding panels — powers the mobile menu drawer |
| `@magic-spells/scroll-trigger` | Scroll-triggered callbacks (used by FAQ nav) |

### Writing a new web component

```javascript
class MyComponent extends HTMLElement {
  connectedCallback() {
    // query children, attach listeners
  }
  disconnectedCallback() {
    // clean up listeners / observers / timers
  }
}
customElements.define("my-component", MyComponent);
```

Register it by importing the file in `scripts/scripts.js` (or `scripts-preload.js` if it's above-the-fold-critical). Dispatch custom events with the `theme:` namespace, and read globals off `window.Theme`.

## Carousels (Tarot)

The theme vendors the Tarot carousel at `scripts/packages/tarot.esm.js` (preloaded). Markup uses `<tarot-carousel>` wrapping `<tarot-viewport>` → `<tarot-track>` → `<tarot-slide>`, with options passed as JSON:

```html
<tarot-carousel>
  <script type="application/json" data-tarot-options>
    { "effect": "carousel", "slidesPerView": 1, "gap": "16px" }
  </script>
  <tarot-viewport>
    <tarot-track>
      <tarot-slide><!-- … --></tarot-slide>
    </tarot-track>
  </tarot-viewport>
</tarot-carousel>
```

For custom nav buttons use `snippets/carousel-buttons.liquid` with the `previousButtonSelector` / `nextButtonSelector` options — do **not** set `navigation.showButtons: false`, which would hide them. Tarot exposes a full JS API (`next()`, `goToSlide()`, events, breakpoints, `fade`/`carousel` effects); see the carousel reference docs for the complete option set.

## Dialogs, drawers & Vega-X commands

Native `<dialog>` elements are opened/closed via data attributes handled by `scripts/utilities/button-command.js`:

```liquid
<button data-vegax-command="show-modal" data-vegax-commandfor="{{ dialog_id }}">Open</button>
```

`data-vegax-command` is `show-modal` or `close`; `data-vegax-commandfor` is the target dialog's `id`. Wrap the dialog in `<openable-component>` and apply a drawer class (`dialog-t-drawer`, `dialog-r-drawer`, `dialog-b-drawer`, `dialog-l-drawer`, or `dialog-popup`) for slide/fade transitions. `<openable-component>` supports `data-close-on-outside-click`, `data-close-on-escape-key`, and `data-close-delay-ms`.
