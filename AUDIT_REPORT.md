# Appreciart IE — Website Audit & Improvement Report
**Date:** 12 June 2026
**Scope:** the public website and artist dashboard frontend (this repository only — no backend changes).

This report is written for a non-technical reader. Each item says what was found, why it matters, and what was done about it.

---

## 1. The most important finding — needs YOUR action

### ⚠️ The site is using a Stripe TEST key (cannot be fixed in this repo alone)
- **Where:** `js/bookings.js:5` and `js/artist.js:230`
- **What it means:** the payment key embedded in the site starts with `pk_test_`. Stripe keys come in two flavours: *test* (no real money ever moves) and *live*. If the backend is also running in test mode, **no customer has ever actually been charged a real deposit** — test card numbers work, real cards may be accepted but not charged real money.
- **Why I didn't change it:** I don't have access to your live Stripe key, and the frontend key must match the mode the backend uses. Changing only one side would break payments entirely.
- **What to do:** confirm with whoever manages the Stripe account / backend whether this is intentional. If the site is meant to take real deposits, both the backend secret key and this frontend publishable key need to be switched to live-mode keys together.

---

## 2. Payment flow fixes (commit `f0587d1`)

### Fixed: a failed payment could show "Booking Confirmed" ❌→✅
- **Where:** `js/bookings.js` (was lines 411–414) and `js/artist.js` (was lines 387–395).
- **Found:** when a customer pays with Klarna or a card requiring bank verification (3D Secure), Stripe sends them away and back. The site showed the green "Booking Confirmed" screen on return **even when the payment failed or was abandoned**. A customer whose bank declined the charge would believe their slot was secured and turn up unpaid.
- **Fixed:** the site now checks the payment status Stripe attaches to the return link. Success/processing → confirmation screen. Failure → a clear "Payment was not completed — no money was taken" message, and the customer can try again. Applied identically in both booking flows (booking page and artist-profile modal).

### Fixed: a dropped connection could freeze the payment button forever
- **Where:** `js/bookings.js:382`, `js/artist.js:368`.
- **Found:** if the internet connection dropped at the exact moment of pressing "Confirm & Pay", the button stayed stuck on "Processing…" with no way to retry.
- **Fixed:** the failure is now caught; the customer sees "Connection problem — your payment was not completed" and the button is re-enabled.

### Fixed: "Change Details" could create duplicate bookings
- **Where:** `js/bookings.js` (was lines 357–361).
- **Found:** after the payment box appeared, clicking the button again stacked a brand-new payment form on top of the old one, creating a second pending booking behind the scenes.
- **Fixed:** the old payment form is now properly removed before a new one is created.

### Fixed: unhelpful error messages on the booking page
- **Where:** `js/bookings.js` (was line 316).
- **Found:** when the server explained a problem (e.g. "this date was just booked"), the booking page threw the explanation away and showed a generic message. The artist-profile modal already did this correctly — the two flows were inconsistent.
- **Fixed:** the real reason is now shown, matching both flows.

### Fixed: a server error while loading dates could be misread as "no dates"
- **Where:** `js/bookings.js` (was line 165) — the response is now checked before being used, per the project's own coding rules.

### What happens if a customer closes the tab mid-payment? (audited, acceptable)
A pending booking record is created on the server the moment they proceed to payment, but nothing on *this* site stores misleading state — returning to the page starts fresh, and the previously selected date stays available until actually paid. Clean-up of abandoned pending bookings is a backend concern, noted for the backend repo.

---

## 3. New feature: pre-payment confirmation (commit `58d31ae`)

Before the card form appears, customers in **both** booking flows now see a confirmation dialog:

> **Before you continue**
> Your €{amount} deposit secures this slot and is fully refundable if cancelled at least 48 hours before your appointment.
> [Cancel] [Continue to Payment]

- The € amount comes from the server's response (not hard-coded), so if the deposit changes, the dialog stays correct.
- "Cancel" returns to the form with nothing lost; "Continue to Payment" opens the card form.
- Built by reusing the booking modal's existing look (the modal styling was moved from `css/artist.css` into the shared `css/main.css` so both pages use one identical set of styles — `css/main.css:1211+`). The dialog logic lives in one shared function (`js/utils.js`), so the two flows cannot drift apart.
- Keyboard accessible: Escape or clicking the dark backdrop = Cancel.

---

## 4. Consent form fix (commit `ddf045d`)

- **Found:** the consent form already asks customers to tick "I have eaten within the last 4 hours" and "I have not consumed alcohol in the last 24 hours", and refuses submission without them — but the answers were **never sent to the server**. The database columns for them have been empty since launch.
- **Fixed:** one small addition to `js/consent.js` (line ~126) now sends `confirm_not_fasting` and `confirm_no_alcohol` with every submission. No visual change for customers.

