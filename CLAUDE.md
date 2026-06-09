# Appreciart IE — Frontend Instructions
**Repo:** appreciart-ie · Cloudflare Pages  
**Version:** 3.0 — June 2026

---

## Context

Public site + artist dashboard for Appreciart IE, a private tattoo studio in Ballsbridge, Dublin.  
**Backend:** https://appreciart-internal-production-ee3c.up.railway.app  
**Frontend:** https://appreciart-website.pages.dev  
**Domain:** `appreciart.ie` on Cloudflare (not yet pointed to Pages)

---

## Work Rules — Never Violate

1. Read the file before any change — ask Copilot for exact lines first
2. One surgical change per prompt — find → replace exact string
3. Never mix repos in the same code prompt
4. Never invent function names, variables, or endpoints
5. If Copilot reports STOP — fix the string before continuing
6. Files < 150 lines → send complete. Files > 150 lines → find/replace prompts
7. Smoke test before every commit — only commit when stable
8. Single-purpose commits — one logical change per commit

### Copilot Prompt Format — Always Use This

```
STRICT INSTRUCTIONS — READ BEFORE ACTING:
Do NOT search, read, or analyse any file.
Do NOT modify anything except the exact lines specified.
Do NOT refactor, rename, reformat or add comments.
Apply only what is explicitly written below. Nothing more.
If you cannot find the exact string, STOP and report.

In [FILE], find this exact string:
[EXACT STRING]
Replace with:
[NEW STRING]
```

---

## Security Rules

### Never
- Use `innerHTML` with unescaped external data — always use `esc()` or `textContent`
- Hardcode API keys or secrets in any JS file
- Add inline `style=` or `onclick=` attributes in HTML
- Add `'unsafe-inline'` to `script-src` in CSP
- Use `localStorage` for sensitive data beyond what's necessary
- Log tokens, passwords, or PII to console

### Always
- Use `esc()` on all API-derived values injected into innerHTML or HTML attributes
- Add `rel="noopener noreferrer"` to all external `target="_blank"` links
- Use `AbortSignal.timeout()` on all fetch calls
- Check `res.ok` before parsing JSON on all fetch calls
- Use `textContent` instead of `innerHTML` for plain text
- Validate URL schemes (`https://`) before assigning to `img.src` or `href`

---

## Script Load Order — Every Page

```html
<script src="js/utils.js"></script>       <!-- esc(), helpers — FIRST -->
<script src="js/toast.js"></script>        <!-- window.toast() -->
<script src="js/header.js"></script>       <!-- IIFE, nav, auth state -->
<script src="js/footer.js"></script>       <!-- IIFE, footer HTML -->
<script src="js/main.js"></script>         <!-- scroll reveal, drag -->
<script src="js/cookie-banner.js"></script>
<script src="js/{page}.js"></script>       <!-- page-specific LAST -->
```

**Critical:** `utils.js` and `toast.js` must load before `header.js`. Missing these breaks the header on that page.

---

## Key Patterns

### XSS-safe HTML injection
```js
// Safe — use esc() for innerHTML
element.innerHTML = `<p>${esc(data.name)}</p>`;

// Always safe — no esc needed
element.textContent = data.name;

// Attributes — always esc()
div.innerHTML = `<img src="${esc(url)}" alt="${esc(name)}">`;
```

### Auth fetch (dashboard pages)
```js
const res = await authFetch('/api/artist/me');
if (!res.ok) throw new Error('Failed');
const data = await res.json();
```

### Toast notifications
```js
window.toast('Message', 'success'); // success | error | info
```

### Confirm modal (dashboard)
```js
const confirmed = await showConfirmModal('Are you sure?', 'Delete', 'Cancel');
if (!confirmed) return;
```

### Loading spinner on buttons
```js
btn.disabled = true;
btn.innerHTML = '<svg class="btn-spinner" ...></svg> Saving…';
// in finally:
btn.disabled = false;
btn.textContent = 'Save changes';
```

---

## CSS Classes (Design System)

### Form elements (unified — use these everywhere)
```
.form-input           — text inputs, selects, textareas
.form-label           — field labels (9px, uppercase, 0.2em letter-spacing)
.form-field           — field wrapper (margin-bottom: 16px)
.form-field--spacious — field wrapper (margin-bottom: 24px)
.form-textarea        — textarea modifier (resize: vertical, min-height: 120px)
.form-select          — select modifier (custom chevron arrow)
.form-input--error    — error state (red border)
```

### Dashboard components
```
.dash-empty           — empty state (centred text, padding: 48px)
.dash-empty-icon      — SVG icon above empty state text
.dash-empty-sub       — subtitle below empty state text
.dash-panel-header    — section header (icon + uppercase label + border-bottom)
.btn-spinner          — rotating SVG inside loading buttons
.bio-counter          — character counter below bio textarea
.bio-counter--warn    — yellow colour when > 540/600 chars
```

