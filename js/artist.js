  (function () {
    const INTERNAL = 'https://appreciart-internal-production-ee3c.up.railway.app';

    const slug = new URLSearchParams(window.location.search).get('slug');
    const root = document.getElementById('artist-root');

    if (!slug) {
      renderNotFound();
      return;
    }

    // Load artist data (includes profile_url + portfolio from backend) + availability in parallel
    Promise.all([
      fetchArtist(slug),
      fetchAvailability(slug),
    ]).then(([artist, availData]) => {
      if (!artist) { renderNotFound(); return; }
      renderArtist(artist, availData.availability, availData.date_images);
    }).catch(() => renderNotFound());

    async function fetchArtist(slug) {
      try {
        const res  = await fetch(`${INTERNAL}/api/public/artists/${slug}`, { signal: AbortSignal.timeout(12000) });
        if (!res.ok) return null;
        const data = await res.json();
        return data.artist || null;
      } catch { return null; }
    }

    async function fetchAvailability(slug) {
      try {
        const res  = await fetch(`${INTERNAL}/api/public/availability/${slug}`, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return { availability: [], date_images: [] };
        const data = await res.json();
        return { availability: data.availability || [], date_images: data.date_images || [] };
      } catch { return { availability: [], date_images: [] }; }
    }

    function renderArtist(artist, availability, dateImages) {
      // Update page title
      document.getElementById('page-title').textContent = `${artist.name} — Appreciart IE`;

      const portfolio     = artist.portfolio || [];
      const profileImgUrl = artist.profile_url || `images/resident-artists/${artist.slug}-profile.webp`;

      const styles = (artist.styles || []).map(s =>
        `<span class="artist-style-tag">${s}</span>`
      ).join('');

      const instaHandle = artist.instagram || '';
      const instaUrl    = instaHandle ? `https://instagram.com/${instaHandle.replace('@', '')}` : '#';

      const today       = new Date(); today.setHours(0,0,0,0);
      const dateImgMap  = new Map(dateImages.map(d => [d.day, d.url]));

      const bookedDays     = new Set(availability.filter(a => !a.is_available).map(a => new Date(a.date).getDate()));
      const availableSlots = availability;
      const byMonth = {};
      availableSlots.forEach(a => {
        const d     = new Date(a.date);
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
            const isBooked = bookedDays && bookedDays.has(day);
            const disabled = isPast || isBooked;
            const dateObj   = new Date(date);
            const dayLabel  = dateObj.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
            const ariaLabel = disabled
              ? `Unavailable — ${dayLabel}`
              : `Book session on ${dayLabel} with ${artist.name}`;
            return `<div class="avail-date-cell${disabled ? ' avail-disabled' : ''}" role="button" aria-label="${ariaLabel}"${disabled ? ' aria-disabled="true"' : ''} data-day="${day}" data-date="${date}" data-url="${url}" data-artist="${artist.slug}" data-artist-name="${artist.name}">
              ${url ? `<img src="${url}" alt="Day ${day}" loading="lazy" class="avail-date-img">` : `<span class="avail-day-fallback">${String(day).padStart(2,'0')}</span>`}
              <div class="avail-lock">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
            </div>`;
          }).join('');
          return `<p class="availability-month-label">${label}</p>
                  <div class="availability-dates-grid">${cells}</div>`;
        }).join('');

      const availHtml = availableSlots.length > 0
        ? `${monthBlocks}<p class="availability-hint">Tap a date to book your session.</p>`
        : `<p class="availability-empty">No dates currently available. Contact us on <a href="https://wa.me/353838882759" target="_blank" rel="noopener">WhatsApp</a> to enquire.</p>`;

      const portfolioHtml = portfolio.length > 0
        ? portfolio.map((img, idx) =>
            `<div class="portfolio-item" role="button" aria-label="View portfolio image ${idx + 1} by ${artist.name}" data-full="${img.urlFull}">
               <img src="${img.url}" alt="${artist.name} — portfolio" loading="lazy">
               <div class="portfolio-item-icon">
                 <svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                   <path d="M15 3h6m0 0v6m0-6-7 7M9 21H3m0 0v-6m0 6 7-7"/>
                 </svg>
               </div>
             </div>`
          ).join('')
        : `<p style="font-size:14px;font-weight:300;color:var(--sec-grey)">Portfolio coming soon.</p>`;

      root.innerHTML = `
        <div class="artist-hero reveal">
          <div class="artist-profile-card">
            <div class="artist-profile-img-wrap">
              <img
                class="artist-profile-img"
                src="${profileImgUrl || ''}"
                alt="${artist.name}"
                id="artistProfileImg"
              >
            </div>
            <div class="artist-profile-caption">
              <span class="artist-profile-caption-type">${artist.is_resident ? 'Resident Artist' : 'Guest Artist'}</span>
              <span class="artist-profile-caption-location">Ballsbridge · Dublin</span>
            </div>
          </div>

          <div class="artist-info">
            <h1 class="artist-name">${artist.name}</h1>
            <div class="artist-styles">${styles}</div>
            <p class="artist-bio">${artist.bio || ''}</p>
            ${instaHandle ? `
            <a class="artist-insta" href="${instaUrl}" target="_blank" rel="noopener" aria-label="${artist.name} Instagram">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="2" width="20" height="20" rx="5"/>
                <circle cx="12" cy="12" r="4"/>
                <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
              </svg>
              ${instaHandle}
            </a>` : ''}
            <div class="artist-availability-inline">
              <span class="artist-section-label" style="margin-top:32px;display:block">Available Dates</span>
              ${availHtml}
            </div>
          </div>
        </div>

        <div class="artist-divider"><hr></div>

        <div class="artist-portfolio">
          <div class="artist-section-header">
            <span class="artist-section-label">Portfolio</span>
            <span class="artist-section-count"></span>
          </div>
          <div class="portfolio-grid">${portfolioHtml}</div>
        </div>

        <div class="artist-cta">
          <span class="section-label">Ready?</span>
          <h2 class="section-title">Book with ${artist.name}</h2>
          <p class="section-body">Start the conversation — tell us what you have in mind.</p>
          <a href="bookings.html?artist=${encodeURIComponent(artist.slug)}" class="btn btn-primary">Book a Session</a>
        </div>
      `;

      // Date image error handlers
      document.querySelectorAll('.avail-date-img').forEach(img => {
        img.addEventListener('error', () => { img.style.display = 'none'; });
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
        lightboxImg.src = '';
      }
    }

    // ── BOOKING MODAL ──
    const STRIPE_PK  = 'pk_test_51LMExGFHUBlGAlIRvV0nWtnFAi6fcpJUHKxHixv0Xv9kv1GBqRkP5LYT0INKlTpOoNKGsIQGS0j9iYJNPvvsMPr00M7bEKiAD';
    let bmStripe     = null;
    let bmElements   = null;
    let bmSecret     = null;
    let bmBookingId  = null;
    let bmArtistSlug = null;
    let bmDay        = null;
    let bmYear       = null;
    let bmMonth      = null;

    function openBookingModal(day, artistSlug, artistName, dateStr) {
      const d      = dateStr ? new Date(dateStr) : new Date();
      bmDay        = day;
      bmArtistSlug = artistSlug;
      bmYear       = d.getFullYear();
      bmMonth      = d.getMonth();
      const monthName = d.toLocaleString('en-IE', { month: 'long' });

      document.getElementById('bmTitle').textContent    = `Book with ${artistName}`;
      document.getElementById('bmSubtitle').textContent = `${day} ${monthName} ${bmYear}`;
      document.getElementById('bmOverlay').classList.add('open');
      document.body.style.overflow = 'hidden';

      // Reset modal state
      document.getElementById('bmFormBody').style.display = 'block';
      document.getElementById('bmSuccess').classList.remove('visible');
      document.getElementById('bmDivider').classList.add('bm-hidden');
      document.getElementById('bmPaymentSection').classList.add('bm-hidden');
      document.getElementById('bmProceedBtn').classList.remove('bm-hidden');
      document.getElementById('bmProceedBtn').disabled = false;
      document.getElementById('bmProceedBtn').textContent = 'Continue to Payment';
      document.getElementById('bmPayErr').classList.remove('visible');
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
      if (e.key === 'Escape' && document.getElementById('bmOverlay').classList.contains('open')) closeBookingModal();
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
      btn.disabled = true;
      btn.textContent = 'Setting up payment...';

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

        if (!bmStripe) bmStripe = Stripe(STRIPE_PK);
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

        const payEl = bmElements.create('payment', {
          layout: { type: 'accordion', defaultCollapsed: false, radios: true },
          paymentMethodOrder: ['apple_pay', 'google_pay', 'klarna', 'card'],
        });

        payEl.mount('#bm-payment-element');
        payEl.on('ready', () => { document.getElementById('bmPayBtn').disabled = false; });

        document.getElementById('bmDivider').classList.remove('bm-hidden');
        document.getElementById('bmPaymentSection').classList.remove('bm-hidden');
        btn.classList.add('bm-hidden');

      } catch (err) {
        document.getElementById('bmPayErr').textContent = err.message || 'Something went wrong. Please try again.';
        document.getElementById('bmPayErr').classList.add('visible');
        btn.disabled = false;
        btn.textContent = 'Continue to Payment';
      }
    });

    document.getElementById('bmPayBtn').addEventListener('click', async () => {
      const btn = document.getElementById('bmPayBtn');
      btn.disabled = true;
      btn.textContent = 'Processing...';
      document.getElementById('bmPayErr').classList.remove('visible');

      const { error } = await bmStripe.confirmPayment({
        elements: bmElements,
        confirmParams: { return_url: `${window.location.href.split('?')[0]}?slug=${encodeURIComponent(bmArtistSlug)}&paid=1` },
        redirect: 'if_required',
      });

      if (error) {
        document.getElementById('bmPayErr').textContent = error.message;
        document.getElementById('bmPayErr').classList.add('visible');
        btn.disabled = false;
        btn.textContent = 'Confirm & Pay';
        return;
      }

      document.getElementById('bmFormBody').style.display = 'none';
      document.getElementById('bmSuccess').classList.add('visible');
    });

    // Handle return from Stripe redirect (3DS / Klarna)
    if (new URLSearchParams(window.location.search).get('paid') === '1') {
      Promise.all([fetchArtist(slug), fetchAvailability(slug)])
        .then(([artist, availData]) => {
          if (artist) renderArtist(artist, availData.availability, availData.date_images);
          document.getElementById('bmFormBody').style.display = 'none';
          document.getElementById('bmSuccess').classList.add('visible');
          document.getElementById('bmOverlay').classList.add('open');
        });
    }

    function renderNotFound() {
      root.innerHTML = `
        <div class="artist-not-found">
          <h1>Artist Not Found</h1>
          <p>This artist doesn't exist or is no longer active.</p>
          <a href="/#artists" class="btn btn-primary" style="margin-top:16px">Back to Artists</a>
        </div>
      `;
    }

  })();