---

## 5. Security fixes (commit `3374f26`)

- **Cross-site scripting gap closed** (`js/artist.js`, was line 84): one place injected an image address from the server into the page without the protective escaping used everywhere else. It's now escaped, and image addresses from the server are additionally checked to be genuine `https://` links before use (`js/artist.js`, `js/bookings.js`, `js/index.js`).
- **Inline event handlers removed** (`js/index.js` was line 50; `about.html` was line 34): the project's security rules forbid inline JavaScript in HTML attributes; two leftovers were converted to the proper pattern (a new shared `data-hide-on-error` handler in `js/main.js`).
- **Verified clean:** no secrets or private keys in the code (the Stripe key is *meant* to be public — the issue in section 1 is its test/live mode, not its visibility); all external links already had `rel="noopener noreferrer"`; the gallery checkout already validates it only redirects to `checkout.stripe.com`; all forms validate before submitting.

---

## 6. SEO & accessibility (commit `4387810`)

These directly help the studio appear in Dublin local search results:

- **Structured business data added** to the homepage (`index.html`): Google now receives the studio's official type ("TattooParlor"), address (120 Baggot Lane, Ballsbridge, D04 WK59), and social profiles in the machine-readable format it uses for Maps and local results.
- **`robots.txt` and `sitemap.xml` created** — the standard files search engines look for. The sitemap lists all 11 public pages.
- **Login and dashboard pages** are now marked "do not index" so internal pages never appear in Google.
- **Artist profile pages** now get a proper per-artist description in search results instead of the generic "Artist profile" text (`js/artist.js`).
- **Canonical link** added to the homepage pointing at `https://appreciart.ie`.
- Verified already good: every image has alt text, every public page has exactly one main heading and a meta description.

> Note: the sitemap and structured data use `https://appreciart.ie` addresses, consistent with the existing social-sharing tags. They'll take full effect once the domain is pointed at Cloudflare Pages (already on the roadmap).

---

## 7. Code health (commit `45a9ed5`)

- `artist.html` loaded two script files **twice** (the entire toast system ran two times on every artist page) — duplicates removed.
- Dead, unreachable code removed from `js/artist.js` (a leftover duplicate check).
- A display bug fixed where an artist with "&" in their name would show as "&amp;amp;" in the booking modal title (`js/artist.js`, commit `f0587d1`).

---

## 8. Verification

There is no automated test suite in this repo, so after **every** commit:
- `node --check` was run on every changed JavaScript file — **all passed, every time** (and a final pass over all 15 JS files passed).
- The homepage's new structured data block was validated as correct JSON.

| Commit | Contents | Check |
|--------|----------|-------|
| `f0587d1` | Payment flow hardening | ✅ syntax pass |
| `58d31ae` | Pre-payment confirmation modal | ✅ syntax pass |
| `ddf045d` | Consent form fields | ✅ syntax pass |
| `3374f26` | Security fixes | ✅ syntax pass |
| `4387810` | SEO improvements | ✅ syntax pass + JSON-LD validated |
| `45a9ed5` | Code health | ✅ all 15 JS files pass |

**Recommended before relying on it:** one manual end-to-end test of each booking flow with Stripe's test card (4242 4242 4242 4242) and one with the 3D-Secure-failure test card, to see the new confirmation dialog and the new failed-payment message in action.

---

## 9. Considered but deliberately NOT changed

- **Stripe test key** — see section 1; requires the live key and a coordinated backend switch.
- **Honeypot anti-spam fields on the two booking forms** (`bookings.html:92`, `artist.html:52`): they exist in the page but are never sent to the server. The consent and guest-application forms do this correctly. Not changed because the booking endpoint's accepted fields are unknown — sending an unexpected field could be rejected by backend validation. *Backend follow-up: accept and check `_honeypot` on `/api/public/bookings/payment-intent`, then send it from both forms.*
- **The duplicated Stripe appearance/styling configuration** in the two booking files: merging it would touch working payment code for purely cosmetic benefit — not worth the risk in production.
- **Per-artist profile photo fetches** (the homepage and booking page make one extra request per artist): works fine at current scale; a backend change to include `profile_url` in the artist list response would be the proper fix.
- **Design/branding**: untouched throughout, per instructions (fonts, palette, square corners, layout all preserved).
- **Canonical links on every page**: only added to the homepage; adding them everywhere is trivial but best done after the domain actually points at Cloudflare Pages.

## 10. Remaining known issues (not fixed)

1. **Stripe test key** (section 1) — the single highest-priority item.
2. Pending bookings created when a customer abandons payment are a backend clean-up concern.
3. Booking-form honeypots are inert (see section 9) — backend change needed first.
4. `admin.html` is still on the roadmap (unchanged, per the project plan).
