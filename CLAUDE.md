# Appreciart IE — Frontend Instructions
**Repo:** appreciart-ie · Cloudflare Pages  
**Version:** 4.0 — June 2026

---

## Context

Public site + artist dashboard + admin panel for Appreciart IE, a private tattoo studio in Ballsbridge, Dublin.  
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

---

## Security Rules

### Never
- Use `innerHTML` with unescaped external data — always use `esc()` or `textContent`
- Hardcode API keys or secrets in any JS file
- Add `'unsafe-inline'` to `script-src` in CSP
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
<script src="js/utils.js"></script>       <!-- esc(), isSafeUrl(), showDepositConfirm() — FIRST -->
<script src="js/toast.js"></script>        <!-- window.toast() -->
<script src="js/header.js"></script>       <!-- IIFE, nav, auth state -->
<script src="js/footer.js"></script>       <!-- IIFE, footer HTML -->
<script src="js/main.js"></script>         <!-- scroll reveal, drag -->
<script src="js/cookie-banner.js"></script>
<script src="js/{page}.js"></script>       <!-- page-specific LAST -->
```

---

## Key Patterns

### XSS-safe HTML injection
```js
element.innerHTML = `<p>${esc(data.name)}</p>`;
element.textContent = data.name; // always safe, no esc needed
```

### Auth fetch (dashboard pages)
```js
const res = await authFetch('/api/artist/me');
if (!res.ok) throw new Error('Failed');
const data = await res.json();
```

### Toast
```js
window.toast('Message', 'success'); // success | error | info
```

### Confirm modal
```js
const confirmed = await showConfirmModal('Are you sure?', 'Delete', 'Cancel');
if (!confirmed) return;
```

---

## CSS Classes (Design System)

### Form elements
.form-input           — text inputs, selects, textareas

.form-label           — 9px, uppercase, 0.2em letter-spacing

.form-field           — margin-bottom: 16px

.form-field--spacious — margin-bottom: 24px

.form-textarea        — resize: vertical, min-height: 120px

.form-select          — custom chevron

.form-input--error    — red border

### Dashboard
.dash-empty           — empty state (centred, padding: 48px)

.dash-empty-icon      — SVG above empty state

.dash-empty-sub       — subtitle below empty state

.dash-panel-header    — icon + uppercase label + border-bottom

.btn-spinner          — rotating SVG in loading buttons

.bio-counter          — character counter below bio

.bio-counter--warn    — yellow when > 540/600

### Buttons
.btn.btn-primary      — black background, white text

.btn.btn-secondary    — white background, black border

.btn.btn-danger       — red background (destructive actions)

.btn.btn-sm           — smaller padding

### CSS variables
--white       #ffffff

--off-white   #f5f5f5

--black       #0a0a0a

--mid         #636363

--light       #e0e0e0

--sec-grey    #9a9a9a

--font        'Poppins', sans-serif

--px          clamp(20px, 5vw, 80px)

---

## Pages

### Public
index.html              — homepage

about.html              — studio story

faqs.html               — FAQs

contact-us.html         — contact + maps

artist.html             — dynamic artist profile by ?slug=, Stripe booking modal

bookings.html           — booking form + Stripe Payment Element

gallery.html            — ecommerce (4 works)

gallery-success.html    — post-purchase confirmation

exhibitions.html        — YouTube videos with lightbox (iframes deferred)

tattoo-consent-form.html — consent form (GDPR-compliant)

guest-artist.html       — guest application + calendar range picker

privacy-policy.html     — GDPR privacy policy

terms-of-use.html       — terms of use

### Internal (auth-gated)
login.html      — artist login (redirects to dashboard if already logged in)

dashboard.html  — artist dashboard (residents + guests)

admin/          — admin panel (Cloudflare Zero Trust protected)

index.html    — admin panel entry point

---

## Dashboard Features
Auth:       accessToken (15m JWT) + refreshToken httpOnly cookie (30d) + DB revocation

Tabs:       Sessions · Availability · Profile

Calendar:   mark available/booked, slot bars with artist colours

Sessions:   upcoming + past (collapsible), relative dates

Profile:    bio (600 char), instagram, whatsapp, booking_url, styles (max 3)

completeness bar (bio/photo/portfolio/contact) — guests only see publish btn when 4/4

Portfolio:  upload, delete, replace (Cloudinary, max 16)

SSE:        availability_update + booking_update real-time

Modals:     backdrop blur, spring animation

Stage labels: English enum — new_lead · contacted · deposit_paid · confirmed · completed · cancelled

Password:   forced change modal (must_change_password=true) — sends old_password + password

Onboarding: 4-step modal (guests, first login after password change)

### Artist Colours (Calendar + Admin)
```js
const ARTIST_COLOURS = {
  'moreirart': { bg: '#2E7D32', text: '#ffffff' }, // green
  'marina':    { bg: '#E64A19', text: '#ffffff' }, // orange
  'renan':     { bg: '#1565C0', text: '#ffffff' }, // blue
};
// Guest fallback: { bg: '#B8860B', text: '#ffffff' } // gold
```

---

## Admin Panel (appreciart-ie/admin/)
Entry:     admin/index.html

JS:        admin/js/admin.js — all UI logic

CSS:       admin/css/admin.css

Auth:      x-admin-secret header (fetched from /api/admin/config on load)

Protected: Cloudflare Zero Trust (email-based)

SSE:       real-time updates on all sections (availability, booking, application, consent events)

### Sections
Overview      — 4 stat cards (pending apps, active artists, bookings this month, new leads)

Applications  — guest applications table, click row → modal (approve/reject for pending)

Artists       — all artists table, click row → edit modal (save + deactivate/activate)

Studio        — chronological list (today+45d) + month grid calendar

Bookings      — paginated table, filter by stage, click row → detail modal + stage edit

Consent Forms — paginated table, search by name/email, click row → full detail modal

### Admin JS Patterns
```js
// All API calls go through api() which handles auth header
const d = await api('/api/admin/overview');

