# TASKS.md — Tracked Backlog (Appreciart IE Frontend)

> Format: `- [ ] [block] — description — severity — effort (S/M/L)`
> Verified against source on 2026-07-15 (HEAD `3e38760`). Only incomplete / pending / known-broken
> items — nothing already working. See SPECIFY.md for how the system behaves today.

## Launch blockers / infrastructure

- [ ] [infra] Switch Stripe to live mode — backend `/api/public/config` still serves a `pk_test_…`
      publishable key (verified live 2026-07-15). Frontend no longer hardcodes keys, so this is a
      coordinated backend/env change, but gallery.html DOES hardcode 4 Stripe Price IDs that must be
      re-created as live prices at the same time. — severity: high — effort: M
- [ ] [infra] Point `appreciart.ie` → Cloudflare Pages (still on appreciart-website.pages.dev; no
      custom-domain references anywhere in the repo). — severity: high — effort: M
- [ ] [infra] Migrate API host to `api.appreciart.ie` so the refresh cookie becomes same-site
      (fixes iOS PWA session persistence — Safari ITP purges the cross-site `sameSite:none` cookie).
      Verified: 0 references to the new host; the Railway URL is hardcoded in 12 files
      (`_headers` + artist.js, bookings.js, consent.js, dashboard.js, forgot-password.js, gallery.js,
      guest-artist.js, header.js, index.js, login.js, reset-password.js). Depends on the domain task
      above and a backend cookie-domain change. — severity: high — effort: M
- [ ] [infra] Backend integration gaps from the June audit (other repo, tracked here for launch
      visibility): missing SSE emissions (payments webhook deposit_paid, admin guest approve/reject,
      consent submission), missing admin SSE handlers for `application_update`/`consent_update`,
      walk-in sessions invisible to admin, admin Studio section still placeholder. Re-verify in
      appreciart-internal before ship. — severity: high — effort: M

## Block 1 — Public site pages

- [ ] [public] gallery.html works are fully hardcoded (4 static cards, price IDs + Cloudinary URLs in
      HTML) — no backend/admin path to add or sell out works; acceptable short-term but every gallery
      change is a code deploy. — severity: low — effort: L
- [x] [public] bookings.js `fetchConfig()` is the only fetch in the repo without an
      `AbortSignal.timeout` — violates the project's own rule; a hanging config request stalls the
      wizard indefinitely. — severity: med — effort: S
      — RESOLVED in `08e1772`: added `{ signal: AbortSignal.timeout(10000) }` to the config fetch
      (same 10s pattern as `/artists`); existing generic catch covers the TimeoutError.
- [x] [public] bookings.html:141 uses inline `style="display:none"` on `#calendarLegend`; CSP
      `style-src 'self'` blocks inline style attributes, so the legend is visible before any artist is
      selected (JS only hides it via CSSOM once availability loads). — severity: med — effort: S
      — RESOLVED in `5df31a3`: removed the inline attribute; base rule `.calendar-legend` in
      css/bookings.css now defaults to `display:none`, JS reveals it via CSSOM (`.style.display`).

## Block 2 — Auth pages

- [x] [auth] login.html:22 inline `style="margin-top:8px;margin-bottom:6px"` on the Sign-in title is
      blocked by CSP — margins never apply; move to css/login.css. — severity: low — effort: S
      — RESOLVED in `5df31a3`: replaced with class `section-title--login`; margins moved to css/login.css.

## Block 3 — Dashboard

- [ ] [dashboard] Enrich session cards: show time + type (booking/consultation) alongside the stage
      pill (cards currently show only client name, relative date, and one badge). From CLAUDE.md
      "What's Next", still true. — severity: med — effort: M
- [ ] [dashboard] Tab counts (e.g. "Sessions (3)", "Consent Forms (2)") — not implemented; tabs are
      plain labels. — severity: low — effort: S
- [ ] [dashboard] Tab fade transition — panels toggle `display:none/block` with no animation
      (calendar month transitions exist; tab switches don't). — severity: low — effort: S
- [x] [dashboard] dashboard.js:734 emits `style="min-width:0"` inside calendar-bar markup — blocked
      by CSP (style attribute), so it does nothing; either remove or move to the stylesheet.
      — severity: low — effort: S
      — RESOLVED in `5df31a3`: replaced with class `cal-bar--minw0`; rule added to css/dashboard.css.
- [ ] [dashboard] Consent Forms tab: code path is fixed (reads `consent_forms` / bare array, honest
      error state) and the endpoint auth-gates correctly, but end-to-end verification against real
      linked submissions still needs a manual pass with an artist login. — severity: med — effort: S

## Block 5 — Calendar PWA

- [ ] [pwa] Swipe gesture month navigation — audited as "confirmed absent, small effort to add";
      re-verified today: still absent (no touch/pointer handlers on the calendar grid; buttons only).
      — severity: med — effort: S
- [ ] [pwa] iOS session persistence — blocked on the `api.appreciart.ie` migration (see infra);
      until then installed-PWA users on iOS get logged out when Safari purges the cross-site refresh
      cookie. No frontend workaround in place. — severity: high — effort: M (dependency)

## Calendar UX (queued from earlier full audit — none built)

- [ ] [calendar-ux] Colour fill vs outline encoding for artist availability (e.g. filled = booked,
      outlined = available) — today availability is a black 50%-opacity bar, visually close to
      consultations (artist colour at 45% opacity). — severity: med — effort: M
- [ ] [calendar-ux] Tap-feedback improvements on day cells (current feedback is only the
      `cal-day--selected` outline; no active/pressed state, notable in the PWA). — severity: low — effort: S
- [ ] [calendar-ux] Copy cleanup across calendar modals — inconsistent verbs for the same actions:
      "Add to calendar" / "Mark available" / "Book client" / "Book a client" / "New session" /
      "Add client" (guest). Pick one vocabulary. — severity: low — effort: S

## Documentation

- [ ] [docs] CLAUDE.md drift: says 3 dashboard tabs (there are 4 — Consent Forms exists), `--black`
      as `#0a0a0a` (code says `#000000`), and omits i.ytimg.com in img-src, the PWA
      (manifest/sw/standalone), auth pages beyond login, and the frozen-guest flow. SPECIFY.md now
      supersedes those sections; update or slim CLAUDE.md when convenient. — severity: low — effort: S
