# SPECIFY.md — Appreciart IE Frontend: What the System Actually Does Today

> Verified against source on 2026-07-21 (branch `main`, HEAD `df80c29`). This document supersedes the
> equivalent sections of CLAUDE.md where they disagree — every claim here was checked against the code,
> not copied from docs. Backend: `https://api.appreciart.ie`.
> Deploy: push to `main` → Cloudflare Pages, served at `appreciart.ie` (project
> `appreciart-website.pages.dev`). No build step; plain HTML/CSS/JS served as-is.

---

## Block 1 — Public Site Pages

### index.html (homepage) — `js/index.js`
Sections in order: hero → "The Studio" intro → Resident Artists (`#artists`, 3 static `.resident-card`
blocks for moreirart/marina/renan) → Guest Artists carousel (`#guestsTrack`) → Gallery teaser →
"Be Our Next Guest" CTA → Reviews carousel (static cards, `#reviewsTrack`) → Electric Ink collab block.

`js/index.js` makes **one** fetch to `GET /api/public/artists` (8s timeout) and uses it twice:
- **Resident photos**: `data.residents[]` matched by `slug` against `img.resident-photo[data-slug]`;
  sets `img.src = artist.profile_url` only if it passes `isSafeUrl()` (https-only).
- **Guest cards**: built from `data.guests[]` — fields consumed: `slug`, `name`, `styles[]`,
  `profile_url`, `guest_start_date`, `guest_end_date`. Date badge is `"DD Mon – DD Mon"` (en-IE),
  month label from `guest_start_date`. Card links to `artist.html?slug=…`. Photo load errors fall
  back to a grey background. If no guests: `#guestsEmpty` shown. On fetch failure the empty element
  gets an honest "Couldn't load guest artists right now" message.

The response shape was verified live: `{ residents: [...], guests: [...] }`, each artist carrying
`id, name, slug, bio, styles, instagram, is_resident, active, whatsapp_url, booking_url,
guest_start_date, guest_end_date, profile_url` (Cloudinary URL with `q_auto,f_auto,w_680` transform).

### artist.html (single artist page) — `js/artist.js`
Requires `?slug=` matching `/^[a-z0-9-]+$/`, else "Artist not found". Loads in parallel (single
`initialLoad` promise reused by the Stripe return handler):
- `GET /api/public/artists/{slug}` → `{ artist }` (404 → not-found state, other errors → retry state)
- `GET /api/public/availability/{slug}` → `{ availability[], date_images[] }` (failures degrade to empty)

Render logic:
- Profile card: photo (`profile_url` or local `images/resident-artists/{slug}-profile.webp` fallback),
  "Resident Artist"/"Guest Artist" caption from `is_resident`, name, style tags, bio, Instagram link
  (built from handle, `@` stripped).
- **Logged-in artist suppression**: if `art_token` exists, it's not the artist's own page, and the
  viewed artist is not a guest → availability and booking CTA are replaced with "manage from your
  Dashboard" notices (residents' public Stripe flow hidden from signed-in artists). A guest's contact
  CTA always renders regardless of any token.
- **Guest artists**: availability section shows the visit-period line "At the studio DD Mon – DD Mon"
  (built from `guest_start_date`/`guest_end_date`, same format as homepage) plus "Bookings are handled
  directly with this artist" and contact buttons — `whatsapp_url` / `booking_url` (both https-guarded),
  falling back to the studio WhatsApp (`wa.me/353838882759`) if neither is set. The bottom CTA repeats
  the contact buttons.
- **Residents**: month-grouped date-image grid. Cells disabled when past or when the date appears in
  `availability` with `booked: true`; enabled cells open the booking modal. `date_images` maps
  day-of-month → image URL (fallback: zero-padded day number).
- Portfolio grid from `artist.portfolio[]` (`{ url, urlFull }`) with a lightbox; "Portfolio coming
  soon." when empty.

**Booking modal** (residents only): name/phone/email required (regex email check) →
`POST /api/public/bookings/payment-intent` with `{ artist_slug, client_name, client_email,
client_phone, style?, description?, placement?, size?, date }` (date `YYYY-MM-DD`) → response
`{ client_secret, booking_id, deposit_amount }` → mandatory `showDepositConfirm(deposit)` modal →
Stripe Payment Element (flat theme, order: apple_pay, google_pay, klarna, card) →
`stripe.confirmPayment` with `redirect: 'if_required'`; return URL is
`artist.html?slug=…&paid=1&booking_id=…` (Stripe appends `payment_intent` + `redirect_status`).
The Stripe publishable key is fetched at page load from `GET /api/public/config` — **not hardcoded**.

