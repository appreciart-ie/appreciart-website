  (function () {
    const INTERNAL = 'https://api.appreciart.ie';

    const slug = new URLSearchParams(window.location.search).get('slug');
    const root = document.getElementById('artist-root');
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
      if (root) root.innerHTML = '<p class="artist-not-found">Artist not found.</p>';
      return;
    }

    // Logged-in artists don't use the public booking flow — bookings and
    // walk-ins are handled in the dashboard. Hide all booking actions for them.
    const artToken = localStorage.getItem('art_token');
    const loggedInArtistData = artToken ? (() => { try { return JSON.parse(localStorage.getItem('art_artist')); } catch { return null; } })() : null;

    // Load artist data (includes profile_url + portfolio from backend) + availability in parallel.
    // Single load per page — the Stripe return handler reuses this promise instead of re-rendering.
    const initialLoad = Promise.all([
      fetchArtist(slug),
      fetchAvailability(slug),
    ]).then(([artistRes, availData]) => {
      if (artistRes.artist) {
        renderArtist(artistRes.artist, availData.availability, availData.date_images);
        return true;
      }
      if (artistRes.error) renderLoadError(); else renderNotFound();
      return false;
    }).catch(() => { renderLoadError(); return false; });

    async function fetchArtist(slug) {
      try {
        const res  = await fetch(`${INTERNAL}/api/public/artists/${slug}`, { signal: AbortSignal.timeout(12000) });
        if (res.status === 404) return { notFound: true };
        if (!res.ok) return { error: true };
        const data = await res.json();
        return data.artist ? { artist: data.artist } : { notFound: true };
      } catch { return { error: true }; }
    }

    async function fetchAvailability(slug) {
      try {
        const res  = await fetch(`${INTERNAL}/api/public/availability/${slug}`, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return { availability: [], date_images: [] };
        const data = await res.json();
        return { availability: data.availability || [], date_images: data.date_images || [] };
      } catch { return { availability: [], date_images: [] }; }
    }

    // Parse "YYYY-MM-DD" (or an ISO string) as *local* midnight — new Date(str)
    // treats it as UTC, so local getters slip a day in negative-offset zones.
    function parseYMD(s) {
      const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
      return new Date(y, m - 1, d);
    }

    function renderArtist(artist, availability, dateImages) {
      const isOwnPage = loggedInArtistData && loggedInArtistData.slug === artist.slug;
      // Only suppress booking actions on RESIDENT pages (hides the public Stripe
      // flow from logged-in artists). A guest's contact CTA has no conflicting
      // flow, so it always renders regardless of any artist token.
      const loggedInArtist = !!artToken && !isOwnPage && artist.role !== 'guest';
      // Update page title + meta description
      document.getElementById('page-title').textContent = `${artist.name} — Appreciart IE`;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute('content', `${artist.name} — tattoo artist at Appreciart IE, Ballsbridge, Dublin. View portfolio and book a session.`);

      const portfolio     = artist.portfolio || [];
      const profileImgUrl = isSafeUrl(artist.profile_url) ? artist.profile_url : `images/resident-artists/${artist.slug}-profile.webp`;

      const styles = (artist.styles || []).map(s =>
        `<span class="artist-style-tag">${esc(s)}</span>`
      ).join('');

      // Guest contact buttons — same https-only guard as profile_url
      // WhatsApp glyph reused from contact-us.html (.contact-channel-icon)
      const waIcon = `<svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;
      const waUrl   = isSafeUrl(artist.whatsapp_url) ? artist.whatsapp_url : '';
      const bookUrl = isSafeUrl(artist.booking_url)  ? artist.booking_url  : '';
      const guestContactBtns = (waUrl || bookUrl)
        ? `${waUrl ? `<a href="${esc(waUrl)}" class="btn btn-primary" target="_blank" rel="noopener noreferrer">${waIcon}WhatsApp</a>` : ''}
           ${bookUrl ? `<a href="${esc(bookUrl)}" class="btn btn-secondary" target="_blank" rel="noopener noreferrer">Book directly</a>` : ''}`
        : `<a href="https://wa.me/353838882759" class="btn btn-primary" target="_blank" rel="noopener noreferrer">${waIcon}WhatsApp the Studio</a>`;

      // Guest visit period — same formatting as homepage guest cards (js/index.js)
      const guestStart = artist.guest_start_date
        ? new Date(artist.guest_start_date).toLocaleDateString('en-IE', { day: '2-digit', month: 'short' })
        : '';
      const guestEnd = artist.guest_end_date
        ? new Date(artist.guest_end_date).toLocaleDateString('en-IE', { day: '2-digit', month: 'short' })
        : '';
      const guestDateRange = guestStart && guestEnd ? `${guestStart} – ${guestEnd}` : '';

      // Editorial guest visit block — month sits above the day numerals.
      // Same-month visits (the common case) show the month once; visits that
      // span two months show each month above its own date. No year.
      const gStartD = artist.guest_start_date ? new Date(artist.guest_start_date) : null;
      const gEndD   = artist.guest_end_date   ? new Date(artist.guest_end_date)   : null;
      const gDay      = d => String(d.getDate()).padStart(2, '0');
      const gMonShort = d => d.toLocaleDateString('en-IE', { month: 'short' }).toUpperCase();
      const gMonLong  = d => d.toLocaleDateString('en-IE', { month: 'long'  }).toUpperCase();
      const gSameMonth = gStartD && gEndD
        && gStartD.getFullYear() === gEndD.getFullYear()
        && gStartD.getMonth() === gEndD.getMonth();

      // Badge: remaining open spots, below the dates. Shown in every phase —
      // before the visit and during it — since scarcity is the booking signal.
      // "Spot" = a date the guest opened that's today-or-later and not booked.
      let badgeHtml = '';
      if (gStartD && gEndD) {
        const now = new Date(); now.setHours(0,0,0,0);
        const calendarIcon = '<svg class="guest-visit-badge-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="0"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
        const openFuture = availability.filter(a => parseYMD(a.date) >= now);
        if (openFuture.length > 0) {
          const spotsLeft = openFuture.filter(a => !a.booked).length;
          const urgent = spotsLeft > 0 && spotsLeft <= 3;
          const badgeClass = `guest-visit-badge-subtle${urgent ? ' guest-visit-badge-subtle--urgent' : ''}`;
          if (spotsLeft > 0) {
            badgeHtml = `<div class="${badgeClass}">${calendarIcon}<span>${urgent ? 'Only ' : ''}${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left</span></div>`;
          } else {
            badgeHtml = `<div class="guest-visit-badge-subtle">${calendarIcon}<span>Fully booked</span></div>`;
          }
        }
      }

      const guestVisitHtml = !(gStartD && gEndD)
        ? ''
        : gSameMonth
        ? `<div class="guest-visit">
             <span class="guest-visit-label">AT THE STUDIO</span>
             <span class="guest-visit-mon guest-visit-mon--lead">${esc(gMonLong(gStartD))}</span>
             <div class="guest-visit-range guest-visit-range--single">
               <span class="guest-visit-day">${esc(gDay(gStartD))}</span>
               <span class="guest-visit-sep" aria-hidden="true"></span>
               <span class="guest-visit-day">${esc(gDay(gEndD))}</span>
             </div>
             ${badgeHtml}
           </div>`
        : `<div class="guest-visit">
             <span class="guest-visit-label">AT THE STUDIO</span>
             <div class="guest-visit-range guest-visit-range--split">
               <span class="guest-visit-mon gv-fmon">${esc(gMonShort(gStartD))}</span>
               <span class="guest-visit-day gv-fday">${esc(gDay(gStartD))}</span>
               <span class="guest-visit-sep gv-sep" aria-hidden="true"></span>
               <span class="guest-visit-mon gv-tmon">${esc(gMonShort(gEndD))}</span>
               <span class="guest-visit-day gv-tday">${esc(gDay(gEndD))}</span>
             </div>
             ${badgeHtml}
           </div>`;

      const instaHandle = artist.instagram || '';
      const instaUrl    = instaHandle ? `https://instagram.com/${encodeURIComponent(instaHandle.replace('@', ''))}` : '#';

      const today       = new Date(); today.setHours(0,0,0,0);
      const dateImgMap  = new Map(dateImages.filter(d => isSafeUrl(d.url)).map(d => [d.day, d.url]));

      const bookedDays     = new Set(availability.filter(a => a.booked).map(a => a.date.slice(0, 10)));
      const availableSlots = availability;
      const byMonth = {};
      availableSlots.forEach(a => {
        const d     = parseYMD(a.date);
        const key   = `${d.getFullYear()}-${d.getMonth()}`;
        const label = d.toLocaleString('en-IE', { month: 'long', year: 'numeric' });
        if (!byMonth[key]) byMonth[key] = { label, year: d.getFullYear(), month: d.getMonth(), slots: [] };
        byMonth[key].slots.push({ day: d.getDate(), date: a.date, isPast: d < today });
      });

      const monthBlocks = Object.values(byMonth)
        .sort((a,b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
        .map(({ label, year, month, slots }) => {
          const cells = slots.sort((a,b) => a.day - b.day).map(({ day, date, isPast }) => {
            const url = dateImgMap.get(day) || '';
            const isBooked = bookedDays && bookedDays.has(date.slice(0, 10));
            const disabled = isPast || isBooked;
            const dateObj   = parseYMD(date);
            const dayLabel  = dateObj.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
            const ariaLabel = disabled
              ? `Unavailable — ${dayLabel}`
              : `Book session on ${dayLabel} with ${esc(artist.name)}`;
            return `<div class="avail-date-cell${disabled ? ' avail-disabled' : ''}" role="button" aria-label="${esc(ariaLabel)}"${disabled ? ' aria-disabled="true"' : ''} data-day="${day}" data-date="${esc(date)}" data-url="${esc(url)}" data-artist="${esc(artist.slug)}" data-artist-name="${esc(artist.name)}">
              ${url ? `<img src="${esc(url)}" alt="Day ${day}" loading="lazy" class="avail-date-img">` : `<span class="avail-day-fallback">${String(day).padStart(2,'0')}</span>`}
              <div class="avail-lock">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
            </div>`;
          }).join('');
          return `<p class="availability-month-label">${label}</p>
                  <div class="availability-dates-grid">${cells}</div>`;
        }).join('');

      const availHtml = loggedInArtist
        ? `<p class="availability-empty">You're signed in as an artist. Manage sessions from your <a href="dashboard.html">Dashboard</a>.</p>`
        : artist.role === 'guest'
        ? `${guestVisitHtml || (guestDateRange ? `<p class="artist-guest-dates">At the studio ${esc(guestDateRange)}</p>` : '')}
           <p class="availability-empty">Bookings are handled directly with this artist.</p>
           <div class="cta-row artist-contact-row">${guestContactBtns}</div>`
        : availableSlots.length > 0
        ? `${monthBlocks}<p class="availability-hint">Tap a date to book your session.</p>`
        : `<p class="availability-empty">No dates currently available. Contact us on <a href="https://wa.me/353838882759" target="_blank" rel="noopener noreferrer">WhatsApp</a> to enquire.</p>`;

      const portfolioHtml = portfolio.length > 0
        ? portfolio.map((img, idx) =>
            `<div class="portfolio-item" role="button" aria-label="View portfolio image ${idx + 1} by ${esc(artist.name)}" data-full="${esc(img.urlFull)}">
               <img src="${esc(img.url)}" alt="${esc(artist.name)} — portfolio" loading="lazy" data-hide-on-error>
               <div class="portfolio-item-icon">
                 <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                   <path d="M15 3h6m0 0v6m0-6-7 7M9 21H3m0 0v-6m0 6 7-7"/>
                 </svg>
               </div>
             </div>`
          ).join('')
        : `<p class="portfolio-coming-soon">Portfolio coming soon.</p>`;

      root.innerHTML = `
        <div class="artist-hero reveal">
          <div class="artist-profile-card">
            <div class="artist-profile-img-wrap">
              <img
                class="artist-profile-img"
                src="${esc(profileImgUrl || '')}"
                alt="${esc(artist.name)}"
                id="artistProfileImg"
              >
            </div>
            <div class="artist-profile-caption">
              <span class="artist-profile-caption-type">${artist.is_resident ? 'Resident Artist' : 'Guest Artist'}</span>
              <a class="artist-profile-caption-location" href="https://maps.google.com/maps/search/Ballsbridge+Dublin" target="_blank" rel="noopener noreferrer" aria-label="View studio location on Google Maps">
                <svg class="artist-location-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>${artist.is_resident ? '' : 'At '}Ballsbridge · Dublin</span>
              </a>
              ${(!artist.is_resident && artist.country) ? `
              <span class="artist-profile-caption-from">
                <svg class="artist-location-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"/></svg>
                <span>From ${esc(artist.country)}</span>
              </span>` : ''}
            </div>
          </div>

          <div class="artist-info">
            <h1 class="artist-name">${esc(artist.name)}</h1>
            <div class="artist-styles">${styles}</div>
            <p class="artist-bio">${esc(artist.bio || '')}</p>
            ${instaHandle ? `
            <a class="artist-insta" href="${esc(instaUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(artist.name)} Instagram">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="2" width="20" height="20" rx="5"/>
                <circle cx="12" cy="12" r="4"/>
                <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
              </svg>
              ${esc(instaHandle)}
            </a>` : ''}
            <div class="artist-availability-inline" id="artist-availability">
              ${availHtml}
            </div>
          </div>
        </div>

        <div class="artist-divider"><hr></div>

        <div class="artist-portfolio">
          <div class="artist-section-header">
            <span class="artist-section-label">Portfolio</span>
            <span class="artist-section-count">${portfolio.length ? `${portfolio.length} ${portfolio.length === 1 ? 'piece' : 'pieces'}` : ''}</span>
          </div>
          <div class="portfolio-grid">${portfolioHtml}</div>
        </div>

        <div class="artist-cta">
          ${loggedInArtist
  ? `<span class="section-label">Artist account</span>
     <h2 class="section-title">You're signed in</h2>
     <p class="section-body">Bookings and walk-ins are managed from your dashboard, not the public booking flow.</p>
     <a href="dashboard.html" class="btn btn-primary">Go to Dashboard</a>`
  : `<span class="section-label">Ready?</span>
     <h2 class="section-title">Book with ${esc(artist.name)}</h2>
     <p class="section-body">Start the conversation — tell us what you have in mind.</p>
     ${artist.role === 'guest'
  ? `<div class="cta-row">${guestContactBtns}</div>`
  : `<a href="bookings.html?artist=${encodeURIComponent(artist.slug)}" class="btn btn-primary" data-scroll-to="artist-availability">Book a Session</a>`
}`
}
        </div>
      `;

      // Date image error handlers
      document.querySelectorAll('.avail-date-img').forEach(img => {
        img.addEventListener('error', () => { img.style.display = 'none'; });
      });

      // Portfolio image error handlers — mirror main.js's data-hide-on-error.
      // These images are injected after main.js already ran, so attach here.
      document.querySelectorAll('.portfolio-item img[data-hide-on-error]').forEach(img => {
        img.addEventListener('error', () => { img.style.display = 'none'; }, { once: true });
      });

      // "Book a Session" CTA → smooth-scroll to the availability section.
      // Fallback: if the section isn't on the page, let the href navigate.
      document.querySelectorAll('[data-scroll-to]').forEach(link => {
        link.addEventListener('click', e => {
          const target = document.getElementById(link.dataset.scrollTo);
          if (!target) return;
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });

      // Profile image error handler
      const profileImg = document.getElementById('artistProfileImg');
      if (profileImg) {
        profileImg.addEventListener('error', () => {
          profileImg.style.display = 'none';
          if (profileImg.parentElement) profileImg.parentElement.style.background = 'var(--off-white)';
        });
      }

      // Reveal animation
      document.querySelectorAll('.reveal').forEach(el => {
        const obs = new IntersectionObserver(entries => {
          entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } });
        }, { threshold: 0.1 });
        obs.observe(el);
      });

      // Date cells → open booking modal
      document.querySelectorAll('.avail-date-cell:not(.avail-disabled)').forEach(cell => {
        cell.addEventListener('click', () => {
          openBookingModal(
            parseInt(cell.dataset.day, 10),
            cell.dataset.artist,
            cell.dataset.artistName,
            cell.dataset.date,
          );
        });
      });

      // Lightbox
      const lightbox     = document.getElementById('lightbox');
      const lightboxImg  = document.getElementById('lightbox-img');
      const lightboxClose = document.getElementById('lightbox-close');

      document.querySelectorAll('.portfolio-item').forEach(item => {
        item.addEventListener('click', () => {
          lightboxImg.src = item.dataset.full;
          lightboxImg.alt = item.querySelector('img')?.alt || '';
          lightbox.classList.add('open');
          document.body.style.overflow = 'hidden';
        });
      });

      lightboxClose.addEventListener('click', closeLightbox);
      lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

      function closeLightbox() {
        lightbox.classList.remove('open');
        document.body.style.overflow = '';
        lightboxImg.removeAttribute('src');
      }
    }

    // ── BOOKING MODAL ──
    let stripePublishableKey = null;
    let bmStripe     = null;
    let bmElements   = null;
    let bmSecret     = null;
    let bmBookingId  = null;
    let bmArtistSlug = null;
    let bmDay        = null;
    let bmYear       = null;
    let bmMonth      = null;
    let payEl        = null;

    // Fetch Stripe public key from config. Awaited before any payment-intent
    // request so a missing key can never leave an orphan booking behind.
    const configReady = (async () => {
      try {
        const res = await fetch(`${INTERNAL}/api/public/config`, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error(`Config endpoint returned ${res.status}`);
        const data = await res.json();
        stripePublishableKey = data.stripePublishableKey || null;
      } catch (err) {
        console.error('[artist] Failed to fetch config:', err.message);
        stripePublishableKey = null;
      }
    })();

    function openBookingModal(day, artistSlug, artistName, dateStr) {
      const d      = dateStr ? parseYMD(dateStr) : new Date();
      bmDay        = day;
      bmArtistSlug = artistSlug;
      bmYear       = d.getFullYear();
      bmMonth      = d.getMonth();
      const monthName = d.toLocaleString('en-IE', { month: 'long' });

      document.getElementById('bmTitle').textContent    = `Book with ${artistName}`;
      document.getElementById('bmSubtitle').textContent = `${day} ${monthName} ${bmYear}`;
      document.getElementById('bmOverlay').classList.add('open');
      document.body.style.overflow = 'hidden';

      // Tear down any Payment Element from a previous date before reopening —
      // remounting into a live container leaves a stale element bound to the
      // old clientSecret.
      if (payEl) {
        try { payEl.destroy(); } catch (err) { console.error('[artist] Payment Element destroy failed:', err.message); }
        payEl = null;
      }

      // Reset modal state
      document.getElementById('bmFormBody').style.display = 'block';
      document.getElementById('bmSuccess').classList.remove('visible');
      document.getElementById('bmDivider').classList.add('bm-hidden');
      document.getElementById('bmPaymentSection').classList.add('bm-hidden');
      document.getElementById('bmProceedBtn').classList.remove('bm-hidden');
      document.getElementById('bmProceedBtn').disabled = false;
      document.getElementById('bmProceedBtn').textContent = 'Continue to Payment';
      document.getElementById('bmPayErr').classList.remove('visible');
      document.getElementById('bmSetupErr').classList.remove('visible');
      document.getElementById('bmPayBtn').disabled = true;
      document.getElementById('bmPayBtn').textContent = 'Confirm & Pay';
      bmSecret = null; bmElements = null; bmBookingId = null;
    }

    function closeBookingModal() {
      document.getElementById('bmOverlay').classList.remove('open');
      document.body.style.overflow = '';
    }

    document.getElementById('bmClose').addEventListener('click', closeBookingModal);
    document.getElementById('bmOverlay').addEventListener('click', e => {
      if (e.target === document.getElementById('bmOverlay')) closeBookingModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (document.getElementById('confirmDepositOverlay')?.classList.contains('open')) return;
      if (document.getElementById('bmOverlay').classList.contains('open')) closeBookingModal();
    });

    document.getElementById('bmProceedBtn').addEventListener('click', async () => {
      const name  = document.getElementById('bmName').value.trim();
      const phone = document.getElementById('bmPhone').value.trim();
      const email = document.getElementById('bmEmail').value.trim();
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      let ok = true;

      document.getElementById('bmNameErr').classList.toggle('visible', !name);
      document.getElementById('bmPhoneErr').classList.toggle('visible', !phone);
      document.getElementById('bmEmailErr').classList.toggle('visible', !email || !emailRe.test(email));
      if (!name || !phone || !email || !emailRe.test(email)) return;

      const btn = document.getElementById('bmProceedBtn');
      // Setup errors render outside #bmPaymentSection, which is still hidden here
      const errEl = document.getElementById('bmSetupErr');
      errEl.classList.remove('visible');
      btn.disabled = true;
      btn.textContent = 'Setting up payment...';

      // Stripe must be ready BEFORE the booking is created — otherwise a
      // missing/failed config leaves a paid-for-nothing booking on the backend.
      await configReady;
      if (!bmStripe && stripePublishableKey) {
        try { bmStripe = Stripe(stripePublishableKey); }
        catch (err) { console.error('[artist] Stripe init failed:', err.message); }
      }
      if (!bmStripe) {
        const msg = 'Payments are temporarily unavailable. Please refresh and try again, or contact us on WhatsApp.';
        toast(msg, 'error');
        errEl.textContent = msg;
        errEl.classList.add('visible');
        btn.disabled = false;
        btn.textContent = 'Continue to Payment';
        return;
      }

      const dateStr = `${bmYear}-${String(bmMonth + 1).padStart(2,'0')}-${String(bmDay).padStart(2,'0')}`;

      try {
        const res = await fetch(`${INTERNAL}/api/public/bookings/payment-intent`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            artist_slug:  bmArtistSlug,
            client_name:  name,
            client_email: email,
            client_phone: phone,
            style:        document.getElementById('bmStyle').value.trim() || undefined,
            description:  document.getElementById('bmDesc').value.trim()  || undefined,
            placement:    document.getElementById('bmPlacement').value.trim() || undefined,
            size:         document.getElementById('bmSize').value || undefined,
            date:         dateStr,
          }),
          signal: AbortSignal.timeout(20000),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Payment setup failed');

        bmSecret    = data.client_secret;
        bmBookingId = data.booking_id;
        document.getElementById('bmDepositAmt').textContent = `€${data.deposit_amount}`;

        // Mandatory confirmation before the Payment Element is shown
        const confirmed = await showDepositConfirm(data.deposit_amount);
        if (!confirmed) {
          btn.disabled = false;
          btn.textContent = 'Continue to Payment';
          return;
        }

        bmElements = bmStripe.elements({
          clientSecret: bmSecret,
          appearance: {
            theme: 'flat',
            variables: {
              colorPrimary: '#000000',
              colorBackground: '#ffffff',
              colorText: '#000000',
              colorDanger: '#c0392b',
              fontFamily: 'Poppins, sans-serif',
              borderRadius: '0px',
            },
            rules: {
              '.Input': { border: '1px solid #e0e0e0', padding: '10px 12px' },
              '.Input:focus': { border: '1px solid #000000', boxShadow: 'none' },
              '.Label': { fontSize: '9px', fontWeight: '700', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#636363' },
            },
          },
        });

        payEl = bmElements.create('payment', {
          layout: { type: 'accordion', defaultCollapsed: false, radios: true },
          paymentMethodOrder: ['apple_pay', 'google_pay', 'klarna', 'card'],
        });

        payEl.mount('#bm-payment-element');
        payEl.on('ready', () => { document.getElementById('bmPayBtn').disabled = false; });

        document.getElementById('bmDivider').classList.remove('bm-hidden');
        document.getElementById('bmPaymentSection').classList.remove('bm-hidden');
        btn.classList.add('bm-hidden');

      } catch (err) {
        errEl.textContent = err.message || 'Something went wrong. Please try again.';
        errEl.classList.add('visible');
        btn.disabled = false;
        btn.textContent = 'Continue to Payment';
      }
    });

    document.getElementById('bmPayBtn').addEventListener('click', async () => {
      const btn = document.getElementById('bmPayBtn');
      btn.disabled = true;
      btn.textContent = 'Processing...';
      document.getElementById('bmPayErr').classList.remove('visible');

      let result;
      try {
        result = await bmStripe.confirmPayment({
          elements: bmElements,
          confirmParams: { return_url: `${window.location.href.split('?')[0]}?slug=${encodeURIComponent(bmArtistSlug)}&paid=1&booking_id=${encodeURIComponent(bmBookingId)}` },
          redirect: 'if_required',
        });
      } catch (err) {
        result = { error: { message: 'Connection problem — your payment was not completed. Please check your connection and try again.' } };
      }
      const { error } = result;

      if (error) {
        document.getElementById('bmPayErr').textContent = error.message;
        document.getElementById('bmPayErr').classList.add('visible');
        btn.disabled = false;
        btn.textContent = 'Confirm & Pay';
        return;
      }

      // Completed without a redirect (card / instant methods). 'processing'
      // means Stripe hasn't approved it yet — don't claim it's confirmed.
      const piStatus = result.paymentIntent && result.paymentIntent.status;
      showBmSuccess(piStatus === 'processing' ? 'processing' : 'confirmed');
    });

    // Success panel — two outcomes share it (same logic + copy as bookings.js):
    //   'confirmed'  → deposit received, black check icon (markup as authored)
    //   'processing' → async method (Klarna etc.) still pending: neutral icon, no claim of payment
    const bmSuccessEl = document.getElementById('bmSuccess');
    const bmSuccessMarkup = bmSuccessEl ? bmSuccessEl.innerHTML : '';

    function showBmSuccess(state) {
      if (state === 'processing') {
        const icon  = bmSuccessEl.querySelector('.bm-success-icon');
        const title = bmSuccessEl.querySelector('.bm-success-title');
        const body  = bmSuccessEl.querySelector('.bm-success-body');
        if (icon) {
          icon.classList.add('bm-success-icon--pending');
          icon.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
        }
        if (title) title.textContent = 'Payment Processing';
        if (body) {
          body.innerHTML = "Your payment hasn't been approved yet — some payment methods take a while. You'll get an email confirmation once it goes through, and we'll email you if it doesn't.<br><br>Nothing else is needed from you right now.";
        }
      } else {
        bmSuccessEl.innerHTML = bmSuccessMarkup;
      }
      document.getElementById('bmFormBody').style.display = 'none';
      bmSuccessEl.classList.add('visible');
    }

    // Handle return from Stripe redirect (3DS / Klarna)
    // A missing redirect_status is never treated as confirmation (a hand-typed
    // ?paid=1 must not produce a false positive) — it falls back to 'processing'
    // and is upgraded only if the backend says deposit_paid.
    async function isDepositPaid(id, pi) {
      if (!id || !pi) return false;
      try {
        const res = await fetch(
          `${INTERNAL}/api/public/bookings/${encodeURIComponent(id)}?payment_intent=${encodeURIComponent(pi)}`,
          { signal: AbortSignal.timeout(10000) }
        );
        if (!res.ok) return false;
        const data = await res.json();
        const booking = data.booking || data;
        return booking.deposit_paid === true;
      } catch {
        return false;
      }
    }

    const returnParams = new URLSearchParams(window.location.search);
    if (returnParams.get('paid') === '1') {
      const redirectStatus = returnParams.get('redirect_status');
      if (redirectStatus && redirectStatus !== 'succeeded' && redirectStatus !== 'processing') {
        toast('Payment was not completed — no money was taken. Please try again.', 'error');
        window.history.replaceState({}, '', `${window.location.pathname}?slug=${encodeURIComponent(slug)}`);
      } else {
        // Reuse the single initial load — no second fetch/render pass
        initialLoad.then(() => {
          showBmSuccess(redirectStatus === 'succeeded' ? 'confirmed' : 'processing');
          document.getElementById('bmOverlay').classList.add('open');
          if (redirectStatus !== 'succeeded') {
            isDepositPaid(returnParams.get('booking_id'), returnParams.get('payment_intent')).then((paid) => {
              if (paid) showBmSuccess('confirmed');
            });
          }
        });
      }
    }

    function renderLoadError() {
      root.innerHTML = `
        <div class="artist-not-found">
          <h1>Something went wrong</h1>
          <p>Couldn't load this profile right now — please check your connection and try again.</p>
          <a href="${esc(`artist.html?slug=${encodeURIComponent(slug)}`)}" class="btn btn-primary btn--mt">Try Again</a>
        </div>
      `;
    }

    function renderNotFound() {
      root.innerHTML = `
        <div class="artist-not-found">
          <h1>Artist Not Found</h1>
          <p>This artist doesn't exist or is no longer active.</p>
          <a href="/#artists" class="btn btn-primary btn--mt">Back to Artists</a>
        </div>
      `;
    }

  })();
