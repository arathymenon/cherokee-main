import { getViewTransitionFn } from "./helpers.js";
import { createHTMLFetcher } from "./html-fetcher-core.js";

window.VegaX = {
  startViewTransition: getViewTransitionFn(),
  componentLoader: null,
  createHTMLFetcher,
};
