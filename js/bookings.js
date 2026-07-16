(function () {
    'use strict';

    const INTERNAL_API = 'https://appreciart-internal-production-ee3c.up.railway.app';

    // Artist calendar colours (mirrors dashboard/admin). Guest fallback = gold.
    const ARTIST_COLOURS = {
      'moreirart': '#2E7D32',
      'marina':    '#E64A19',
      'renan':     '#1565C0',
    };
    const GUEST_COLOUR = '#B8860B';

    // ── State ──
    let artists        = [];
    let selectedArtist = null;
    let selectedDay    = null;
    let selectedDate   = null;
    let currentYear    = new Date().getFullYear();
    let currentMonth   = new Date().getMonth();
    let currentStep    = 1;
    let availMap       = new Map();  // 'YYYY-MM-DD' → original slot.date string (available)
    let bookedSet      = new Set();  // 'YYYY-MM-DD' booked/unavailable
    let minMonthKey    = null;       // year*12+month of earliest available slot
    let maxMonthKey    = null;       // year*12+month of latest available slot
    let stripe         = null;
    let stripePublishableKey = null;
    let elements       = null;
    let paymentElement = null;
    let clientSecret   = null;
    let bookingId      = null;
    let paymentIntent  = null;

    // ── DOM refs ──
    const artistSelector  = document.getElementById('artistSelector');
    const calendarGrid    = document.getElementById('calendarGrid');
    const calMonthEl      = document.getElementById('calMonth');
    const calPrevBtn      = document.getElementById('calPrev');
    const calNextBtn      = document.getElementById('calNext');
    const calendarEl      = document.getElementById('calendar');
    const calendarLegend  = document.getElementById('calendarLegend');
    const proceedBtn      = document.getElementById('proceedBtn');
    const submitBtn       = document.getElementById('submitBtn');
    const paymentError    = document.getElementById('paymentError');
    const depositAmountEl = document.getElementById('depositAmount');
    const bookingSuccess  = document.getElementById('bookingSuccess');
    const bookingLayout   = document.getElementById('bookingLayout');
    const bookingSteps    = document.getElementById('bookingSteps');
    const summaryStepper  = document.getElementById('summaryStepper');
    const summaryArtist   = document.getElementById('summaryArtist');
    const summaryDate     = document.getElementById('summaryDate');
    const summaryDeposit  = document.getElementById('summaryDeposit');
    const next1Btn        = document.getElementById('next1');
    const next2Btn        = document.getElementById('next2');

    // ── Helpers ──
    function pad(n) { return String(n).padStart(2, '0'); }
    function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
    function keyFor(y, m, day) { return `${y}-${pad(m + 1)}-${pad(day)}`; }
    function artistColour(a) {
      if (!a) return '#000000';
      return ARTIST_COLOURS[a.slug] || GUEST_COLOUR;
    }

    // ── Fetch public config ──
    async function fetchConfig() {
      try {
        const res = await fetch(`${INTERNAL_API}/api/public/config`, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error(`Config endpoint returned ${res.status}`);
        const data = await res.json();
        stripePublishableKey = data.stripePublishableKey;
        if (!stripePublishableKey) throw new Error('stripePublishableKey not in config');
      } catch (err) {
        console.error('[config] Failed to fetch:', err.message);
        throw err;
      }
    }

    // ── Init ──
    async function init() {
      await fetchConfig();
      stripe = Stripe(stripePublishableKey);

      // Pre-select artist from URL param
      const params = new URLSearchParams(window.location.search);
      const artistParam = params.get('artist');

      // Pre-read URL date param if present (applied once availability loads)
      const dateParamRaw = params.get('date');
      if (dateParamRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateParamRaw)) {
        selectedDate = dateParamRaw;
      }

      updateSummary();
      await loadArtists(artistParam);
    }

    // ── Load artists ──
    async function loadArtists(preselect) {
      try {
        const res  = await fetch(`${INTERNAL_API}/api/public/artists`, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error('Failed to load artists');
        const data = await res.json();
        artists = data.residents || [];
        renderArtistSelector(preselect);

        const guests = data.guests || [];
        const guestSection = document.getElementById('guestArtistsSection');
        const guestGrid    = document.getElementById('guestArtistsGrid');
        if (guestSection && guestGrid && guests.length) {
          guestSection.classList.remove('hidden');
          guests.forEach(guest => {
            const styles = Array.isArray(guest.styles) ? guest.styles.join(' · ') : '';
            const href   = 'artist.html?slug=' + encodeURIComponent(guest.slug);
            const card   = document.createElement('a');
            card.className = 'guest-artist-card';
            card.href      = href;
            card.innerHTML =
              '<div class="guest-artist-photo" id="gap-' + esc(guest.slug) + '">' +
                '<span class="guest-artist-initials">' + esc(guest.name.charAt(0)) + '</span>' +
              '</div>' +
              '<div class="guest-artist-info">' +
                '<p class="guest-artist-name">' + esc(guest.name) + '</p>' +
                (styles ? '<p class="guest-artist-styles">' + esc(styles) + '</p>' : '') +
              '</div>' +
              '<span class="guest-artist-cta">View Profile →</span>';
            guestGrid.appendChild(card);

            // profile_url comes on the list response — no per-guest request
            if (isSafeUrl(guest.profile_url)) {
              const photoWrap = document.getElementById('gap-' + guest.slug);
              if (photoWrap) {
                photoWrap.innerHTML = '<img src="' + esc(guest.profile_url) + '" alt="' + esc(guest.name) + '">';
              }
            }
          });
        }
      } catch (e) {
        toast('Could not load artists', 'error');
        artistSelector.innerHTML = '<p class="artists-load-error">Could not load artists. Please try again.</p>';
      }
    }

    function renderArtistSelector(preselect) {
      artistSelector.innerHTML = '';
      artists.forEach(artist => {
        const btn = document.createElement('button');
        btn.className = 'artist-btn';
        btn.dataset.slug = artist.slug;
        const profileSrc = isSafeUrl(artist.profile_url) ? artist.profile_url : `images/resident-artists/${esc(artist.slug)}-profile.webp`;
        btn.innerHTML = `
          <img src="${esc(profileSrc)}"
               alt="${esc(artist.name)}">
          <span class="artist-btn-name">${esc(artist.name)}</span>
        `;
        btn.addEventListener('click', () => selectArtist(artist));
        artistSelector.appendChild(btn);

        const btnImg = btn.querySelector('img');
        if (btnImg) {
          btnImg.addEventListener('error', () => {
            btnImg.src = `images/resident-artists/${artist.slug}-profile.webp`;
            btnImg.onerror = null;
          });
        }

        if (preselect && artist.slug === preselect) {
          selectArtist(artist, btn);
        }
      });
    }

    function selectArtist(artist, btnEl) {
      selectedArtist = artist;
      selectedDay    = null;

      document.querySelectorAll('.artist-btn').forEach(b => b.classList.remove('active'));
      const btn = btnEl || artistSelector.querySelector(`[data-slug="${CSS.escape(artist.slug)}"]`);
      if (btn) btn.classList.add('active');

      // Apply artist colour to the calendar
      if (calendarEl) calendarEl.style.setProperty('--artist-color', artistColour(artist));

      next1Btn.disabled = false;
      updateSummary();
      checkProceedButton();
      loadAvailability(artist.slug);

      // Auto-advance to date step on selection
      goToStep(2);
    }

    // ── Load availability + build calendar data ──
    async function loadAvailability(slug) {
      calendarGrid.innerHTML = '<div class="dates-loading">Loading dates...</div>';
      calendarLegend.style.display = 'none';
      availMap = new Map();
      bookedSet = new Set();
      minMonthKey = null;
      maxMonthKey = null;

      try {
        const res  = await fetch(
          `${INTERNAL_API}/api/public/availability/${slug}`,
          { signal: AbortSignal.timeout(10000) }
        );
        if (!res.ok) throw new Error('Failed to load availability');
        const data = await res.json();
        const today    = new Date(); today.setHours(0, 0, 0, 0);
        const allSlots = (data.availability || []);

        allSlots.forEach(a => {
          const d   = new Date(a.date);
          const key = dateKey(d);
          if (a.booked) {
            bookedSet.add(key);
          } else if (d >= today) {
            availMap.set(key, key);
            const mk = d.getFullYear() * 12 + d.getMonth();
            if (minMonthKey === null || mk < minMonthKey) minMonthKey = mk;
            if (maxMonthKey === null || mk > maxMonthKey) maxMonthKey = mk;
          }
        });

        if (!availMap.size) {
          calendarGrid.innerHTML = '<div class="dates-empty">No dates available. Contact us on <a href="https://wa.me/353838882759" target="_blank" rel="noopener noreferrer">WhatsApp</a> to enquire.</div>';
          calMonthEl.textContent = '—';
          calPrevBtn.disabled = true;
          calNextBtn.disabled = true;
          return;
        }

        // Start on the first month containing availability, unless a valid
        // pre-selected date already points elsewhere.
        let startMk = minMonthKey;
        if (selectedDate && availMap.has(selectedDate)) {
          const sd = new Date(selectedDate);
          startMk = sd.getFullYear() * 12 + sd.getMonth();
        }
        currentYear  = Math.floor(startMk / 12);
        currentMonth = startMk % 12;

        renderCalendar();

        // Re-apply a pre-selected (URL/back-nav) date if still available
        if (selectedDate && availMap.has(selectedDate)) {
          const sd = new Date(selectedDate);
          selectedDay = sd.getDate();
          markSelectedCell();
          next2Btn.disabled = false;
          updateSummary();
          checkProceedButton();
        }
      } catch (e) {
        toast('Could not load dates', 'error');
        calendarGrid.innerHTML = '<div class="dates-empty">Could not load dates. Please refresh.</div>';
      }
    }

    function renderCalendar() {
      const monthLabel = new Date(currentYear, currentMonth, 1)
        .toLocaleString('en-IE', { month: 'long', year: 'numeric' });
      calMonthEl.textContent = monthLabel;

      const curMk = currentYear * 12 + currentMonth;
      calPrevBtn.disabled = (minMonthKey === null || curMk <= minMonthKey);
      calNextBtn.disabled = (maxMonthKey === null || curMk >= maxMonthKey);

      const firstDay    = new Date(currentYear, currentMonth, 1);
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      const leadBlanks  = (firstDay.getDay() + 6) % 7; // Mon-first offset
      const today       = new Date(); today.setHours(0, 0, 0, 0);

      calendarGrid.innerHTML = '';

      for (let i = 0; i < leadBlanks; i++) {
        const blank = document.createElement('div');
        blank.className = 'cal-cell is-blank';
        calendarGrid.appendChild(blank);
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const key  = keyFor(currentYear, currentMonth, day);
        const cell = document.createElement('div');
        cell.dataset.key = key;
        cell.textContent = String(day);

        const cellDate = new Date(currentYear, currentMonth, day);
        const isPast   = cellDate < today;

        if (availMap.has(key)) {
          cell.className = 'cal-cell is-available';
          const labelDate = cellDate.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
          cell.setAttribute('role', 'button');
          cell.setAttribute('aria-label', `Select ${labelDate}`);
          cell.addEventListener('click', () => pickDay(day, availMap.get(key)));
          if (selectedDate === availMap.get(key)) cell.classList.add('is-selected');
        } else if (bookedSet.has(key) && !isPast) {
          cell.className = 'cal-cell is-booked';
          cell.setAttribute('aria-disabled', 'true');
        } else {
          cell.className = 'cal-cell is-disabled';
          cell.setAttribute('aria-disabled', 'true');
        }

        calendarGrid.appendChild(cell);
      }

      calendarLegend.style.display = 'flex';
    }

    function markSelectedCell() {
      document.querySelectorAll('.cal-cell').forEach(c => c.classList.remove('is-selected'));
      const cell = calendarGrid.querySelector(`.cal-cell[data-key="${CSS.escape(selectedDate)}"]`);
      if (cell) cell.classList.add('is-selected');
    }

    function changeMonth(delta) {
      const curMk = currentYear * 12 + currentMonth;
      const nextMk = curMk + delta;
      if (minMonthKey !== null && nextMk < minMonthKey) return;
      if (maxMonthKey !== null && nextMk > maxMonthKey) return;
      currentYear  = Math.floor(nextMk / 12);
      currentMonth = nextMk % 12;
      renderCalendar();
    }

    calPrevBtn.addEventListener('click', () => changeMonth(-1));
    calNextBtn.addEventListener('click', () => changeMonth(1));

    function pickDay(day, dateStr) {
      selectedDay  = day;
      selectedDate = dateStr;
      const d = new Date(dateStr);
      currentYear  = d.getFullYear();
      currentMonth = d.getMonth();
      markSelectedCell();
      next2Btn.disabled = false;
      updateSummary();
      checkProceedButton();
      // Auto-advance to the details step
      goToStep(3);
    }

    // ── Summary rail + stepper ──
    function updateSummary() {
      // Artist
      if (selectedArtist) {
        const hasPhoto = isSafeUrl(selectedArtist.profile_url);
        const img = hasPhoto
          ? `<img src="${esc(selectedArtist.profile_url)}" alt="${esc(selectedArtist.name)}">`
          : `<span class="summary-artist-swatch"></span>`;
        summaryArtist.innerHTML = `${img}<span>${esc(selectedArtist.name)}</span>`;
        // Set the swatch colour via CSSOM (no inline style attribute — CSP-safe)
        if (!hasPhoto) {
          const sw = summaryArtist.querySelector('.summary-artist-swatch');
          if (sw) sw.style.background = artistColour(selectedArtist);
        }
        summaryArtist.parentElement.classList.remove('is-empty');
      } else {
        summaryArtist.textContent = 'Not selected';
        summaryArtist.parentElement.classList.add('is-empty');
      }

      // Date
      if (selectedDay && selectedArtist) {
        const monthName = new Date(currentYear, currentMonth, 1)
          .toLocaleString('en-IE', { month: 'long' });
        summaryDate.textContent = `${selectedDay} ${monthName} ${currentYear}`;
        summaryDate.parentElement.classList.remove('is-empty');
      } else {
        summaryDate.textContent = 'Not selected';
        summaryDate.parentElement.classList.add('is-empty');
      }
    }

    function updateStepper() {
      summaryStepper.querySelectorAll('.summary-step').forEach(li => {
        const n = Number(li.dataset.goto);
        li.classList.toggle('is-current', n === currentStep);
        li.classList.toggle('is-done', n < currentStep);
      });
    }

    function goToStep(step) {
      // Guard against jumping ahead without prerequisites
      if (step >= 2 && !selectedArtist) step = 1;
      if (step >= 3 && !selectedDay)    step = 2;
      if (step === 4 && !clientSecret)  step = 3;

      currentStep = step;
      bookingSteps.querySelectorAll('.booking-step').forEach(sec => {
        sec.classList.toggle('is-active', Number(sec.dataset.step) === step);
      });
      updateStepper();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Stepper navigation (only to completed/earlier steps)
    summaryStepper.addEventListener('click', (e) => {
      const li = e.target.closest('.summary-step');
      if (!li) return;
      const n = Number(li.dataset.goto);
      if (n < currentStep) goToStep(n);
    });

    // Back / Continue buttons
    bookingSteps.addEventListener('click', (e) => {
      const back = e.target.closest('.btn-step-back');
      if (back) { goToStep(Number(back.dataset.goto)); return; }
    });
    next1Btn.addEventListener('click', () => goToStep(2));
    next2Btn.addEventListener('click', () => goToStep(3));

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

      const dateStr = selectedDate;

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
            marketing_consent: getField('marketingConsent').checked,
          }),
          signal: AbortSignal.timeout(20000),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Payment setup failed. Please try again.');

        toast('Payment details loaded', 'success');
        clientSecret = data.client_secret;
        bookingId    = data.booking_id;
        paymentIntent = data.payment_intent;
        depositAmountEl.textContent = `€${data.deposit_amount}`;
        summaryDeposit.textContent  = `€${data.deposit_amount}`;

        // Mandatory confirmation before the Payment Element is shown
        const confirmed = await showDepositConfirm(data.deposit_amount);
        if (!confirmed) {
          proceedBtn.textContent = 'Proceed to Payment';
          proceedBtn.disabled = false;
          return;
        }

        // Mount Stripe Payment Element — destroy any previous one first
        if (paymentElement) {
          paymentElement.destroy();
          paymentElement = null;
          submitBtn.disabled = true;
        }
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

        paymentElement = elements.create('payment', {
          layout: {
            type: 'accordion',
            defaultCollapsed: false,
            radios: true,
            spacedAccordionItems: false,
          },
          paymentMethodOrder: ['apple_pay', 'google_pay', 'klarna', 'card'],
        });

        paymentElement.mount('#payment-element');
        paymentElement.on('ready', () => { submitBtn.disabled = false; });

        // Advance to the payment step
        goToStep(4);
        proceedBtn.textContent = 'Proceed to Payment';
        proceedBtn.disabled = true;

      } catch (err) {
        const errMsg = err.message || 'Something went wrong. Please try again.';
        toast(errMsg, 'error');
        paymentError.textContent = errMsg;
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

      let result;
      try {
        result = await stripe.confirmPayment({
          elements,
          confirmParams: {
            return_url: `${window.location.origin}/bookings.html?success=1&booking_id=${encodeURIComponent(bookingId)}&payment_intent=${encodeURIComponent(paymentIntent)}`,
          },
          redirect: 'if_required',
        });
      } catch (err) {
        result = { error: { message: 'Connection problem — your payment was not completed. Please check your connection and try again.' } };
      }
      const { error } = result;

      if (error) {
        toast(error.message, 'error');
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
      const redirectStatus = params.get('redirect_status');
      if (!redirectStatus || redirectStatus === 'succeeded' || redirectStatus === 'processing') {
        showSuccess();
      } else {
        toast('Payment was not completed — no money was taken. Please try again.', 'error');
        window.history.replaceState({}, '', window.location.pathname);
      }
    }

    // ── Start ──
    // Logged-in artists don't use the public customer booking flow — bookings
    // and walk-in sessions are managed from the dashboard. Show a notice instead.
    if (localStorage.getItem('art_token')) {
      if (bookingLayout) {
        bookingLayout.innerHTML =
          '<div class="booking-artist-notice">' +
            '<h2 class="booking-artist-notice-title">You\'re signed in as an artist</h2>' +
            '<p class="booking-artist-notice-text">Bookings and walk-in sessions are managed from your dashboard, not the public booking flow.</p>' +
            '<a href="dashboard.html" class="btn btn-primary">Go to Dashboard</a>' +
          '</div>';
      }
    } else {
      updateStepper();
      init();
    }
  })();