**Post-payment outcome (A4 — identical logic and copy in `artist.js` and `bookings.js`):**
`redirect_status` is resolved into three distinct states, never one blanket success message:
- `succeeded` → full confirmation panel as authored (black check icon, "Booking Confirmed").
- `processing` → *pending* variant of the same panel: neutral `--mid` circle + clock icon, title
  "Payment Processing", body stating the payment isn't approved yet and confirmation arrives by
  email. Needed because async methods (Klarna) sit in `processing` indefinitely.
- **absent** → treated as `processing`, never as confirmation, so a hand-typed `?success=1` /
  `?paid=1` cannot produce a false positive. It is then verified against the backend and upgraded
  to the confirmed panel only if `deposit_paid === true`; any failure leaves it pending.
- anything else (`failed`, …) → "no money was taken" error toast + URL cleanup (unchanged).
The inline, non-redirect confirm path reads `result.paymentIntent.status` for the same distinction
instead of assuming success.

`GET /api/public/bookings/:id?payment_intent=…` — **not documented previously; discovered while
implementing A4.** Verified live against the backend: `400 {"error":"payment_intent is required"}`
when the query param is missing, `404 {"error":"Booking not found"}` for an unknown id. The success
payload was not observed — presumed to be the booking carrying `deposit_paid`, so the frontend reads
it tolerantly as `data.booking || data` and requires `deposit_paid === true`.

### bookings.html (4-step wizard) — `js/bookings.js`
If `art_token` is present the whole layout is replaced with a "You're signed in as an artist" notice
linking to the dashboard; the wizard never initialises. Otherwise:

Steps: **1 Artist · 2 Date · 3 Details · 4 Payment**, `goToStep()` guards forward navigation
(step ≥2 needs `selectedArtist`, ≥3 needs `selectedDay`, 4 needs `clientSecret`). A summary rail
shows artist/date/deposit and a clickable stepper (backwards only).

- Init: `fetchConfig()` (Stripe key from `/api/public/config`, 10s timeout like every other fetch
  since `08e1772`) then `Stripe(key)`. URL params `?artist=` preselects,
  `?date=YYYY-MM-DD` pre-picks once availability loads.
- Step 1: residents from `GET /api/public/artists` as photo buttons; guests render in a separate
  "guest artists" grid as profile links (guests are not bookable through the wizard). Artist colour
  applied to the calendar via CSS custom property `--artist-color`
  (moreirart `#2E7D32`, marina `#E64A19`, renan `#1565C0`, guest fallback `#B8860B`).
- Step 2: month-grid calendar from `GET /api/public/availability/{slug}`. Non-booked future slots
  → `is-available` (clickable); `booked` → `is-booked`; everything else `is-disabled`. Month nav is
  clamped to the min/max months that contain availability. Empty availability → WhatsApp enquiry link.
- Step 3: name/phone/email required, optional style/placement/description/size + marketing-consent
  checkbox. "Proceed to Payment" enables only when required fields + artist + day are set.
- Step 4: same payment-intent endpoint/payload as artist.html plus `marketing_consent`; deposit
  confirm modal; Payment Element (destroying any prior instance); return URL
  `bookings.html?success=1&booking_id=…&payment_intent=…`. Redirect return handled exactly as in
  artist.html — same three-state outcome logic, same backend verification, same user-facing copy
  (see "Post-payment outcome" above).

### gallery.html — `js/gallery.js`
Four **hardcoded** `.gallery-work-card` blocks in HTML, each carrying `data-img/artist/title/medium/
desc/price` and a `data-price-id` (Stripe Price IDs baked into the HTML). Click → lightbox with
"Purchase this Work" → `POST /api/public/gallery/checkout` `{ price_id }` → validates the returned
URL starts with `https://checkout.stripe.com/` → full-page redirect to Stripe Checkout.
`gallery-success.html` is the static return page. Image errors hide the img and grey the tile.

### exhibitions.html — `js/exhibitions.js`
Static listing; videos are YouTube iframes deferred via `data-src` (loaded on first play click, which
also hides the `i.ytimg.com` facade thumbnail). Play also opens a lightbox (`#exhLightbox`) with an
autoplay URL from `data-video`. Esc/backdrop/× close and clear the iframe src.

