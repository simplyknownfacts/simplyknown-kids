# Kids — release log

One row per production promote, **written by the promote gate**, newest first. This doubles as the
changelog. Nothing reaches `kids.simplyknown.co` except through
`Desktop\SimplyKnown Promote\Promote Kids.lnk` (once the DNS cutover makes that true end to end --
see CLAUDE.md's "Hosting + deploy facts"), so every production release Kids has from 1.0.0 onward
will appear below.

The version comes from `js/version.js`; see that file for how it is bumped.

| Date | Version | Commit | What shipped |
|---|---|---|---|
| — | — | — | — |

---

## Before the numbers

Kids ran unnumbered from its first commit (GitHub Pages, auto-deploying on every push to `main`,
no version string anywhere) until 2026-09-02, when `js/version.js` and this promote gate were
built together. That history is in git and summarised in `CLAUDE.md` and `TECH-STACK.md` -- the
per-child home, tier system, activities, achievements/ribbons, cloud sync, Yoto integration, and
the security hardening passes. It is not reconstructed here, because inventing version numbers for
releases that never had them would make this log look more precise than it is.

**1.0.0 is therefore a starting line, not a claim that Kids is finished or that this gate is yet
the only door.** Until Scott's DNS cutover (kids.simplyknown.co still points at GitHub Pages as of
this writing), a plain `git push` to `main` is STILL a live deploy -- see CLAUDE.md.
