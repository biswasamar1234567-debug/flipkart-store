// ==========================================================================
// RemoteStore - drop-in replacement for localStorage.
// Values are persisted in MongoDB via /api/state (nothing in the browser).
//
// Usage (same shape as localStorage):
//   RemoteStore.setItem('address', JSON.stringify(addr));
//   const raw = RemoteStore.getItem('address');
//   RemoteStore.removeItem('address');
//
// getItem() is SYNCHRONOUS by keeping a memory cache that is hydrated
// once on first use, so existing call sites keep working unchanged.
// ==========================================================================
(function (global) {
  'use strict';

  const cache = Object.create(null);
  let hydrated = false;
  const pending = [];

  function readCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  function apiBase() { return '/api/state/'; }

  function hydrate() {
    if (hydrated) return;
    hydrated = true;
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', apiBase(), false); // synchronous, once only
      xhr.send(null);
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText || '{}');
        if (data.snapshot) Object.assign(cache, data.snapshot);
      }
    } catch (e) { /* offline -> memory only */ }
  }

  function persist(key) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', apiBase() + encodeURIComponent(key), true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({ value: cache[key] === undefined ? null : cache[key] }));
    } catch (e) { /* ignore */ }
  }

  const api = {
    getItem(key) {
      hydrate();
      const v = cache[key];
      return v === undefined || v === null ? null : v;
    },
    setItem(key, value) {
      hydrate();
      cache[key] = String(value);
      persist(key);
    },
    removeItem(key) {
      hydrate();
      delete cache[key];
      try {
        const xhr = new XMLHttpRequest();
        xhr.open('DELETE', apiBase() + encodeURIComponent(key), true);
        xhr.send(null);
      } catch (e) {}
    },
    clear() {
      hydrate();
      Object.keys(cache).forEach(k => api.removeItem(k));
    },
    key(i) {
      hydrate();
      return Object.keys(cache)[i] || null;
    },
    get length() {
      hydrate();
      return Object.keys(cache).length;
    }
  };

  global.RemoteStore = api;
  global.Store = api;

  // Replace window.localStorage so EXISTING code keeps working unchanged
  // while every value is actually persisted in MongoDB.
  // Set window.__KEEP_NATIVE_STORAGE__ = true BEFORE loading to opt out.
  if (!global.__KEEP_NATIVE_STORAGE__) {
    try {
      Object.defineProperty(global, 'localStorage', {
        configurable: true,
        get() { return api; }
      });
      Object.defineProperty(global, 'sessionStorage', {
        configurable: true,
        get() { return api; }
      });
    } catch (e) {
      /* some browsers block overriding - RemoteStore still available */
    }
  }
})(typeof window !== 'undefined' ? window : this);