### guest-artist.html ("Be a Guest" application) — `js/guest-artist.js`
If `art_token` exists the form is replaced (CSSOM-styled, CSP-safe) with "You're already part of
Appreciart" + dashboard link. Otherwise:
- Fields: `gaName`, `gaEmail`, `gaInstagram` (all required; email regex), `gaStyles`, `gaHowFound`,
  honeypot, and hidden `gaDateFrom`/`gaDateTo` filled by the calendar.
- **Range picker**: custom month grid (`#gaCalGrid`, Mon-first). Cells: past, today, full
  (`ga-cal-cell--full`, disabled), low (1 slot left, dot indicator), range/start/end. Slot data from
  `GET /api/public/slots/range?from=&to=` → `{ days: [{ date, available }] }`; initial load covers the
  next 3 months and re-fetches for the selected range. Click logic: first click sets start; second
  sets end (swapping if earlier); clicking the start again clears.
- Submit: `POST /api/public/guests/apply` with `{ name, email, instagram, styles?, preferred_dates?
  ("from to to"), how_found?, _honeypot }` → success panel.
- Page also has a studio-photo carousel and a reviews carousel with drag scroll.

### tattoo-consent-form.html — `js/consent.js`
Public consent form. The artist field is a **dropdown populated from `GET /api/public/artists`**
(residents + guests, value = artist name) so submissions always match a server-validated artist —
the old freetext-name gap is closed on the frontend. DOB max = today. Conditional detail fields for
medical/medications/bloodborne radios. Progress sidebar tracks scroll across sections
personal/health/booking/signature. Validation: names/phone/artist required, email regex, signature
must equal "first last" case-insensitively, and both session confirmations (not fasting, no alcohol)
must be checked. Submit: `POST /api/public/consent` (25s timeout) with the full snake_case payload +
honeypot; success on `res.ok && data.ok`.

### Static pages
`about.html`, `contact-us.html`, `faqs.html`, `privacy-policy.html`, `terms-of-use.html`,
`gallery-success.html` — content only, standard script stack, no page JS beyond shared files.

---

## Block 2 — Auth Pages

### login.html — `js/login.js`
- If `art_token` already exists → immediate redirect to `dashboard.html`.
- **PWA standalone**: the "Need access?" button and its modal are **removed from the DOM** (not
  hidden), so the installed calendar app shows a bare login form with no path into the public site.
  "Forgot password?" is deliberately kept (part of the auth flow). `header.js`/`footer.js`
  independently remove the site chrome in standalone (see Block 6), leaving a true bare shell.
- Password show/hide eye toggle. Submit: `POST /api/auth/login` (`credentials:'include'` so the
  httpOnly refresh cookie is set). 429 → rate-limit message; other failures → generic "Invalid
  credentials". On success stores `art_token` (JWT access token) and `art_artist`
  (`{ id, name, slug, role, is_resident, must_change_password, onboarding_done, guest_start_date,
  guest_end_date }`) in localStorage, then redirects to the dashboard.
- The "Need access?" modal (non-standalone) explains the portal and links to the guest application.

### forgot-password.html — `js/forgot-password.js`
Single email field → `POST /api/auth/forgot-password`. Always shows the same "If that email exists…"
message (no account enumeration). No standalone-specific code (none needed: no public-site links).

### reset-password.html — `js/reset-password.js`
Reads `?token=`; missing token → invalid-link state immediately, no request ever sent. Validates
min-8 + match, `POST /api/auth/reset-password` `{ token, password }`; non-OK (expired/invalid token)
→ invalid-link state; success → toast + redirect to login.

---

## Block 3 — Artist Dashboard (`dashboard.html` + `js/dashboard.js`, auth-gated)

Missing `art_token` or `art_artist` → redirect to login. Corrupt `art_artist` JSON → toast + login.
On load, four tabs render (`.dash-tab[data-tab]` → `#tab-{name}`): **Sessions (`bookings`) ·
Availability · Consent Forms (`consent`) · Profile** — note this is four tabs, not the three CLAUDE.md
lists. Default active = Sessions; the last-used tab persists in `localStorage.art_active_tab`; a URL
`?tab=` (used by the PWA `start_url`) is a one-time override that does **not** clobber the persisted
preference. First-login flows: `must_change_password` → forced change-password modal (temporary
password → new password, `POST /api/artist/change-password`); then guests without `onboarding_done`
get a 4-step onboarding modal (`POST /api/artist/onboarding-done` on dismissal). A voluntary
change-password button lives in the Profile → Account card.

