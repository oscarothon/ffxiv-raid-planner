// Vitest setup file — runs once per test file before any test executes.
// Provides helpers to load the vanilla JS sources into the jsdom window
// without rewriting them as ES modules.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { vi } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

/**
 * Load one or more JS files from /js into the current window scope by
 * evaluating their source via the Function constructor. Each call gets a
 * fresh evaluation, so test files that need a clean slate can re-load.
 *
 * Usage:
 *   import { loadScripts } from "./setup.js";
 *   loadScripts("js/data.js");
 *   expect(window.FFXIV_JOBS).toBeDefined();
 */
export function loadScripts(...relPaths) {
  for (const rel of relPaths) {
    const src = readFileSync(resolve(repoRoot, rel), "utf-8");
    // Evaluate in the window context so `const API = (...)` lands on `window`
    // when the source uses the `var`/`const`/`let` IIFE pattern. We wrap in a
    // function and call it with `this === window` so top-level declarations
    // attach to the global as the browser would.
    //
    // NOTE: const/let at the top level of a Function body are scoped to that
    // function. The vanilla JS in this repo treats the file as a `<script>`,
    // so to mimic that we strip `const`/`let` to `var` for top-level
    // assignments. A cleaner approach is to use jsdom's `runScripts` with
    // `<script>` injection, but that requires a fresh JSDOM per call. The
    // pattern below is good enough for the helpers we want to test.

    // Auto-hoist: scan every top-level declaration and attach it to window.
    const decls = [...src.matchAll(/^(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)\b/gm)]
      .map(m => m[1]);
    const uniqueDecls = [...new Set(decls)];

    // For `function` declarations and `const`: expose value directly.
    // For `let`/`var` mutable state: also expose a setter so tests can write
    // back into the closure (e.g. window._set_currentUserRole("admin")).
    const letDecls = [...src.matchAll(/^let\s+([A-Za-z_$][\w$]*)\b/gm)].map(m => m[1]);
    const letSetters = [...new Set(letDecls)].map(n =>
      `window[${JSON.stringify("_set_" + n)}] = function(v){ ${n} = v; window[${JSON.stringify(n)}] = v; };`
    ).join("\n");

    // For `state` specifically, we also need window.state to reflect
    // reassignments made inside hydrateState (which does `state = {...}`).
    // We add a getter/setter via Object.defineProperty so any closure
    // reassignment of `state` is immediately visible on window.
    // We do the same for other commonly-mutated let vars.
    const liveBindings = ["state", "currentUserRole", "currentUserId", "currentCharacters", "currentCharacter"]
      .filter(n => uniqueDecls.includes(n))
      .map(n => `
        (function(){
          var _v = ${n};
          Object.defineProperty(window, ${JSON.stringify(n)}, {
            configurable: true,
            enumerable: true,
            get: function(){ return _v; },
            set: function(v){ _v = v; ${n} = v; }
          });
          // patch the local ref so hydrateState's reassignment is visible
          // Note: we can't intercept local reassignment of a let var from
          // outside the closure — we use the _set_ helper for that.
        })();
      `).join("\n");

    const hoist = uniqueDecls
      .map(n => `if (typeof ${n} !== "undefined") window.${n} = ${n};`)
      .join("\n") + "\n" + letSetters;

    // Build a minimal localStorage shim so bare `localStorage.getItem()`
    // calls inside app.js (at top-level, before DOMContentLoaded) don't
    // throw even when jsdom's localStorage implementation is not available.
    const lsShim = (() => {
      if (window.localStorage && typeof window.localStorage.getItem === "function") {
        return window.localStorage;
      }
      // Fallback in-memory shim
      const store = {};
      return {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        clear: () => { Object.keys(store).forEach(k => delete store[k]); },
        key: (i) => Object.keys(store)[i] || null,
        get length() { return Object.keys(store).length; },
      };
    })();

    // We inject browser globals as named parameters so bare references like
    // `localStorage` resolve correctly inside the Function body (which runs
    // in a plain Node context, not the jsdom global). NOTE: do NOT capture
    // `fetch` as a parameter — that would shadow `window.fetch` and break
    // `installFetchMock()` which patches the global after this evaluation.
    const wrapped = `
      (function (window, document, localStorage, sessionStorage, location, history, navigator) {
        ${src}
        ${hoist}
      }).call(window,
        window,
        window.document,
        lsShim,
        window.sessionStorage || {},
        window.location,
        window.history,
        window.navigator
      );
    `;
    // eslint-disable-next-line no-new-func
    new Function("window", "lsShim", wrapped)(window, lsShim);
  }
}

/**
 * Install a mock global fetch on the window. Returns the mock so tests can
 * assert calls / set response payloads.
 */
export function installFetchMock() {
  const mock = vi.fn();
  globalThis.fetch = mock;
  window.fetch = mock;
  return mock;
}

/**
 * Helper that builds the response object returned by a mocked fetch.
 */
export function fetchResponse({ status = 200, body = {}, headers = {} } = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : String(status),
    headers: new Headers(headers),
    text: async () => text,
    json: async () => (typeof body === "string" ? JSON.parse(body || "null") : body),
  };
}
