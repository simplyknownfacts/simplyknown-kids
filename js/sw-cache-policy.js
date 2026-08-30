// Loaded two ways on purpose: importScripts() inside sw.js, and require() from
// node:test. Matches how js/achievement-defs.js is already shared with tests.
(function (root) {
  // Only a clean, same-origin 200 may be stored for offline use.
  //   redirected  -> Cloudflare Access bounced us to a login page
  //   !ok         -> an error or challenge page
  //   type!=basic -> cross-origin or opaque; we cannot see inside it
  function vbShouldCache(res) {
    return !!res && res.ok === true && res.redirected !== true && res.type === 'basic';
  }
  root.vbShouldCache = vbShouldCache;
})(typeof self !== 'undefined' ? self : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { vbShouldCache: (typeof self !== 'undefined' ? self : globalThis).vbShouldCache };
}