**Auth mechanics** (self-contained in dashboard.js):
- `authFetch(path, opts)` — attaches bearer token, 12s timeout. On 401 → `refreshAccessToken()`
  (single-flight via shared `_refreshPromise`; `POST /api/auth/refresh` with `credentials:'include'`)
  and retries once. Crucially, only a **401 from the refresh endpoint** clears the session; a network
  error (status 0) or 5xx shows "Connection issue — please try again" and keeps the tokens.
- Background refresh every 13 min and on `visibilitychange` → visible; both only log out on a real 401.

**SSE**: `EventSource /api/events?token=…`. Events handled: `availability_update` → reload calendar;
`booking_update` → reload sessions; `artist_update` → refetch `/api/artist/me`, update the cached
artist (name/role/is_resident/guest dates) and re-render. On error: exponential backoff (10s→120s,
max 5 retries, refreshing the token before each reconnect); after the 5th failure a persistent
"Live updates paused — refresh the page to reconnect" note appears above the calendar.

Startup calls, in order: `loadBookings(); loadAvailability(); loadConsent(); loadProfile();
loadPhotos(); initSSE();`

### Sessions tab
`GET /api/artist/sessions` → `data.sessions || data.bookings || []`. Cards show client name, relative
date (Today/Tomorrow/Yesterday/`D Mon [YYYY]`), and one badge — "Deposit paid" if `deposit_paid`, else
the stage label (stages: new_lead, contacted, deposit_paid, confirmed, completed, cancelled). Split
into "Upcoming" and a collapsed "Past (n)" `<details>`. Cards do **not** show session time or type
(the CLAUDE.md "enrich booking cards" item is still open). Click (disabled when frozen) → edit modal:
notes always; stage select only for non-`availability` sources; date input for `booking`/`availability`
sources. Save → `PATCH /api/artist/availability/{id}` or `PATCH /api/artist/bookings/{id}` with only
the changed fields, then reload.

### Availability tab (calendar)
Endpoint differs by role: residents `GET /api/artist/studio-availability` (whole studio), guests
`GET /api/artist/my-availability` (own entries) plus `GET /api/public/slots/range` across their guest
period for per-day slot counts. Month grid, Mon-first, with prev/next arrows and a "Today" button
(220ms slide/fade transitions via `cal-grid--transition-*` classes). Guests initially open on the month
their residency starts.

Resident day cells: up to 3 bars sorted by time, `+n` overflow chip. Bar variants: available-no-client
(black at 0.5 opacity, label `II · Free` from artist initials), consultation (artist colour at 0.45),
booked (solid artist colour with `name · time · Consult?` label for own entries; other artists' bars
show only artist/time via tooltip and swallow clicks). Colours applied via CSSOM (CSP-safe); a legend
below shows artist colours + Available + Consultation. Guest day cells: outside-period (blocked), full
(no slots and no own entry), own session bar (gold `#B8860B`), or "Tap to log a session".

Day-click flows (all disabled when frozen; past/blocked/full days excluded):
- Resident, no own entry: `GET /api/artist/slots/{date}` → "Add to calendar" modal showing
  `X of Y slots available` with **Mark available** (only when `available_reservations < 2`) /
  **Book client** / Cancel.
- Resident, own available-only entry: "Available" modal → **Book a client** / **Remove** (confirm
  modal) / Cancel.
- Resident, own booked entry: view/edit modal (name, time 09:00–22:30 half-hour select,
  booking/consultation toggle) → Save / Delete.
- Guest: straight to a simplified "Add client" modal (name + time), or the view modal if a session
  already exists that day.

Writes: `POST /api/artist/availability` `{ date, is_available: true, client_name, session_time, type }`
(409 → "No slots available"); `DELETE /api/artist/availability/{date}`. All writes update the local
`studioAvailability` array optimistically and re-render — no refetch.

