# Appreciart IE — Design System & Project Reference

## Project

- **Name:** Appreciart IE
- **Description:** Public website for a private tattoo studio and gallery in Ballsbridge, Dublin
- **Frontend repo:** https://github.com/appreciart-ie/appreciart-website.git
- **Backend repo:** https://github.com/appreciart-ie/appreciart-internal.git
- **Stack:** Vanilla JS, HTML, CSS — no frameworks, no build tools
- **Frontend host:** Cloudflare Pages
- **Backend host:** Railway (Node.js + PostgreSQL)

## Folder Structure

```
/css
  main.css          — design system base
  {page}.css        — page-specific styles
/js
  main.js           — scroll reveal, drag, carousel
  header.js         — nav injected
  footer.js         — footer injected
  utils.js          — esc() XSS sanitisation
  {page}.js         — page-specific logic
/images
  /logos
  /resident-artists
  /studio
  /gallery
  /guest-artist
  /dates
```

## Typography

- **Font family:** Poppins (Google Fonts)
- **Weights used:**
  - 300 — Light (body, secondary text)
  - 400 — Regular (body, general content)
  - 700 — Bold (titles, headings)
  - 900 — Black (hero titles, strong emphasis)
- **Hierarchy:** Strong contrast between weights — titles in 700/900, body in 300/400

## Colours

| Name           | Hex       | CSS Variable   | Usage                        |
|----------------|-----------|----------------|------------------------------|
| Black          | `#000000` | `--black`      | Primary text, headings       |
| White          | `#ffffff` | `--white`      | Backgrounds                  |
| Mid Grey       | `#636363` | `--mid`        | Secondary text, UI elements  |
| Secondary Grey | `#9a9a9a` | `--sec-grey`   | Tertiary text, subtle detail |
| Off White      | `#f5f5f5` | `--off-white`  | Section backgrounds          |
| Light          | `#e0e0e0` | `--light`      | Borders, dividers            |

## Tone & Visual Direction

- Editorial, gallery, magazine aesthetic
- Clean white backgrounds
- High contrast black type
- Minimal colour use — black/white/grey only
- No rounded corners (border-radius: 0)
- Typography-driven layout

## Pages

| Page | File | Description |
|------|------|-------------|
| Homepage | index.html | Hero, residents, guests, gallery preview, reviews |
| Artist profile | artist.html | Dynamic by ?slug=, Cloudinary portfolio, booking modal |
| Bookings | bookings.html | Artist selector, availability grid, Stripe Payment Element |
| Gallery | gallery.html | 4 works, lightbox, Stripe Checkout |
| Gallery success | gallery-success.html | Post-purchase confirmation |
| Exhibitions | exhibitions.html | 2 YouTube embeds, lightbox |
| Be a Guest | guest-artist.html | Application form, reviews, studio carousel |
| Consent Form | tattoo-consent-form.html | Full medical consent form |
| About | about.html | Studio story |
| FAQs | faqs.html | |
| Contact | contact-us.html | |
| Privacy Policy | privacy-policy.html | |
| Terms of Use | terms-of-use.html | |

## CSS Patterns

```css
/* Spacing */
--sv: 80px;        /* section vertical padding */
--px: clamp(16px, 5vw, 80px); /* horizontal padding */
--max: 1280px;     /* max content width */

/* Sections always follow this pattern */
.section {
  padding: var(--sv) var(--px);
  max-width: var(--max);
  margin: 0 auto;
}
```

## JS Patterns

```javascript
// XSS sanitisation — always use on API data injected into innerHTML
esc(str) // defined in js/utils.js, loaded before all page scripts

// Fetch pattern
const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

// Error handling — never console.error in production
```

## Security Rules

- `esc()` on all API values injected into innerHTML
- No inline `style=` or `onclick=` attributes
- No API keys in frontend code
- All CSS and JS in external files
- CSP configured in `_headers` (Cloudflare Pages)

## Copilot Prompt Format (ALWAYS)

```
STRICT INSTRUCTIONS — READ BEFORE ACTING:
Do NOT search, read, or analyse any file.
Do NOT modify anything except the exact lines specified.
Do NOT refactor, rename, reformat or add comments.
Apply only what is explicitly written below. Nothing more.
If you cannot find the exact string, STOP and report.

In [FILE], find this exact string:
[EXACT CODE]
Replace with:
[NEW CODE]
```

## Backend API (appreciart-internal)

Base URL: `https://appreciart-internal-production-ee3c.up.railway.app`

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| /api/public/artists | GET | — | List resident artists |
| /api/public/artists/:slug | GET | — | Artist profile + portfolio |
| /api/public/availability/:slug | GET | — | Available dates + date images |
| /api/public/bookings/payment-intent | POST | — | Create Stripe PaymentIntent |
| /api/public/gallery/checkout | POST | — | Create Stripe Checkout Session |
| /api/public/consent | POST | — | Submit consent form |
| /api/public/guests/apply | POST | — | Submit guest artist application |
| /api/auth/login | POST | — | Artist login → JWT |
| /api/auth/verify | POST | Bearer JWT | Verify token |
| /api/webhooks/stripe | POST | Stripe sig | Payment webhook |
| /api/agent/message | POST | x-webhook-secret | WhatsApp agent |

## Cloudinary

- Cloud name: `dji3wtp20`
- Mode: Dynamic Folder Mode
- URLs require version number: `/v{version}/{public_id}.webp`
- Folders: `appreciart/moreirart/`, `appreciart/marina/`, `appreciart/renan/`, `appreciart/dates/`, `appreciart/reviews/`, `appreciart/studio/`