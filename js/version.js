// THE version. One source of truth, per the fleet Deploy & Release Standard
// PART D6: scripts/promote.mjs reads this file straight out of git at HEAD
// (never off disk) so the number Scott types at the prod prompt is provably
// the number in the code that ships. Bumped BY HAND before every dev-verify
// pass -- patch = fixes, minor = features, major = Scott's call.
//
// Plain <script> tag (no bundler, no build step, no export/import syntax) so
// it loads the same way in every HTML page, the same way js/tiers.js and
// js/profiles.js already do.
//
// 1.0.0 is Kids' first NUMBERED release (2026-09-02), not a claim the app is
// finished -- everything before it already shipped via plain `git push` to
// GitHub Pages, with no version number attached at all.
const APP_VERSION = '1.0.0';