### Consent Forms tab
`GET /api/artist/consent`; non-OK responses throw and render an honest "Could not load consent forms.
Please refresh." (the earlier bug — reading `data.forms`/`data.consent` and always showing the empty
state — is fixed; the parser now accepts a bare array or `data.consent_forms`). Verified live: the
endpoint exists and auth-gates (401 unauthenticated); full end-to-end verification with real linked
rows requires an artist login, which this environment doesn't have. Cards: client name
(`client_first_name` + `client_last_name`), submitted date, and flag pills (Medical / Medications /
Bloodborne, or "No flags"), sorted newest-first by `submitted_at`. Click → read-only detail modal:
email, phone, DOB, eircode, instagram, referral source, artist, the three health blocks (details or
"None declared"), photo consent, both session confirmations, signature.

### Profile tab (redesigned)
Two-column layout: main column (Public profile card: bio ≤600 chars with live counter that warns
past 540; styles — max 3 tags, Enter or Add button, duplicates ignored; Your work card: profile photo
+ portfolio grid) and a right rail (How clients reach you: Instagram handle with decorative `@` prefix
— leading `@` is stripped on input with caret preservation — and a live `instagram.com/…` echo line;
WhatsApp number, guest-only; booking link, guest-only; Account card with change-password).

- **Completeness panel** (guest-only; hidden for residents): five checks — bio, photo, portfolio,
  styles, contact (WhatsApp or booking link) — with % fill bar, clickable chips that scroll/focus the
  matching field, and a label listing what's missing. At 5/5: "Profile complete — your profile is live".
- **Sticky save bar** with dirty tracking: a snapshot of bio/instagram/whatsapp/booking/styles is
  compared on every input; the bar cycles clean → "Unsaved changes" → "Saving…" → "Saved" (reverts to
  clean after 2.2s) → or "Couldn't save — try again". Save button disabled when clean. `beforeunload`
  warns if dirty.
- Save: client-side sanity checks (WhatsApp digits 8–15 after stripping non-digits, booking URL must
  parse with a dotted hostname; `https://` auto-prefixed) then `PATCH /api/artist/profile`
  `{ bio, instagram, styles, whatsapp_url ("https://wa.me/N"|null), booking_url }`.
- **Visibility sync** (guests): after saves and photo loads, `POST /api/artist/sync-visibility` →
  `{ is_public, missing[] }`. First time `is_public` flips true → "You're live" modal linking to the
  public profile (**in standalone PWA this is replaced by a link-free toast**); a later flip to false
  → "no longer visible — missing: …" toast. The live modal is once-ever (`art_profile_live_seen`).
- **Photos** (`GET /api/artist/photos` → `{ profileUrl, portfolio[{url, publicId, publicIdBare}],
  count }`): signed Cloudinary uploads — `POST /api/artist/upload-signature` `{ type,
  existingPublicId? }` → FormData POST to `api.cloudinary.com/v1_1/{cloud}/image/upload`. Max 10MB
  per file, 16 portfolio images (count shown as `(n/16)`, add button disabled at cap). Uploads render
  optimistically (the Cloudinary Search API behind loadPhotos is eventually consistent; a pending
  profile URL is remembered so the preview doesn't revert). Portfolio thumbs have replace (re-signs
  with `existingPublicId`) and delete (confirm modal → `DELETE /api/artist/photos/portfolio`)
  overlays. CSP forbids `blob:` in `img-src`, so upload previews show a text placeholder, never a
  local object URL.
- "View public profile" link in the tab header (removed entirely in standalone).

---

## Block 4 — Guest Reapply / Frozen Dashboard

`isFrozen` is computed in `loadProfile()`: `isGuest && artist.active === false` (from
`GET /api/artist/me`). When true, `applyFrozenState()` runs:

- **Top notice** (`#frozenNotice`, inserted above the tabs): label "Guest access · Inactive" and the
  line "Your guest period (DD Mon YYYY–DD Mon YYYY) has ended, so your dashboard is now read-only and
  your profile is offline. Want to come back? Request new dates." plus a **Request new dates** button.
- **Disabled**: all profile inputs (bio, instagram, whatsapp, booking URL, style input/add), the save
  bar (hidden) and save button, both upload buttons, portfolio replace/delete buttons, calendar
  day-click handlers, and session-card click handlers. The calendar and sessions list are re-rendered
  after the flag flips so handlers attached before `loadProfile()` resolved are dropped too;
  `loadPhotos`/`loadBookings`/`renderCalendar` all also check `isFrozen` independently for load-order
  safety.
- **Still visible**: everything — all four tabs render their data read-only (calendar, past sessions,
  consent forms, profile content, portfolio). Logout still works.
