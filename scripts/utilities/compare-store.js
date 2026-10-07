/**
 * sessionStorage-backed comparison list, scoped per collection.
 *
 * Item shape: { handle, title, type, image, collectionLabel, url }
 * - Ordered (insertion order = display order).
 * - De-duped by handle, capped at `max`.
 * - Survives reload / load-more / filtering within the tab session.
 */
export class CompareStore {
  /**
   * @param {string} collectionHandle - scopes the storage key
   * @param {number} [max=4]
   */
  constructor(collectionHandle, max = 4) {
    this.key = `compare:${collectionHandle || "default"}`;
    this.max = max;
    this._listeners = new Set();
  }

  /** @returns {Array<object>} */
  list() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(this.key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /** @param {string} handle */
  has(handle) {
    return this.list().some((item) => item.handle === handle);
  }

  size() {
    return this.list().length;
  }

  /**
   * @param {object} item - must have a `handle`
   * @returns {boolean} true if added
   */
  add(item) {
    if (!item || !item.handle) return false;
    const items = this.list();
    if (items.some((i) => i.handle === item.handle)) return false;
    if (items.length >= this.max) return false;
    items.push(item);
    this._save(items);
    return true;
  }

  /** @param {string} handle */
  remove(handle) {
    const items = this.list();
    const next = items.filter((i) => i.handle !== handle);
    if (next.length !== items.length) this._save(next);
  }

  clear() {
    this._save([]);
  }

  /** Replace the whole list (used after staleness pruning). @param {Array<object>} items */
  replace(items) {
    this._save(Array.isArray(items) ? items.slice(0, this.max) : []);
  }

  /**
   * Subscribe to changes. @param {(items: Array<object>) => void} fn
   * @returns {() => void} unsubscribe
   */
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /** @param {Array<object>} items */
  _save(items) {
    try {
      sessionStorage.setItem(this.key, JSON.stringify(items));
    } catch (e) {
      console.error("[compare-store] save failed", e);
      return;
    }
    this._listeners.forEach((fn) => fn(items));
  }
}
