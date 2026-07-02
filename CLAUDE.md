# Appreciart IE — Frontend

Public site + artist dashboard for Appreciart IE, a tattoo/art studio in Ballsbridge, Dublin.
Vanilla JS · HTML · CSS. No build step, no package.json — static files served as-is.
Backend: https://appreciart-internal-production-ee3c.up.railway.app · Deploy: push to `main` → Cloudflare Pages (appreciart-website.pages.dev).

## Work Rules
1. Read file before any change
2. One surgical find/replace per prompt
3. Never mix repos in the same prompt
4. Smoke test (backend) before every commit
5. Single-purpose commits

## Stack & Key Files
- No bundler / npm — plain `<script src>` tags per page, no modules.
- `_headers` — Cloudflare Pages security headers (CSP etc.)
- `robots.txt`, `sitemap.xml` — SEO
- `js/utils.js` — shared helpers: `esc()` (HTML-escape for innerHTML), `isSafeUrl()` (https-only guard), `showDepositConfirm()` (pre-payment modal → Promise<bool>)
- `js/toast.js` — defines `window.toast(message, type)` where type = success | error | info
- `js/header.js` — IIFE: renders desktop + mobile nav into `#site-header`, reads auth from `localStorage` (`art_token`, `art_artist`), shows artist dropdown when logged in, handles sign-out (POST /api/auth/logout), hamburger, scroll state. Hidden on dashboard.
- `js/footer.js` — IIFE: renders `#site-footer`, wave colour from `data-wave-color` / `data-wave-bg` (validated hex).
- `js/main.js` — global interactions: resident-card touch toggle, `img[data-hide-on-error]`, `.reveal` IntersectionObserver, `[data-drag]` scroll, reviews carousel.

## Page Inventory (root .html)
- `index.html` — homepage / hero / residents / reviews (`js/index.js`)
- `bookings.html` — 4-step public booking wizard (`js/bookings.js`)
- `artist.html` — single artist public page: availability calendar → booking modal → Stripe (`js/artist.js`)
- `guest-artist.html` — "Be a Guest" application form w/ calendar range picker (`js/guest-artist.js`)
- `gallery.html` / `gallery-success.html` — gallery + submission success (`js/gallery.js`)
- `exhibitions.html` — exhibitions listing (`js/exhibitions.js`)
- `tattoo-consent-form.html` — public consent form (`js/consent.js`)
- `dashboard.html` — artist dashboard, auth-gated (`js/dashboard.js`)
- `login.html` — artist login (`js/login.js`)
- `about.html`, `contact-us.html`, `faqs.html`, `privacy-policy.html`, `terms-of-use.html` — static content

## JS Architecture
Standard script load order (see index.html):
`utils.js → toast.js → header.js → footer.js → main.js → {page}.js → cookie-banner.js`
(dashboard.html omits index.js/cookie-banner; page script varies.)

Key patterns:
```js
el.innerHTML = `<p>${esc(data.name)}</p>`;         // XSS-safe injection
window.toast('Saved', 'success');                   // toast
const ok = await showDepositConfirm(50);            // pre-payment confirm
fetch(url, { signal: AbortSignal.timeout(10000) }); // timeout on every fetch
```

Dashboard auth (self-contained in `js/dashboard.js`, NOT a shared helper):
- `authFetch(path, opts)` attaches `art_token` bearer; on 401 calls `refreshAccessToken()` and retries.
- `refreshAccessToken()` — single-flight (shared `_refreshPromise`), POST `/api/auth/refresh` with `credentials:'include'` (httpOnly refresh cookie), updates `art_token`.
- Tabs: `.dash-tab[data-tab]` toggles `#tab-{name}` — **availability · bookings · profile**.

Guest-artist form: fields `gaName, gaEmail, gaInstagram, gaStyles, gaHowFound` + hidden `gaDateFrom`/`gaDateTo` populated by a custom month-grid range picker (`#gaCalGrid`, prev/next, `rangeStart`/`rangeEnd`).