- **Reapply modal** (`showReapplyModal`): a month-grid range picker ported from guest-artist.js
  (same full/low/past cell logic, same `GET /api/public/slots/range` slot data primed for 3 months).
  Send → `POST /api/artist/reapply` `{ dateFrom, dateTo }` → in-modal confirmation ("we'll confirm
  your new dates by email within 2–3 days") and the frozen-notice line changes to "New dates
  requested — we'll be in touch."

---

## Block 5 — Calendar PWA

- **manifest.json**: name "Appreciart IE Calendar", `start_url: /dashboard.html?tab=availability&pwa=1`,
  `scope: /`, `display: standalone`, theme `#0a0a0a`.
- **sw.js** (`appreciart-shell-v1`): registered from dashboard.js. Shell-only caching — precaches
  dashboard/login HTML, their CSS/JS, icons, fonts. Fetch handler: cross-origin (API/Stripe/Cloudinary)
  and non-GET requests are never intercepted; same-origin GETs are network-first with cache fallback
  (`ignoreSearch: true`), and only paths in the shell list are (re)cached. API data is deliberately
  never cached (stale availability risks double-booking). `_headers` serves `/sw.js` with `no-cache`.
- **Standalone detection** everywhere: `matchMedia('(display-mode: standalone)')` or
  `navigator.standalone === true`.
- **Standalone UI** (`body.pwa-standalone` + early DOM removals): site header and footer are
  **removed** by header.js/footer.js on every page in scope; dashboard removes the "← Site" topbar
  link and the "View public profile" link; the topbar and tab strip are CSS-hidden and only the
  availability panel shows, restyled as a compact full-screen calendar with a floating logout icon
  (`#pwaLogout`, delegates to the normal logout). On launch the availability tab is force-activated.
- **Install hint** (non-standalone, mobile only, dismissible via `art_pwa_hint_dismissed`): iOS gets
  Share → "Add to Home Screen" text; Android hooks `beforeinstallprompt` for a real Install button.
  Banner is injected into the availability panel.
- **The 4 security-leak fixes — all verified in place**: (1) bare login shell — login.js removes the
  "Need access?" button/modal, header/footer removed; (2) the profile-live modal (which links to
  artist.html) is suppressed in standalone in favour of a plain toast; (3) escape-hatch links are
  **removed from the DOM**, not CSS-hidden; (4) a failed token refresh due to network error does
  **not** log the artist out — only a real 401 does (applies to authFetch, the 13-min timer, and the
  visibility handler).
- **Swipe gesture month navigation: implemented** (`0786cc6`, 2026-07-20). `touchstart`/`touchend`
  handlers on `calGrid` capture start/end coordinates; swipes whose vertical movement dominates, or
  whose horizontal delta is under 50px, are ignored. Otherwise left → next month, right → previous,
  delegating to the shared `changeMonth()` so the gesture inherits the same slide transition as the
  prev/next buttons.
- **API domain migration: complete on the frontend** (`4332c49` → `1022df4` → `d70e862`, 2026-07-17).
  Verified 2026-07-21: **zero** references to the old Railway host remain anywhere in the repo, and
  **12 files** now target `api.appreciart.ie` — `_headers` (CSP connect-src) plus `js/artist.js,
  bookings.js, consent.js, dashboard.js, forgot-password.js, gallery.js, guest-artist.js, header.js,
  index.js, login.js, reset-password.js`. **iOS session persistence is not resolved by this alone**:
  the remaining blocker is the backend cookie-domain change (other repo) needed for the refresh
  cookie to be issued same-site. No frontend work is outstanding here.

---

## Block 6 — Shared Utilities & Design System

**Script load order** (public pages): `utils.js → toast.js → header.js → footer.js → main.js →
{page}.js → cookie-banner.js`. dashboard.html stops after dashboard.js (no cookie banner).

- **utils.js**: `esc()` HTML-escapes `& < > " ' /` for innerHTML injection; `isSafeUrl()` https-only
  guard for API-derived URLs; `showDepositConfirm(amount)` → Promise<bool> pre-payment modal
  (resolves true if the modal markup isn't on the page).
- **toast.js**: `window.toast(message, type)` — success/error/info (unknown types coerce to info),
  3.5s auto-dismiss, message set via textContent.
- **header.js** (IIFE): hides `#site-header` on dashboard; **removes it entirely in standalone and
  returns**. Renders desktop nav (Artists/Bookings/Gallery/Exhibitions/Be a Guest + Consent Form),
  logged-in artist dropdown (name from `art_artist`, My Dashboard + Sign out → `POST /api/auth/logout`
  then clears localStorage), "Book Now"/"Artist Login" buttons, scroll state, hamburger + full-screen
  mobile nav with Esc/close handling.
- **footer.js** (IIFE): **removed in standalone**. Renders brand row, nav links, socials, legal links,
  "Manage cookies" button (dispatches `appreciart:manage-cookies`). Wave SVG colour/background from
  `data-wave-color`/`data-wave-bg` validated against `/^#[0-9a-fA-F]{3,6}$/`; wave collapses when
  colour equals background.
- **main.js**: resident-card touch toggle, `img[data-hide-on-error]` handler, `.reveal`
  IntersectionObserver, `[data-drag]` mouse/touch scroll, reviews + guests carousel arrows.
- **cookie-banner.js**: consent record in `localStorage.appreciart_cookie_consent` (versioned "1.0");
  accept → injects GA (`G-ZEW2BJBRGQ`, `anonymize_ip`); decline stores refusal; the manage-cookies
  event re-opens the banner.

**Design tokens** (`css/main.css :root`): `--white #ffffff · --off-white #f5f5f5 · --black #000000
(CLAUDE.md says #0a0a0a — the code says #000000) · --mid #636363 · --light #e0e0e0 · --sec-grey
#9a9a9a · --font Poppins (self-hosted woff2, 300/400/700/900) · --max 1280px`. Flat/editorial
identity: zero border-radius, 9px uppercase tracked labels. Artist colours: moreirart `#2E7D32`,
marina `#E64A19`, renan `#1565C0`, guest `#B8860B`.

**CSP** (`_headers`, single global rule):
- `default-src 'self'`; `script-src 'self' 'unsafe-inline'` + js.stripe.com + googletagmanager.com
  (inline **scripts** allowed for GTM/Stripe; avoid adding more);
- `style-src 'self'` — **no inline styles**; all dynamic styling must use CSSOM. Inline `style="…"`
  attributes are silently blocked by the browser (the three known violations were fixed in `5df31a3`);
- `img-src 'self' data: res.cloudinary.com i.ytimg.com` (ytimg added for YouTube facades; `blob:`
  deliberately absent);
- `connect-src`: self, Stripe (api/m/m.network), `api.appreciart.ie`, api.cloudinary.com, GA;
- `frame-src`: js.stripe.com, hooks.stripe.com, youtube.com, youtube-nocookie.com;
- `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`.
Plus `nosniff`, `X-Frame-Options DENY`, `Referrer-Policy strict-origin-when-cross-origin`,
restrictive Permissions-Policy; `/api/* → Cache-Control: no-store`; `/sw.js → no-cache`.

**Auth model**: 15-min JWT access token in `localStorage.art_token`; artist object in
`localStorage.art_artist`; 30-day httpOnly refresh cookie, currently `sameSite: none`. Frontend and
API now share a root domain (`appreciart.ie` / `api.appreciart.ie`), so the original cross-site
explanation for the iOS PWA logout **no longer applies**. Two things remain open, neither confirmed
as the cause: the backend cookie-domain change is still pending (other repo), so the cookie is not
yet actually issued same-site; and a login-before-install sequencing issue observed 2026-07-21 has
not been root-caused. Do not treat either as diagnosed.

---

## Block 7 — Known Issues Inventory

Every unresolved item, each re-verified against current code, lives in **TASKS.md** (checkbox
backlog). Headlines as of 2026-07-21: payments are still Stripe **test-mode** (the backend's
`/api/public/config` serves a `pk_test_…` key; the frontend no longer hardcodes any key, but
gallery.html still hardcodes 4 Stripe Price IDs that must be re-created as live prices at the same
time). The `appreciart.ie` domain and the `api.appreciart.ie` migration are both **done**, as is PWA
swipe navigation. Still open: the queued calendar UX polish (colour fill/outline availability
encoding — partially addressed, see the TASKS.md note — tap feedback, modal copy cleanup); dashboard
session cards, tab counts and tab fade transitions from CLAUDE.md's "What's Next"; and three auth
findings logged 2026-07-21 (multi-tab refresh race, duplicated logout, uncleared per-artist state).
The three inline-style CSP violations (`5df31a3`) and the missing bookings.js fetch timeout
(`08e1772`) are fixed.