### Buttons
```
.btn.btn-primary      — black background, white text
.btn.btn-secondary    — white background, black border
.btn.btn-sm           — smaller padding variant
```

### CSS variables
```
--white       #ffffff
--off-white   #f5f5f5
--black       #0a0a0a
--mid         #636363
--light       #e0e0e0
--sec-grey    #9a9a9a
--font        'Poppins', sans-serif
--max         1200px
--px          clamp(20px, 5vw, 80px)
--sv          clamp(60px, 10vw, 120px)
```

---

## Pages

### Public
```
index.html            — homepage (resident + guest artist cards, reviews, collab)
about.html            — studio story
faqs.html             — FAQs
contact-us.html       — contact + maps
artist.html           — dynamic artist profile by ?slug=, Stripe booking modal
bookings.html         — booking form + Stripe Payment Element
gallery.html          — ecommerce (4 works)
gallery-success.html  — post-purchase confirmation
exhibitions.html      — YouTube videos with lightbox (iframes deferred)
tattoo-consent-form.html — consent form (GDPR-compliant)
guest-artist.html     — guest application + calendar range picker
privacy-policy.html   — GDPR privacy policy
terms-of-use.html     — terms of use
```

### Internal (auth-gated)
```
login.html            — artist login
dashboard.html        — artist dashboard (residents + guests)
admin.html            — admin panel (TODO)
```

---

## Dashboard Features

```
Auth:       accessToken (15m) + refreshToken httpOnly cookie (30d)
Tabs:       Sessions · Availability · Profile (all roles)
Calendar:   mark available/booked, slot bars with artist colours
Sessions:   upcoming + past, relative dates (Today/Tomorrow/Yesterday)
Profile:    bio (600 char counter), instagram, whatsapp, booking_url, styles
Portfolio:  upload, delete, replace (Cloudinary)
SSE:        availability_update + booking_update real-time events
Modals:     backdrop blur, spring animation cubic-bezier
Toast:      SVG icons (success/error/info)
Onboarding: 4-step modal (guests, first login)
Password:   forced change modal (must_change_password=true)
```

### Artist Colours (Calendar)
```js
const ARTIST_COLOURS = {
  'moreirart': { bg: '#2E7D32', text: '#ffffff' }, // green
  'marina':    { bg: '#E64A19', text: '#ffffff' }, // orange
  'renan':     { bg: '#1565C0', text: '#ffffff' }, // blue
};
// Guest fallback: { bg: '#B8860B', text: '#ffffff' } // gold
```

---

## Cloudinary (Frontend)
```
Cloud name:    dji3wtp20
Upload preset: appreciart_unsigned (unsigned, for direct browser uploads)
Folders:       appreciart/{slug}/           — profile photo
               appreciart/{slug}/portfolio/ — portfolio images
Dynamic Folder Mode: URLs require version number /v{version}/{public_id}.webp
```

---

## CSP (_headers — Cloudflare)
```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://js.stripe.com https://www.googletagmanager.com;
  style-src 'self';
  font-src 'self';
  img-src 'self' data: https://res.cloudinary.com;
  connect-src 'self' https://appreciart-internal-production-ee3c.up.railway.app
    https://api.stripe.com https://m.stripe.com https://m.stripe.network
    https://api.cloudinary.com
    https://www.google-analytics.com https://analytics.google.com
    https://stats.g.doubleclick.net;
  frame-src https://js.stripe.com https://hooks.stripe.com
    https://www.youtube.com https://www.youtube-nocookie.com;
  form-action 'self';
  object-src 'none';
  base-uri 'self';
```

---

## GDPR (Frontend)
```
Cookie consent: localStorage key 'appreciart_cookie_consent', version '1.0'
GA ID:          G-ZEW2BJBRGQ (only loads after explicit consent)
GA config:      anonymize_ip: true
Withdraw:       "Manage cookies" button in footer → reopens banner
                dispatches CustomEvent('appreciart:manage-cookies')
```

---

## What's Next

1. **Admin panel** (`admin.html` + `js/admin.js` + `css/admin.css`)
   - Sidebar navigation (desktop) / bottom nav (mobile)
   - Sections: Overview · Applications · Artists · Bookings · Consent Forms · Studio Calendar
   - Paginated tables (10/page), filters, modals for detail views
   - Protected by Cloudflare Zero Trust
2. **Re-application flow** — returning guest artists
3. **PWA** — dashboard installable on mobile (manifest + service worker)
4. **Landing page polish** — hero photo, WhatsApp CTA (when studio assets ready)
5. **Point `appreciart.ie`** to Cloudflare Pages

---

## Test Accounts
```
Admin: id=4, slug='Matth', role='admin'
Guest: id=5, email='contatonegostando@gmail.com'
       guest_start_date: 2026-06-22, guest_end_date: 2026-06-23
```