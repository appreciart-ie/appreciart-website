# TASKS.md — Tracked Backlog (Appreciart IE Frontend)

> Format: `- [ ] [block] — description — severity — effort (S/M/L)`
> Verified against source on 2026-07-21 (HEAD `2375950`). Only incomplete / pending / known-broken
> items — nothing already working. See SPECIFY.md for how the system behaves today.

## Launch blockers / infrastructure

- [ ] [infra] Switch Stripe to live mode — backend `/api/public/config` still serves a `pk_test_…`
      publishable key (verified live 2026-07-15). Frontend no longer hardcodes keys, so this is a
      coordinated backend/env change, but gallery.html DOES hardcode 4 Stripe Price IDs that must be
      re-created as live prices at the same time. — severity: high — effort: M
- [x] [infra] Point `appreciart.ie` → Cloudflare Pages. — severity: high — effort: M
      — RESOLVED 2026-07-17: custom domain now live on appreciart.ie (Cloudflare Pages config,
      outside repo). Confirmed by user.
- [x] [infra] Migrate API host to `api.appreciart.ie` (frontend side). — severity: high — effort: M
      — RESOLVED in `4332c49` (Fase 1: CSP transitional) + `1022df4` (Fase 2: 11 endpoints repointed)
      + `d70e862` (Fase 3: Railway host removed from CSP). Verified 2026-07-17: 0 Railway references
      remain, 12 files now target api.appreciart.ie, connect-src cleaned. NOTE: backend cookie-domain
      change (other repo) still pending for the same-site refresh cookie to take effect.
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
- [ ] [auth] Multi-tab refresh race: `refreshAccessToken()` in dashboard.js is single-flight only
      within one JS context (`_refreshPromise` is a module variable). Two dashboard tabs open at once
      can each fire `POST /api/auth/refresh` concurrently against the same httpOnly cookie; if the
      backend rotates refresh tokens per use, one tab may invalidate the other's session. Same-tab is
      safe (timer + visibilitychange share the promise). Fixing properly needs a cross-tab lock
      (BroadcastChannel or a localStorage mutex) — deferred 2026-07-21 as the effort outweighs the
      edge case. Backend rotation behaviour unverified (other repo). — severity: med — effort: M
- [ ] [auth] Logout logic duplicated: header.js `signOut()` (~120-132) and dashboard.js `dashLogout`
      (~2073-2086) implement the same POST-logout → clear `art_token`/`art_artist` → redirect
      sequence independently instead of sharing one helper. Also header.js still renders the full nav
      and binds its sign-out listener on dashboard.html even though the header is hidden there.
      Tech debt, not a bug — both paths currently work. — severity: low — effort: S
- [ ] [auth] Logout leaves per-artist UI state behind: neither logout path clears `art_active_tab`,
      `art_profile_live_seen`, or `art_calendar_filter_mine_{slug}`. Not sensitive (no PII/tokens),
      but on a shared device the next artist to sign in inherits the previous one's UI prefs — e.g.
      the "show only my sessions" filter already toggled on. — severity: low — effort: S

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

- [x] [pwa] Swipe gesture month navigation — audited as "confirmed absent, small effort to add".
      — severity: med — effort: S
      — RESOLVED in `0786cc6` (2026-07-20): `touchstart`/`touchend` handlers on `calGrid`
      (dashboard.js ~1364-1386), 50px threshold, ignores vertical-dominant swipes, delegates to the
      shared `changeMonth()` so it inherits the same transition as calPrev/calNext.
- [ ] [pwa] iOS session persistence — frontend dependency (api.appreciart.ie migration) now DONE
      as of 2026-07-17; remaining blocker is the backend cookie-domain change (other repo) so the
      refresh cookie becomes same-site. No frontend work left here. — severity: high — effort: M (backend dep)

## Calendar UX (queued from earlier full audit — none built)

- [ ] [calendar-ux] Colour fill vs outline encoding for artist availability (e.g. filled = booked,
      outlined = available) — today availability is a black 50%-opacity bar, visually close to
      consultations (artist colour at 45% opacity). — severity: med — effort: M
      — NOTE 2026-07-21: partial distinction already exists via border-left (solid vs dashed) and
      font-weight (700 vs 400) in `.cal-bar--available` / `--booked` / `--consultation`. However,
      `renderCalendar()` still applies opacity 0.5/0.45 via CSSOM on top of these, which visually
      flattens the distinction. Needs visual review (screenshot) before deciding if this counts as
      resolved or if the opacity should be reduced/removed.
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
