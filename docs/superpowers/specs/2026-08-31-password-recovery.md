# Password recovery — spec (not built)

Written 2026-08-31 for master, to ride to Scott with the Phase 2 items per the
overhaul work order. Answers: what it needs, what it costs, why it wasn't built
silently.

## Why this is a spec and not a fix

`workers/sync/src/index.js`'s `/reset` is an honest stub — it tells the caller
recovery isn't enabled rather than pretending to send anything. Real recovery
needs the Worker to **send an email**, which is a new outside capability this
project doesn't have today. That's a cost/infra decision, not a code change,
so it's written up rather than built.

## What it needs

1. **An email-sending vendor.** Checked the fleet notes first, per the ruling —
   `Resend (app email)` is already listed in Car App's vendor table, `$0 tier`,
   status `decide/signup`. Nobody has actually signed up yet. Resend's free
   tier is 3,000 emails/month, 100/day, which is far more than a two-account
   family app will ever send. **Estimated cost: $0/month**, unless email volume
   or the fleet's needs grow well past that.
2. **A Resend API key**, one per app per rule 11.5 — `Kids_App\secrets\`,
   never shared with another project. Scott creates the account and the key;
   no chat touches billing or credentials.
3. **A reset-token table** in D1: a random token, the account it belongs to,
   an expiry (short — 30-60 minutes is standard), and whether it's been used.
   Same hashed-nothing-extra pattern as the throttle tables already shipped.
4. **Two new Worker endpoints:**
   - `POST /reset` (replacing the stub) — takes an email, and if an account
     exists, mints a token and emails a link. Always returns the same
     response whether or not the account exists (this is the same
     enumeration lesson already applied to `/signin` — a reset endpoint that
     answers differently for a real vs. fake email is a new place to leak the
     same information that was just closed).
   - `POST /reset-confirm` — takes the token and a new password, checks it's
     unused and unexpired, sets the new password, and invalidates the token.
5. **A page for the link to land on** — a small new page, or a mode on the
   existing sign-in flow, where a parent types the new password. No design
   work needed, it can be plain.

## What it does NOT need

1. No new data collection. The email address is already stored (accounts are
   created with one). Nothing new is asked of a parent or a child.
2. No change to what's visible to a child at any point — this is entirely
   inside Parent Settings' cloud-sync area.

## COPPA note, since this is new outbound communication

Sending an email to the address already on file, only when that address's own
owner requests it, is standard account-recovery practice and doesn't collect
anything new. Flagged per the standing rule anyway, since "sends an email"
is exactly the kind of thing that should never land silently.

## Size

Small-to-medium. The Worker changes are a few hours' work, similar in shape to
the account-deletion endpoint already shipped. The main new cost is the vendor
signup itself (Scott's step) and picking where the reset-password page lives.

## What's needed to proceed

Scott's yes on: (a) using Resend specifically, (b) creating the account and
handing over a key, (c) a rough go-ahead on scope above. Nothing here is built
until that happens.
