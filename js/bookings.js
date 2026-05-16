(function () {
    'use strict';

    const INTERNAL_API = 'https://appreciart-internal-production-ee3c.up.railway.app';
    const STRIPE_PK    = 'pk_test_51LMExGFHUBlGAlIRvV0nWtnFAi6fcpJUHKxHixv0Xv9kv1GBqRkP5LYT0INKlTpOoNKGsIQGS0j9iYJNPvvsMPr00M7bEKiAD'; // publishable key — safe in frontend

    // ── State ──
    let artists        = [];
    let selectedArtist = null;
    let selectedDay    = null;
    let selectedDate   = null;
    let currentYear    = new Date().getFullYear();
    let currentMonth   = new Date().getMonth();
    let stripe         = null;
    let elements       = null;
    let clientSecret   = null;
    let bookingId      = null;

    // ── DOM refs ──
    const artistSelector  = document.getElementById('artistSelector');
    const datesGrid       = document.getElementById('datesGrid');
    const selectedDateBar = document.getElementById('selectedDateBar');
    const selectedDateText= document.getElementById('selectedDateText');
    const clearDateBtn    = document.getElementById('clearDate');
    const proceedBtn      = document.getElementById('proceedBtn');
    const paymentSection  = document.getElementById('paymentSection');
    const submitBtn       = document.getElementById('submitBtn');
    const paymentError    = document.getElementById('paymentError');
    const depositAmountEl = document.getElementById('depositAmount');
    const bookingSuccess  = document.getElementById('bookingSuccess');
    const bookingLayout   = document.getElementById('bookingLayout');

    // ── Init ──
    async function init() {
      stripe = Stripe(STRIPE_PK);

      // Pre-select artist from URL param
      const params = new URLSearchParams(window.location.search);
      const artistParam = params.get('artist');

      await loadArtists(artistParam);

      // Pre-read URL date param if present
      const dateParamRaw = params.get('date');
      if (dateParamRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateParamRaw)) {
        const d = new Date(dateParamRaw);
        selectedDay   = d.getDate();
        selectedDate  = dateParamRaw;
        currentYear   = d.getFullYear();
        currentMonth  = d.getMonth();
      }
    }

    // ── Load artists ──
    async function loadArtists(preselect) {
      try {
        const res  = await fetch(`${INTERNAL_API}/api/public/artists`, { signal: AbortSignal.timeout(10000) });
        const data = await res.json();
        artists = (data.artists || []).filter(a => a.is_resident);
        renderArtistSelector(preselect);
      } catch (e) {
        artistSelector.innerHTML = '<p class="artists-load-error">Could not load artists. Please try again.</p>';
      }
    }

    function renderArtistSelector(preselect) {
      artistSelector.innerHTML = '';
      artists.forEach(artist => {
        const btn = document.createElement('button');
        btn.className = 'artist-btn';
        btn.dataset.slug = artist.slug;
        const profileSrc = artist.profile_url || `images/resident-artists/${artist.slug}-profile.webp`;
        btn.innerHTML = `
          <img src="${profileSrc}"
               onerror="this.src='images/resident-artists/${artist.slug}-profile.webp';this.onerror=null;"
               alt="${artist.name}">
          <span class="artist-btn-name">${artist.name}</span>
        `;
        btn.addEventListener('click', () => selectArtist(artist));
        artistSelector.appendChild(btn);

        // Fetch profile_url from individual endpoint
        fetch(`${INTERNAL_API}/api/public/artists/${artist.slug}`, { signal: AbortSignal.timeout(8000) })
          .then(r => r.json())
          .then(data => {
            const url = data.artist && data.artist.profile_url;
            if (url) {
              const img = btn.querySelector('img');
              if (img) img.src = url;
            }
          })
          .catch(() => {});

        if (preselect && artist.slug === preselect) {
          selectArtist(artist, btn);
        }
      });
    }

    function selectArtist(artist, btnEl) {
      selectedArtist = artist;
      selectedDay    = null;
      updateSelectedDateBar();
      checkProceedButton();

      document.querySelectorAll('.artist-btn').forEach(b => b.classList.remove('active'));
      const btn = btnEl || artistSelector.querySelector(`[data-slug="${artist.slug}"]`);
      if (btn) btn.classList.add('active');

      loadAvailability(artist.slug);
    }

    // ── Load availability + dates ──
    async function loadAvailability(slug) {
      datesGrid.innerHTML = '<div class="dates-loading">Loading dates...</div>';
      try {
        const res  = await fetch(
          `${INTERNAL_API}/api/public/availability/${slug}`,
          { signal: AbortSignal.timeout(10000) }
        );
        const data = await res.json();
        const dateImgMap     = new Map((data.date_images || []).map(d => [d.day, d.url]));
        const today          = new Date(); today.setHours(0,0,0,0);
        const allSlots       = (data.availability || []);
        const availableSlots = allSlots.filter(a => a.is_available);

        if (!availableSlots.length) {
          datesGrid.innerHTML = '<div class="dates-empty">No dates available. Contact us on <a href="https://wa.me/353838882759" target="_blank" rel="noopener">WhatsApp</a> to enquire.</div>';
          return;
        }

        // Group by month — includes booked slots for lock display
        const byMonth = {};
        allSlots.forEach(a => {
          const d   = new Date(a.date);
          const key = `${d.getFullYear()}-${d.getMonth()}`;
          const lbl = d.toLocaleString('en-IE', { month: 'long', year: 'numeric' });
          if (!byMonth[key]) byMonth[key] = { label: lbl, year: d.getFullYear(), month: d.getMonth(), slots: [] };
          byMonth[key].slots.push({ day: d.getDate(), date: a.date, isPast: d < today, isBooked: !a.is_available });
        });

        datesGrid.innerHTML = '';
        Object.values(byMonth)
          .sort((a,b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
          .forEach(({ label, slots }) => {
            const monthEl = document.createElement('p');
            monthEl.className = 'dates-month-label';
            monthEl.textContent = label;
            datesGrid.appendChild(monthEl);

            const grid = document.createElement('div');
            grid.className = 'dates-month-grid';

            slots.sort((a,b) => a.day - b.day).forEach(({ day, date, isPast, isBooked }) => {
              const url      = dateImgMap.get(day) || '';
              const disabled = isPast || isBooked;
              const cell        = document.createElement('div');
              const cellDateObj = new Date(date);
              const cellLabel   = cellDateObj.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
              const cellDisabled = isPast || isBooked;
              cell.className    = 'date-cell' + (isBooked ? ' unavailable' : isPast ? ' past' : '');
              cell.dataset.date = date;
              cell.dataset.day  = day;
              cell.setAttribute('role', 'button');
              cell.setAttribute('aria-label', cellDisabled ? `Unavailable — ${cellLabel}` : `Select ${cellLabel}`);
              if (cellDisabled) cell.setAttribute('aria-disabled', 'true');
              cell.innerHTML = (url
                ? `<img src="${url}" alt="Day ${day}" loading="lazy">`
                : `<span class="date-num-fallback">${String(day).padStart(2,'0')}</span>`) +
                `<div class="date-lock"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>`;
              if (!disabled) cell.addEventListener('click', () => pickDay(day, date, cell));
              grid.appendChild(cell);
            });

            datesGrid.appendChild(grid);
          });
      } catch (e) {
        datesGrid.innerHTML = '<div class="dates-empty">Could not load dates. Please refresh.</div>';
      }
    }

    function pickDay(day, dateStr, cell) {
      selectedDay   = day;
      selectedDate  = dateStr;
      const d = new Date(dateStr);
      currentYear   = d.getFullYear();
      currentMonth  = d.getMonth();
      document.querySelectorAll('.date-cell').forEach(c => c.classList.remove('selected'));
      cell.classList.add('selected');
      updateSelectedDateBar();
      checkProceedButton();
    }

    function updateSelectedDateBar() {
      if (selectedDay && selectedArtist) {
        const monthName = new Date(currentYear, currentMonth, 1)
          .toLocaleString('en-IE', { month: 'long' });
        selectedDateText.textContent = `${selectedArtist.name} · ${selectedDay} ${monthName} ${currentYear}`;
        selectedDateBar.classList.add('visible');
      } else {
        selectedDateBar.classList.remove('visible');
      }
    }

    clearDateBtn.addEventListener('click', () => {
      selectedDay = null;
      document.querySelectorAll('.date-cell').forEach(c => c.classList.remove('selected'));
      updateSelectedDateBar();
      checkProceedButton();
    });

    // ── Form validation ──
    function getField(id) { return document.getElementById(id); }

    function validateForm() {
      let ok = true;
      const name  = getField('clientName').value.trim();
      const phone = getField('clientPhone').value.trim();
      const email = getField('clientEmail').value.trim();
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      document.getElementById('nameError').classList.toggle('visible', !name);
      document.getElementById('phoneError').classList.toggle('visible', !phone);
      document.getElementById('emailError').classList.toggle('visible', !email || !emailRe.test(email));

      if (!name || !phone || !email || !emailRe.test(email)) ok = false;
      return ok;
    }

    function checkProceedButton() {
      const name  = getField('clientName').value.trim();
      const phone = getField('clientPhone').value.trim();
      const email = getField('clientEmail').value.trim();
      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const ready = name && phone && email && emailRe.test(email) && selectedArtist && selectedDay;
      proceedBtn.disabled = !ready;
    }

    ['clientName','clientPhone','clientEmail','style','placement','description'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', checkProceedButton);
    });

    // ── Proceed to payment ──
    proceedBtn.addEventListener('click', async () => {
      if (!validateForm()) return;

      proceedBtn.disabled = true;
      proceedBtn.textContent = 'Setting up payment...';

      const dateStr = selectedDate || `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}-${String(selectedDay).padStart(2,'0')}`;

      try {
        const res  = await fetch(`${INTERNAL_API}/api/public/bookings/payment-intent`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            artist_slug:  selectedArtist.slug,
            client_name:  getField('clientName').value.trim(),
            client_email: getField('clientEmail').value.trim(),
            client_phone: getField('clientPhone').value.trim(),
            style:        getField('style').value.trim() || undefined,
            description:  getField('description').value.trim() || undefined,
            placement:    getField('placement').value.trim() || undefined,
            size:         getField('size').value || undefined,
            date:         dateStr,
          }),
          signal: AbortSignal.timeout(20000),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Payment setup failed');

        clientSecret = data.client_secret;
        bookingId    = data.booking_id;
        depositAmountEl.textContent = `€${data.deposit_amount}`;

        // Mount Stripe Payment Element
        elements = stripe.elements({
          clientSecret,
          appearance: {
            theme: 'flat',
            variables: {
              colorPrimary: '#000000',
              colorBackground: '#ffffff',
              colorText: '#000000',
              colorDanger: '#c0392b',
              fontFamily: 'Poppins, sans-serif',
              spacingUnit: '4px',
              borderRadius: '0px',
            },
            rules: {
              '.Input': { border: '1px solid #e0e0e0', padding: '10px 12px' },
              '.Input:focus': { border: '1px solid #000000', boxShadow: 'none' },
              '.Label': { fontSize: '9px', fontWeight: '700', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#636363' },
            },
          },
        });

        const paymentEl = elements.create('payment', {
          layout: {
            type: 'accordion',
            defaultCollapsed: false,
            radios: true,
            spacedAccordionItems: false,
          },
          paymentMethodOrder: ['apple_pay', 'google_pay', 'klarna', 'card'],
        });

        paymentEl.mount('#payment-element');
        paymentEl.on('ready', () => { submitBtn.disabled = false; });

        paymentSection.classList.add('visible');
        proceedBtn.textContent = 'Change Details';
        proceedBtn.disabled = false;

        // Scroll to payment
        paymentSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

      } catch (err) {
        paymentError.textContent = err.message || 'Something went wrong. Please try again.';
        paymentError.classList.add('visible');
        proceedBtn.textContent = 'Proceed to Payment';
        proceedBtn.disabled = false;
      }
    });

    // ── Submit payment ──
    submitBtn.addEventListener('click', async () => {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing...';
      paymentError.classList.remove('visible');

      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/bookings.html?success=1&booking_id=${bookingId}`,
        },
        redirect: 'if_required',
      });

      if (error) {
        paymentError.textContent = error.message;
        paymentError.classList.add('visible');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm & Pay';
        return;
      }

      // Payment succeeded without redirect
      showSuccess();
    });

    // ── Success state ──
    function showSuccess() {
      bookingLayout.style.display = 'none';
      bookingSuccess.classList.add('visible');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ── Handle return from Stripe redirect ──
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === '1') {
      showSuccess();
    }

    // ── Start ──
    init();
  })();