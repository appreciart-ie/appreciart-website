# Appreciart IE — Frontend
Vanilla JS · HTML · CSS · Cloudflare Pages

Public site + artist dashboard for Appreciart IE, Ballsbridge Dublin.
Backend: https://appreciart-internal-production-ee3c.up.railway.app
Deploy: push to main → auto-deploy to appreciart-website.pages.dev

## Structure
js/           — page scripts (dashboard.js, bookings.js, artist.js, login.js...)
css/          — stylesheets (main.css, dashboard.css, bookings.css...)
admin/        — admin panel (Zero Trust protected)
images/       — static assets
videos/       — hero video

## Script Load Order (every page)
utils.js → toast.js → header.js → footer.js → main.js → cookie-banner.js → {page}.js

## Work Rules
1. Read file before any change
2. One surgical find/replace per prompt
3. Never mix repos in the same prompt
4. Smoke test (backend) before every commit
5. Single-purpose commits

## Copilot Prompt Format
STRICT INSTRUCTIONS — READ BEFORE ACTING:
Do NOT search, read, or analyse any file.
Do NOT modify anything except the exact lines specified.
Do NOT refactor, rename, reformat or add comments.
Apply only what is explicitly written below. Nothing more.
If you cannot find the exact string, STOP and report.

## Security — Absolute Rules
- Always esc() on API data injected into innerHTML
- Never hardcode secrets or API keys
- Never 'unsafe-inline' in script-src CSP
- Use CSSOM (element.style.x) not inline style= attributes
- AbortSignal.timeout() on all fetch calls
- rel="noopener noreferrer" on all external links

## Key Patterns
```js
element.innerHTML = `<p>${esc(data.name)}</p>`;  // XSS-safe
const res = await authFetch('/api/artist/me');     // auth fetch
window.toast('Message', 'success');                // toast
const ok = await showConfirmModal('Sure?');        // confirm
```

## CSS Design System
--white #ffffff · --off-white #f5f5f5 · --black #0a0a0a
--mid #636363 · --light #e0e0e0 · --font 'Poppins'
Zero border-radius aesthetic. 9px uppercase tracked labels.

## Artist Colours
moreirart → #2E7D32 · marina → #E64A19 · renan → #1565C0 · guest → #B8860B

## Dashboard
Auth: JWT 15min (localStorage) + httpOnly refresh cookie 30d
Tabs: Sessions · Availability · Profile
SSE: availability_update + booking_update
Completeness bar: guests only (bio/photo/portfolio/contact)
sameSite: none on refresh cookie (cross-domain pages.dev ↔ railway.app)
Single-flight refreshAccessToken() — eliminates concurrent refresh race

## Booking Flow
bookings.html: 4-step wizard (Artist → Date → Details → Payment)
artist.html: date picker → modal → payment-intent → Stripe Payment Element
Both: redirect_status verified on return · date format YYYY-MM-DD always

## What's Next
- H-3: NOVO_LEAD raw enum in admin
- M-1: hero blank space
- M-2: artist cards inconsistent
- Tab fade transition
- Enrich booking card (time + type + stage pill)
- Tab counts
- Point appreciart.ie domain → Cloudflare Pages