Bookings wizard (`js/bookings.js`): `currentStep` 1→4, `goToStep()` guards forward nav (needs selectedArtist → selectedDay → clientSecret). Steps: **1 Artist · 2 Date · 3 Details · 4 Payment**.

## CSS Classes
- Per-page stylesheet mirrors page name in `css/` (`main.css` global; `dashboard.css`, `bookings.css`, `guest-artist.css`, `consent.css`, etc.)
- Nav: `.nav`, `.nav-links`, `.nav-artist`, `.nav-dropdown(.open)`, `.nav-mobile(.open)`, `.nav-m-*`
- Dashboard: `.dash-tab(.active)`, `#tab-*`, `.dash-empty`, `.dash-empty-icon`
- Forms: field error spans toggled with `.visible` (e.g. `#gaNameErr.visible`)
- Toast: `.toast`, `.toast--{success|error|info}`, `.toast--visible`

## CSP (`_headers`)
`default-src 'self'` with:
- `script-src 'self' 'unsafe-inline'` + js.stripe.com, googletagmanager.com — inline **scripts** are permitted here (GTM/Stripe); avoid adding more.
- `style-src 'self'` — no inline styles. Use CSSOM (`element.style.x`), never `style="..."` attributes.
- `img-src 'self' data: res.cloudinary.com`
- `connect-src`: self, Stripe, railway backend, api.cloudinary.com, Google Analytics
- `frame-src`: js.stripe.com, hooks.stripe.com, youtube(-nocookie).com
- `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`
- Global: `X-Content-Type-Options nosniff`, `X-Frame-Options DENY`, `Referrer-Policy strict-origin-when-cross-origin`, restrictive `Permissions-Policy`. `/api/*` → `Cache-Control: no-store`.

## Cloudinary (signed upload — dashboard only)
1. `authFetch('/api/artist/upload-signature', ...)` → `{ cloud, signature, ... }` from backend.
2. `uploadToCloudinary(file, sig)` POSTs FormData to `https://api.cloudinary.com/v1_1/{cloud}/image/upload`.
Used for profile photo + portfolio images. Backend holds the API secret; frontend never does.

## Security — Absolute Rules
- Always `esc()` on API data injected into innerHTML
- Never hardcode secrets or API keys
- Use CSSOM (`element.style.x`), never inline `style=` attributes
- `AbortSignal.timeout()` on all fetch calls
- `rel="noopener noreferrer"` on all external links

## Design System
`--white #ffffff · --off-white #f5f5f5 · --black #0a0a0a · --mid #636363 · --light #e0e0e0`
Font 'Poppins'. Zero border-radius aesthetic. 9px uppercase tracked labels.
Artist colours: moreirart `#2E7D32` · marina `#E64A19` · renan `#1565C0` · guest `#B8860B`

## Auth Model
JWT access token 15min in `localStorage` (`art_token`); artist object in `art_artist`.
httpOnly refresh cookie 30d, `sameSite: none` (cross-domain pages.dev ↔ railway.app).

## What's Built
- Full public site (home, gallery, exhibitions, about, contact, FAQs, legal pages)
- 4-step booking wizard + single-artist booking page, both Stripe Payment Element (date format YYYY-MM-DD throughout)
- Public tattoo consent form (signature must match full name)
- Guest-artist application with custom calendar range picker
- Artist dashboard: availability, bookings/sessions, profile — signed Cloudinary uploads, single-flight token refresh
- Cookie banner, toast system, responsive nav with mobile menu

## What's Next
- Point `appreciart.ie` domain → Cloudflare Pages
- Enrich booking cards (time + type + stage pill), tab counts, tab fade transition

## Copilot Prompt Format
STRICT INSTRUCTIONS — READ BEFORE ACTING:
Do NOT search, read, or analyse any file.
Do NOT modify anything except the exact lines specified.
Do NOT refactor, rename, reformat or add comments.
Apply only what is explicitly written below. Nothing more.
If you cannot find the exact string, STOP and report.