// Modals
openModal('Title', bodyHTML, footerHTML);
closeModal();

// Confirm destructive actions
const confirmed = await showConfirmModal('Message');

// Skeleton loading
skeletonRows(5) // generates 5 skeleton table rows

// Empty state
emptyState('icon-name', 'Title', 'Subtitle')

// Status pills (uses labelMap for display)
statusPill('new_lead') // → "New Lead" pill
```

---

## Cloudinary (Frontend)
Cloud name:    dji3wtp20

Upload preset: appreciart_unsigned

Folders:       appreciart/{slug}/           — profile photo

appreciart/{slug}/portfolio/ — portfolio images

Dynamic Folder Mode: URLs require /v{version}/{public_id}.webp

---

## Booking Flow
artist.html:   date picker → booking modal → payment-intent → deposit confirm → Stripe Payment Element

bookings.html: artist selector → date picker → form → payment-intent → deposit confirm → Stripe Payment Element

Both:          redirect_status verified on return from 3DS/Klarna

proceed button disabled after Payment Element mounts (prevents orphan bookings)

logged-in artists see dashboard notice instead of booking flow

---

## GDPR (Frontend)
Cookie consent: localStorage 'appreciart_cookie_consent', version '1.0'

GA ID:          G-ZEW2BJBRGQ (loads only after explicit consent)

GA config:      anonymize_ip: true

Withdraw:       "Manage cookies" footer button → CustomEvent('appreciart:manage-cookies')

---

## Test Accounts
Admin: id=4, slug='Matth', role='admin'

Guest: id=5, email='contatonegostando@gmail.com'

guest_start_date: 2026-06-22, guest_end_date: 2026-06-23

---

## What's Next
- Re-application flow for returning guest artists
- PWA — dashboard installable on mobile
- Point appreciart.ie domain to Cloudflare Pages
- Landing page polish (hero photo, WhatsApp CTA — when studio assets ready)
- WhatsApp agent (pending Anthropic credits)