/**
 * @typedef {Array<{
 *  target: Element | ((html: string) => void) | Array<Element | ((html: string) => void)> | NodeListOf<Element>,
 *  source: string
 * }>} TargetMapType
 *
 * @typedef {{
 *   promise: Promise<void> | null,
 *   url: string | null,
 *   running: boolean
 * }} FetchDataType
 *
 * @typedef {Array<{element: Element, classList: string}>} LoadingClassesType
 */

class HTMLFetcher {
  /** @type HtmlFetcherCache */
  #cache;

  /** @type number */
  #cacheExpirationTime;

  /** @type FetchDataType  */
  #fetchData = {
    promise: null,
    url: null,
    running: false,
  };

  /** @type FetchDataType  */
  #prefetchData = {
    promise: null,
    url: null,
    running: false,
  };

  /**
   * Incremented on every fetch() call — lets a superseded call detect that a
   * newer one started and skip rendering its stale HTML.
   * @type {number}
   */
  #fetchId = 0;

  /** @type {boolean} */
  #useViewTransition = false;

  /**
   * @param {{
   *   cacheExpirationTime: number
   *   useViewTransition: boolean
   *   htmlFetcherCache: HtmlFetcherCache
   * }} props
   */
  constructor({ cacheExpirationTime, htmlFetcherCache, useViewTransition }) {
    this.#cacheExpirationTime = cacheExpirationTime;
    this.#cache = htmlFetcherCache;
    this.#useViewTransition = useViewTransition;
  }

  /**
   * @param {string} url
   * @returns {FetchDataType}
   */
  #fetchAndCache(url) {
    /** @type {FetchDataType} */
    let fetchData;

    // Deliberately no AbortSignal: aborting rejects the native fetch promise,
    // which leaks "Uncaught (in promise) AbortError" through third-party
    // window.fetch wrappers (analytics) that attach fulfill-only .then()
    // chains. Superseded requests complete into the shared cache instead;
    // fetch() skips rendering stale results via #fetchId.
    const promise = new Promise((resolve, reject) => {
      fetch(url)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Response error from the "${response.url}" URL`);
          }
          return response.text();
        })
        .then((html) => {
          this.#cache.set(url.toString(), html, Date.now() + this.#cacheExpirationTime);
          resolve(void 0);
        })
        .catch((error) => {
          reject(error);
        })
        .finally(() => {
          fetchData.running = false;
        });
    });

    fetchData = {
      promise,
      url: url.toString(),
      running: true,
    };
    return fetchData;
  }

  /**
   * @param {URL | string} url
   */
  async prefetch(url) {
    const stringURL = url.toString();
    if (this.#fetchData.running && this.#fetchData.url === stringURL) {
      return;
    }
    if (this.#prefetchData.running && this.#prefetchData.url === stringURL) {
      return;
    }
    // Don't abort the previous prefetch — it's already in flight, so letting
    // it finish just warms the shared cache. Aborting also leaks an
    // "Uncaught (in promise) AbortError" through third-party window.fetch
    // wrappers (analytics) that attach fulfill-only .then() chains we can't
    // catch from here.
    this.#prefetchData = this.#fetchAndCache(stringURL);
    await this.#prefetchData.promise?.catch((error) => {
      if (error.name === "AbortError") return;
      throw error;
    });
  }

  /**
   * @param {URL} url
   * @param {TargetMapType} targetMap
   * @param {LoadingClassesType} loadingClasses
   */
  async fetch(url, targetMap, loadingClasses = []) {
    const stringURL = url.toString();
    const fetchId = ++this.#fetchId;
    let html = this.#cache.get(stringURL);

    if (html === undefined) {
      const showLoaddingClasses = () => {
        this.#toggleLoadingClasses(loadingClasses, true);
      };
      if (this.#useViewTransition) {
        window.VegaX.startViewTransition(showLoaddingClasses);
      } else {
        showLoaddingClasses();
      }

      if (this.#prefetchData.running && this.#prefetchData?.url === stringURL) {
        this.#fetchData = this.#prefetchData;
        this.#prefetchData = {
          promise: null,
          url: null,
          running: false,
        };
      } else if (!(this.#fetchData.running && this.#fetchData.url === stringURL)) {
        this.#fetchData = this.#fetchAndCache(stringURL);
      }

      await this.#fetchData.promise?.catch((error) => {
        this.#toggleLoadingClasses(loadingClasses, false);
        throw error;
      });
      html = this.#cache.get(stringURL);
    }

    // A newer fetch() started while this one awaited — don't render stale
    // HTML over the newer call's result. Bail the same way an aborted fetch
    // used to: all callers already swallow AbortError. The superseded network
    // request itself is not aborted (see #fetchAndCache); its response still
    // lands in the shared cache.
    if (fetchId !== this.#fetchId) {
      this.#toggleLoadingClasses(loadingClasses, false);
      throw new DOMException("Superseded by a newer fetch", "AbortError");
    }

    if (html === undefined) {
      throw new Error(`The "${stringURL}" URL is not available in the cache.`);
    }

    await new Promise((resolve) => {
      const render = () => {
        this.#toggleLoadingClasses(loadingClasses, false);
        this.#renderHTML(html, targetMap);
        resolve(void 0);
      };

      if (this.#useViewTransition) {
        window.VegaX.startViewTransition(render);
      } else {
        render();
      }
    });
  }

  /**
   *
   * @param {string} html
   * @param {TargetMapType} targetMap
   */
  #renderHTML(html, targetMap) {
    const $newDocument = new DOMParser().parseFromString(html, "text/html");

    targetMap.forEach(({ target, source }) => {
      const targetList = Array.isArray(target) || target instanceof NodeList ? target : [target];
      const sourceList = $newDocument.querySelectorAll(source);
      if (sourceList.length !== targetList.length) {
        console.error("The number of targets and sources doesn't match.", target, source);
        return;
      }
      for (let i = 0; i < targetList.length; i++) {
        const targetItem = targetList[i];
        if (typeof targetItem === "function") {
          targetItem(sourceList[i].innerHTML);
        } else {
          targetItem.innerHTML = sourceList[i].innerHTML;
        }
      }
    });
    window.VegaX.componentLoader?.loadFromDOM();
    window.yotpoWidgetsContainer?.initWidgets?.();
  }

  /**
   *
   * @param {LoadingClassesType} loadingClasses
   * @param {boolean} on
   */
  #toggleLoadingClasses(loadingClasses, on) {
    loadingClasses.forEach(({ element: $el, classList }) => {
      $el.classList[on ? "add" : "remove"](...classList.split(" "));
    });
  }
}

/**
 * Defined as a separate class to have a single cache instance
 * to be used by all instances of the HTMLFetcher
 */
class HtmlFetcherCache {
  /** @type {Map<string, {expire: number, html: string}>} */
  #cache = new Map();

  /**
   * @param {string} url
   * @param {string} html
   * @param {number} expire
   */
  set(url, html, expire) {
    if (this.#cache.size > 10) {
      const now = Date.now();
      this.#cache.forEach((value, key) => {
        if (value.expire < now) this.#cache.delete(key);
      });
    }

    this.#cache.set(url, {
      expire,
      html,
    });
  }

  /**
   * @param {string} url
   * @returns {string | undefined}
   */
  get(url) {
    const cachedData = this.#cache.get(url);
    if (cachedData && Date.now() > cachedData.expire) {
      this.#cache.delete(url);
      return undefined;
    }
    return cachedData?.html;
  }
}

const htmlFetcherCache = new HtmlFetcherCache();

/**
 * @param {{
 *  cacheExpirationTime?: number
 *  useViewTransition?: boolean
 * }} props
 * @returns {HTMLFetcher}
 */
export function createHTMLFetcher({
  cacheExpirationTime = 1000 * 5,
  useViewTransition = false,
} = {}) {
  return new HTMLFetcher({
    cacheExpirationTime,
    htmlFetcherCache,
    useViewTransition,
  });
}
