'use strict';

(function () {
  const INTERNAL = 'https://appreciart-internal-production-ee3c.up.railway.app';

  let _token = localStorage.getItem('art_token');
  const stored = localStorage.getItem('art_artist');

  if (!_token || !stored) { window.location.href = 'login.html'; return; }

  let artist;
  try { artist = JSON.parse(stored); } catch {
    window.toast('Invalid session. Please sign in again.', 'error');
    setTimeout(() => { window.location.href = 'login.html'; }, 800);
    return;
  }

  // ── Onboarding / password change ──
  if (artist.must_change_password) {
    showChangePasswordModal();
  } else if (artist.role === 'guest' && !artist.onboarding_done) {
    showOnboardingModal();
  }

  const ARTIST_COLOURS = {
    'moreirart': { bg: '#2E7D32', text: '#ffffff' },
    'marina':    { bg: '#E64A19', text: '#ffffff' },
    'renan':     { bg: '#1565C0', text: '#ffffff' },
  };

  function getArtistColour(slug) {
    return ARTIST_COLOURS[slug] || { bg: '#B8860B', text: '#ffffff' };
  }

  const isGuest = artist.role === 'guest';


  const whatsappField = document.getElementById('whatsappField');
  if (whatsappField) whatsappField.style.display = isGuest ? 'block' : 'none';
  const bookingUrlField = document.getElementById('bookingUrlField');
  if (bookingUrlField) bookingUrlField.style.display = isGuest ? 'block' : 'none';

  const tabs         = document.querySelectorAll('.dash-tab');
  const panels       = document.querySelectorAll('.dash-panel');
  const bookingsList = document.getElementById('bookingsList');
  const calGrid      = document.getElementById('calGrid');
  const calMonth     = document.getElementById('calMonth');
  const calPrev      = document.getElementById('calPrev');
  const calNext      = document.getElementById('calNext');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  async function authFetch(path, options = {}) {
    const doFetch = (t) => fetch(`${INTERNAL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${t}`,
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(12000),
    });

    let res = await doFetch(_token);

    if (res.status === 401) {
      try {
        const refreshRes = await fetch(`${INTERNAL}/api/auth/refresh`, {
          method:      'POST',
          credentials: 'include',
          signal:      AbortSignal.timeout(8000),
        });
        if (!refreshRes.ok) throw new Error('refresh failed');
        const refreshData = await refreshRes.json();
        _token = refreshData.token;
        localStorage.setItem('art_token', _token);
        res = await doFetch(_token);
      } catch {
        localStorage.removeItem('art_token');
        localStorage.removeItem('art_artist');
        window.toast('Session expired. Please sign in again.', 'error');
        setTimeout(() => { window.location.href = 'login.html'; }, 800);
        throw new Error('session expired');
      }
    }

    return res;
  }

  // ── SSE ──
  function initSSE() {
    const es = new EventSource(`${INTERNAL}/api/events?token=${encodeURIComponent(_token)}`);
    es.addEventListener('availability_update', () => {
      loadAvailability(false);
    });
    es.addEventListener('booking_update', () => {
      loadBookings();
    });
    es.onerror = () => {
      es.close();
      setTimeout(async () => {
        // Refresh token before reconnecting SSE
        try {
          const res = await fetch(`${INTERNAL}/api/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            signal: AbortSignal.timeout(8000),
          });
          if (res.ok) {
            const data = await res.json();
            _token = data.token;
            localStorage.setItem('art_token', _token);
          }
        } catch {}
        initSSE();
      }, 10000);
    };
  }

  // ── Bookings ──
  const STAGE_LABELS = {
    'new_lead':     'New lead',
    'contacted':    'Contacted',
    'deposit_paid': 'Deposit paid',
    'confirmed':    'Confirmed',
    'completed':    'Completed',
    'cancelled':    'Cancelled',
  };

  const STAGES = Object.keys(STAGE_LABELS);

  function stageLabel(s) { return STAGE_LABELS[s] || s; }

  function relativeDate(dateStr) {
    if (!dateStr) return 'TBD';
    const today = new Date(); today.setHours(0,0,0,0);
    const d     = new Date(dateStr); d.setHours(0,0,0,0);
    const diff  = Math.round((d - today) / 86400000);
    if (diff === 0)  return 'Today';
    if (diff === 1)  return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
  }

  function renderCards(list) {
    return list.map(b => `
      <div class="booking-card booking-card--clickable" data-id="${b.id}">
        <span class="booking-client">${esc(b.client_name)}</span>
        <span class="booking-meta">${esc(relativeDate(b.date))}</span>
        <span class="booking-badge${b.deposit_paid ? ' paid' : ''}">${b.deposit_paid ? 'Deposit paid' : stageLabel(b.stage)}</span>
      </div>
    `).join('');
  }

  async function loadBookings() {
    try {
      const res  = await authFetch('/api/artist/sessions');
      const data = await res.json();

      const data_sessions = data.sessions || data.bookings || [];
      if (!data_sessions.length) {
        bookingsList.innerHTML = '<p class="dash-empty"><svg class="dash-empty-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="0"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>No sessions yet.<span class="dash-empty-sub">Sessions you log on the Availability tab will appear here.</span></p>';
        return;
      }

      const now      = new Date(); now.setHours(0,0,0,0);
      const upcoming = data_sessions.filter(b => !b.date || new Date(b.date) >= now);
      const past     = data_sessions.filter(b => b.date && new Date(b.date) < now);

      

      let html = '';
      if (upcoming.length) {
        html += `<p class="bookings-section-label">Upcoming</p>
                 <div class="bookings-list-inner">${renderCards(upcoming)}</div>`;
      }
      if (past.length) {
        html += `<details class="bookings-past">
                   <summary class="bookings-section-label bookings-past-toggle">Past (${past.length})</summary>
                   <div class="bookings-list-inner">${renderCards(past)}</div>
                 </details>`;
      }

      bookingsList.innerHTML = html;

      bookingsList.querySelectorAll('.booking-card').forEach(card => {
        const booking = data_sessions.find(b => String(b.id) === card.dataset.id);
        if (booking) card.addEventListener('click', () => showBookingModal(booking));
      });

    } catch {
      window.toast('Could not load bookings', 'error');
      bookingsList.innerHTML = '<p class="dash-empty">Could not load bookings. Please refresh.</p>';
    }
  }

  function showBookingModal(b) {
    const existing = document.getElementById('bookingModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'bookingModal';
    modal.className = 'cal-modal-overlay';
    modal.innerHTML = `
      <div class="cal-modal-box">
        <p class="cal-modal-date">${esc(b.date ? b.date.slice(0,10) : 'No date')}</p>
        <p class="cal-modal-title">${esc(b.client_name)}</p>
        ${b.client_email ? `<p class="booking-modal-detail">${esc(b.client_email)}</p>` : ''}
        ${b.client_phone ? `<p class="booking-modal-detail">${esc(b.client_phone)}</p>` : ''}
        ${b.style ? `<p class="booking-modal-detail">${esc(b.style)}</p>` : ''}
        <div class="form-field" id="bmStageField">
          <label class="form-label" for="bmStage">Status</label>
          <select class="form-input form-select" id="bmStage">
            ${STAGES.map(s => `<option value="${s}"${b.stage === s ? ' selected' : ''}>${stageLabel(s)}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label class="form-label" for="bmNotes">Notes</label>
          <input class="form-input" id="bmNotes" type="text" value="${esc(b.notes || '')}" placeholder="Internal notes">
        </div>
        <div class="cal-modal-actions">
          <button class="btn btn-primary btn-sm" id="bmSave">Save</button>
          <button class="btn btn-secondary btn-sm" id="bmClose">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('bmStageField').style.marginTop = '20px';
    requestAnimationFrame(() => modal.classList.add('open'));

    function closeModal() {
      modal.classList.remove('open');
      setTimeout(() => modal.remove(), 250);
      document.removeEventListener('keydown', escHandler);
    }

    function escHandler(e) { if (e.key === 'Escape') closeModal(); }
    document.addEventListener('keydown', escHandler);

    document.getElementById('bmClose').addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    document.getElementById('bmSave').addEventListener('click', async () => {
      const stage = document.getElementById('bmStage').value;
      const notes = document.getElementById('bmNotes').value.trim();
      try {
        const res = await authFetch(`/api/artist/bookings/${b.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ stage, notes }),
        });
        if (res.ok) {
          window.toast('Booking updated', 'success');
          closeModal();
          loadBookings();
        } else {
          window.toast('Failed to update booking', 'error');
        }
      } catch {
        window.toast('Error updating booking', 'error');
      }
    });
  }

  // ── Calendar ──
  const today = new Date();
  today.setHours(0,0,0,0);

  let currentYear        = today.getFullYear();
  let currentMonth       = today.getMonth();
  let studioAvailability = [];
  let guestSlotMap       = {};

  async function loadAvailability(showToast = true) {
    try {
      const res  = await authFetch('/api/artist/studio-availability');
      const data = await res.json();
      studioAvailability = data.availability || [];

      if (isGuest && artist.guest_start_date && artist.guest_end_date) {
        try {
          const from = artist.guest_start_date.slice(0, 10);
          const to   = artist.guest_end_date.slice(0, 10);
          const slotsRes  = await fetch(
            `${INTERNAL}/api/public/slots/range?from=${from}&to=${to}`,
            { signal: AbortSignal.timeout(8000) }
          );
          const slotsData = await slotsRes.json();
          guestSlotMap = {};
          if (slotsData.days && Array.isArray(slotsData.days)) {
            slotsData.days.forEach(d => { guestSlotMap[d.date] = d.available; });
          }
        } catch {
          guestSlotMap = {};
        }
      }

      renderCalendar();
    } catch {
      if (showToast) window.toast('Could not load availability dates', 'error');
      studioAvailability = [];
      guestSlotMap = {};
      renderCalendar();
    }
  }

  function getDayEntries(dateStr) {
    return studioAvailability.filter(a => a.date.slice(0, 10) === dateStr);
  }

  function renderCalendar() {
    const months = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    calMonth.textContent = `${months[currentMonth]} ${currentYear}`;

    const days   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const first  = new Date(currentYear, currentMonth, 1);
    const total  = new Date(currentYear, currentMonth + 1, 0).getDate();
    let startDay = first.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;

    let html = days.map(d => `<div class="cal-day-label">${d}</div>`).join('');

    for (let i = 0; i < startDay; i++) html += `<div class="cal-day empty"></div>`;

    for (let d = 1; d <= total; d++) {
      const date    = new Date(currentYear, currentMonth, d);
      const dateStr = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const past    = date < today;
      const isToday = date.getTime() === today.getTime();
      let bars = '';
      let cls = 'cal-day';

      if (isGuest) {
        const guestStart  = artist.guest_start_date ? artist.guest_start_date.slice(0, 10) : null;
        const guestEnd    = artist.guest_end_date   ? artist.guest_end_date.slice(0, 10)   : null;
        const inPeriod    = guestStart && guestEnd && dateStr >= guestStart && dateStr <= guestEnd;
        const available   = guestSlotMap[dateStr] ?? null;
        const myEntry     = studioAvailability.find(e => e.date.slice(0, 10) === dateStr && e.artist_slug === artist.slug);

        if (!inPeriod) {
          cls += ' cal-day--blocked';
        } else if (available === 0 && !myEntry) {
          cls += ' cal-day--full';
          bars = `<span class="cal-guest-empty cal-guest-empty--full">Full</span>`;
        } else if (myEntry && myEntry.client_name) {
          bars = `<span class="cal-bar cal-bar--guest">${esc(myEntry.client_name)}${myEntry.session_time ? ' · ' + myEntry.session_time : ''}</span>`;
        } else if (inPeriod) {
          bars = `<span class="cal-guest-empty">Tap to log a session</span>`;
        }
      } else {

      const entries = getDayEntries(dateStr);

      bars = entries.map(e => {
        const isMine         = e.artist_slug === artist.slug;
        const isConsultation = e.type === 'consultation';
        const isAvailable    = e.is_available && !e.client_name;
        const typeLabel      = e.type === 'consultation' ? 'Consult' : '';
        const timeLabel      = e.session_time ? esc(e.session_time) : '';
        const nameLabel      = isMine && e.client_name ? esc(e.client_name) : '';
        const label          = isAvailable ? 'Available' : [nameLabel, timeLabel, typeLabel].filter(Boolean).join(' · ');
        return `<span class="cal-bar${isAvailable ? ' cal-bar--available' : ''}"
          data-slug="${esc(e.artist_slug)}"
          data-mine="${isMine}"
          data-consultation="${isConsultation}"
          data-available="${isAvailable}"
          data-tooltip="${isAvailable ? esc(e.artist_name) + ' · Available' : esc(e.artist_name) + (e.session_time ? ' · ' + esc(e.session_time) : '') + (e.type ? ' · ' + esc(e.type) : '')}"
          >${label}</span>`;
      }).join('');
      } // end isGuest else

      if (past)    cls += ' past';
      if (isToday) cls += ' cal-day--today';

      html += `<div class="${cls}" data-date="${dateStr}" ${past ? 'data-readonly="true"' : ''}>
        <span class="cal-day-num">${d}</span>
        ${bars ? `<span class="cal-bars">${bars}</span>` : ''}
      </div>`;
    }

    calGrid.innerHTML = html;

    // Apply colours via JS (CSP safe)
    calGrid.querySelectorAll('.cal-bar[data-slug]').forEach(bar => {
      const isAvailable    = bar.dataset.available === 'true';
      const isConsultation = bar.dataset.consultation === 'true';
      if (isAvailable) {
        bar.style.background = '#1a1a1a';
        bar.style.color      = '#ffffff';
        bar.style.opacity    = '0.5';
      } else {
        const col = getArtistColour(bar.dataset.slug);
        bar.style.background = col.bg;
        bar.style.color      = col.text;
        if (isConsultation) bar.style.opacity = '0.45';
      }
    });

    // Guest bar colour
    calGrid.querySelectorAll('.cal-bar--guest').forEach(bar => {
      bar.style.background = '#B8860B';
      bar.style.color      = '#ffffff';
    });

    // Tooltip
    calGrid.querySelectorAll('.cal-bar[data-tooltip]').forEach(bar => {
      bar.addEventListener('mouseenter', e => showTooltip(e, bar.dataset.tooltip));
      bar.addEventListener('mouseleave', hideTooltip);
      if (bar.dataset.mine === 'false') {
        bar.addEventListener('click', e => e.stopPropagation());
      }
    });

    // Click handlers
    calGrid.querySelectorAll('.cal-day:not(.empty):not(.past):not(.cal-day--full):not(.cal-day--blocked)').forEach(el => {
      el.addEventListener('click', () => handleDayClick(el));
    });

    // Update legend
    updateLegend();
  }

  // ── Legend ──
  function updateLegend() {
    const legend = document.querySelector('.cal-legend');
    if (!legend) return;
    if (isGuest) { legend.style.display = 'none'; return; }

    const artistItems = Object.entries(ARTIST_COLOURS).map(([slug, col]) => {
      const item = document.createElement('span');
      item.className = 'cal-legend-item';
      const dot = document.createElement('span');
      dot.className = 'cal-dot';
      dot.style.background = col.bg;
      item.appendChild(dot);
      item.appendChild(document.createTextNode(' ' + slug.charAt(0).toUpperCase() + slug.slice(1)));
      return item;
    });

    const availItem = document.createElement('span');
    availItem.className = 'cal-legend-item';
    const availDot = document.createElement('span');
    availDot.className = 'cal-dot';
    availDot.style.background = '#1a1a1a';
    availDot.style.opacity = '0.5';
    availItem.appendChild(availDot);
    availItem.appendChild(document.createTextNode(' Available'));

    const consultItem = document.createElement('span');
    consultItem.className = 'cal-legend-item';
    const consultDot = document.createElement('span');
    consultDot.className = 'cal-dot';
    consultDot.style.background = '#636363';
    consultDot.style.opacity = '0.4';
    consultItem.appendChild(consultDot);
    consultItem.appendChild(document.createTextNode(' Consultation'));

    legend.innerHTML = '';
    artistItems.forEach(item => legend.appendChild(item));
    legend.appendChild(availItem);
    legend.appendChild(consultItem);
  }

  // ── Tooltip ──
  function showTooltip(e, text) {
    let tip = document.getElementById('calTooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'calTooltip';
      tip.className = 'cal-tooltip';
      document.body.appendChild(tip);
    }
    tip.textContent = text;
    tip.style.display = 'block';
    const r = e.target.getBoundingClientRect();
    tip.style.left = `${r.left + window.scrollX}px`;
    tip.style.top  = `${r.top + window.scrollY - tip.offsetHeight - 6}px`;
  }

  function hideTooltip() {
    const tip = document.getElementById('calTooltip');
    if (tip) tip.style.display = 'none';
  }

  // ── Day click ──
  async function handleDayClick(el) {
    const date     = el.dataset.date;
    const friendly = new Date(date + 'T00:00:00').toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });

    if (isGuest) {
      // Guests: skip intermediate modal, go straight to booking
      const available = guestSlotMap[date] ?? null;
      if (available === 0) return; // Full — do nothing
      const myEntry = studioAvailability.find(e => e.date.slice(0,10) === date && e.artist_slug === artist.slug);
      if (myEntry && myEntry.client_name) {
        showViewModal(date, friendly, myEntry);
      } else {
        showGuestBookModal(date, friendly);
      }
      return;
    }

    const myEntry  = studioAvailability.find(e => e.date.slice(0,10) === date && e.artist_slug === artist.slug);

    if (myEntry) {
      const isAvailableOnly = myEntry.is_available && !myEntry.client_name;
      if (isAvailableOnly) {
        showAvailableModal(date, friendly);
      } else {
        showViewModal(date, friendly, myEntry);
      }
    } else {
      try {
        const res  = await authFetch(`/api/artist/slots/${date}`);
        const data = await res.json();
        showNewModal(date, friendly, data.available || 0, data.total || 4, data.available_reservations || 0);
      } catch {
        showNewModal(date, friendly, 4, 4, 0);
      }
    }
  }

  // ── Modal: guest booking ──
  function showGuestBookModal(date, friendly) {
    removeModal();
    const modal = document.createElement('div');
    modal.id = 'calModal';
    modal.className = 'cal-modal-overlay';
    modal.innerHTML = `
      <div class="cal-modal-box">
        <p class="cal-modal-date">${esc(friendly)}</p>
        <p class="cal-modal-title">Add client</p>
        <div class="form-field">
          <label class="form-label" for="calClientName">Client name</label>
          <input class="form-input" id="calClientName" type="text" placeholder="Client name" autocomplete="off">
        </div>
        <div class="form-field">
          <label class="form-label" for="calSessionTime">Time</label>
          <select class="form-input form-select" id="calSessionTime">
            <option value="">— Select time —</option>
            ${Array.from({length: 28}, (_, i) => {
              const h = Math.floor(i / 2) + 9;
              const m = i % 2 === 0 ? '00' : '30';
              const val = `${String(h).padStart(2,'0')}:${m}`;
              return `<option value="${val}">${val}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="cal-modal-actions">
          <button class="btn btn-primary btn-sm" id="calModalConfirm">Confirm</button>
          <button class="btn btn-secondary btn-sm" id="calModalCancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('open'));

    const nameInput = document.getElementById('calClientName');
    const timeInput = document.getElementById('calSessionTime');
    setTimeout(() => nameInput.focus(), 200);

    document.getElementById('calModalConfirm').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.classList.add('form-input--error'); return; }
      removeModal();
      bookDate(date, name, timeInput.value, 'booking');
    });

    document.getElementById('calModalCancel').addEventListener('click', removeModal);
    modal.addEventListener('click', e => { if (e.target === modal) removeModal(); });
    document.addEventListener('keydown', onEsc);
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') timeInput.focus(); });
  }

  // ── Modal: empty day ──
  function showNewModal(date, friendly, slotsAvailable, slotsTotal, availReservations = 0) {
    removeModal();
    const noSlots      = slotsAvailable === 0;
    const canReserve   = availReservations < 2;
    const modal = document.createElement('div');
    modal.id = 'calModal';
    modal.className = 'cal-modal-overlay';
    modal.innerHTML = `
      <div class="cal-modal-box">
        <p class="cal-modal-date">${esc(friendly)}</p>
        <p class="cal-modal-title">Add to calendar</p>
        <p class="cal-modal-slots ${noSlots ? 'cal-modal-slots--full' : ''}">
          ${noSlots ? 'No slots available' : `${slotsAvailable} of ${slotsTotal} slots available`}
        </p>
        <div class="cal-modal-actions">
          ${canReserve ? `<button class="btn btn-primary btn-sm" id="calModalMarkAvail">Mark available</button>` : ''}
          <button class="btn btn-secondary btn-sm" id="calModalBookClient" ${noSlots ? 'disabled' : ''}>Book client</button>
          <button class="btn btn-secondary btn-sm" id="calModalCancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('open'));

    const markAvailBtn = document.getElementById('calModalMarkAvail');
    if (markAvailBtn) markAvailBtn.addEventListener('click', () => {
      removeModal();
      markAvailable(date);
    });
    document.getElementById('calModalBookClient').addEventListener('click', () => {
      removeModal();
      showBookModal(date, friendly, slotsAvailable, slotsTotal);
    });
    document.getElementById('calModalCancel').addEventListener('click', removeModal);
    modal.addEventListener('click', e => { if (e.target === modal) removeModal(); });
    document.addEventListener('keydown', onEsc);
  }

  // ── Modal: available day (no client) ──
  function showAvailableModal(date, friendly) {
    removeModal();
    const modal = document.createElement('div');
    modal.id = 'calModal';
    modal.className = 'cal-modal-overlay';
    modal.innerHTML = `
      <div class="cal-modal-box">
        <p class="cal-modal-date">${esc(friendly)}</p>
        <p class="cal-modal-title">Available</p>
        <div class="cal-modal-actions">
          <button class="btn btn-primary btn-sm" id="calModalBookClient">Book a client</button>
          <button class="btn btn-secondary btn-sm cal-btn-delete" id="calModalRemove">Remove</button>
          <button class="btn btn-secondary btn-sm" id="calModalCancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('open'));

    document.getElementById('calModalBookClient').addEventListener('click', async () => {
      removeModal();
      try {
        const res  = await authFetch(`/api/artist/slots/${date}`);
        const data = await res.json();
        showBookModal(date, friendly, data.available || 0, data.total || 4);
      } catch {
        showBookModal(date, friendly, 4, 4);
      }
    });
    document.getElementById('calModalRemove').addEventListener('click', () => {
      removeModal();
      deleteDate(date);
    });
    document.getElementById('calModalCancel').addEventListener('click', removeModal);
    modal.addEventListener('click', e => { if (e.target === modal) removeModal(); });
    document.addEventListener('keydown', onEsc);
  }

  // ── Modal: book client ──
  function showBookModal(date, friendly, slotsAvailable, slotsTotal) {
    removeModal();
    const noSlots = slotsAvailable === 0;
    const modal = document.createElement('div');
    modal.id = 'calModal';
    modal.className = 'cal-modal-overlay';
    modal.innerHTML = `
      <div class="cal-modal-box">
        <p class="cal-modal-date">${esc(friendly)}</p>
        <p class="cal-modal-title">New session</p>
        <p class="cal-modal-slots ${noSlots ? 'cal-modal-slots--full' : ''}">
          ${noSlots ? 'No slots available' : `${slotsAvailable} of ${slotsTotal} slots available`}
        </p>
        <div class="cal-modal-type">
          <button class="cal-type-btn active" data-type="booking">Booking</button>
          <button class="cal-type-btn" data-type="consultation">Consultation</button>
        </div>
        <div class="form-field">
          <label class="form-label" for="calClientName">Client name</label>
          <input class="form-input" id="calClientName" type="text" placeholder="Client name" autocomplete="off">
        </div>
        <div class="form-field">
          <label class="form-label" for="calSessionTime">Time</label>
          <select class="form-input form-select" id="calSessionTime">
            <option value="">— Select time —</option>
            ${Array.from({length: 28}, (_, i) => {
              const h = Math.floor(i / 2) + 9;
              const m = i % 2 === 0 ? '00' : '30';
              const val = `${String(h).padStart(2,'0')}:${m}`;
              return `<option value="${val}">${val}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="cal-modal-actions">
          <button class="btn btn-primary btn-sm" id="calModalConfirm" ${noSlots ? 'disabled' : ''}>Confirm</button>
          <button class="btn btn-secondary btn-sm" id="calModalCancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('open'));

    let selectedType = 'booking';
    modal.querySelectorAll('.cal-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.cal-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedType = btn.dataset.type;
        document.getElementById('calModalConfirm').disabled = selectedType === 'booking' && noSlots;
      });
    });

    const nameInput = document.getElementById('calClientName');
    const timeInput = document.getElementById('calSessionTime');
    setTimeout(() => nameInput.focus(), 200);

    document.getElementById('calModalConfirm').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.classList.add('form-input--error'); return; }
      removeModal();
      bookDate(date, name, timeInput.value, selectedType);
    });

    document.getElementById('calModalCancel').addEventListener('click', removeModal);
    modal.addEventListener('click', e => { if (e.target === modal) removeModal(); });
    document.addEventListener('keydown', onEsc);
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') timeInput.focus(); });
  }

  // ── Modal: view/edit ──
  function showViewModal(date, friendly, entry) {
    removeModal();
    const modal = document.createElement('div');
    modal.id = 'calModal';
    modal.className = 'cal-modal-overlay';
    modal.innerHTML = `
      <div class="cal-modal-box">
        <p class="cal-modal-date">${esc(friendly)}</p>
        <p class="cal-modal-title">${entry.type === 'consultation' ? 'Consultation' : 'Booking'}</p>
        <div class="form-field">
          <label class="form-label" for="calEditName">Client name</label>
          <input class="form-input" id="calEditName" type="text" value="${esc(entry.client_name || '')}" autocomplete="off">
        </div>
        <div class="form-field">
          <label class="form-label" for="calEditTime">Time</label>
          <select class="form-input form-select" id="calEditTime">
            <option value="">— Select time —</option>
            ${Array.from({length: 28}, (_, i) => {
              const h = Math.floor(i / 2) + 9;
              const m = i % 2 === 0 ? '00' : '30';
              const val = `${String(h).padStart(2,'0')}:${m}`;
              return `<option value="${val}"${entry.session_time === val ? ' selected' : ''}>${val}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="cal-modal-type">
          <button class="cal-type-btn${entry.type !== 'consultation' ? ' active' : ''}" data-type="booking">Booking</button>
          <button class="cal-type-btn${entry.type === 'consultation' ? ' active' : ''}" data-type="consultation">Consultation</button>
        </div>
        <div class="cal-modal-actions" id="calViewActions">
          <button class="btn btn-primary btn-sm" id="calModalSave">Save</button>
          <button class="btn btn-secondary btn-sm cal-btn-delete" id="calModalDelete">Delete</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('calViewActions').style.marginTop = '24px';
    requestAnimationFrame(() => modal.classList.add('open'));
    document.addEventListener('keydown', onEsc);

    let selectedType = entry.type || 'booking';
    modal.querySelectorAll('.cal-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modal.querySelectorAll('.cal-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedType = btn.dataset.type;
      });
    });

    document.getElementById('calModalSave').addEventListener('click', () => {
      const name = document.getElementById('calEditName').value.trim();
      const time = document.getElementById('calEditTime').value;
      if (!name) { document.getElementById('calEditName').classList.add('form-input--error'); return; }
      removeModal();
      bookDate(date, name, time, selectedType);
    });

    document.getElementById('calModalDelete').addEventListener('click', () => {
      removeModal();
      deleteDate(date);
    });

    modal.addEventListener('click', e => { if (e.target === modal) removeModal(); });
  }

  function onEsc(e) {
    if (e.key === 'Escape') { removeModal(); document.removeEventListener('keydown', onEsc); }
  }

  function removeModal() {
    const m = document.getElementById('calModal');
    if (m) { m.classList.remove('open'); setTimeout(() => m.remove(), 250); }
    document.removeEventListener('keydown', onEsc);
  }

  async function markAvailable(date) {
    try {
      const res = await authFetch('/api/artist/availability', {
        method: 'POST',
        body:   JSON.stringify({ date, is_available: true, client_name: null, session_time: null, type: 'booking' }),
      });
      if (res.ok) {
        window.toast('Date marked as available', 'success');
        const idx = studioAvailability.findIndex(a => a.date.slice(0,10) === date && a.artist_slug === artist.slug);
        const entry = { date, is_available: true, client_name: null, session_time: null, type: 'booking', artist_slug: artist.slug, artist_name: artist.name, has_booking: false };
        if (idx >= 0) { studioAvailability[idx] = entry; } else { studioAvailability.push(entry); }
        renderCalendar();
      } else {
        window.toast('Failed to mark date', 'error');
      }
    } catch {
      window.toast('Error marking date', 'error');
    }
  }

  async function bookDate(date, clientName, sessionTime, type) {
    try {
      const res = await authFetch('/api/artist/availability', {
        method: 'POST',
        body:   JSON.stringify({ date, is_available: true, client_name: clientName, session_time: sessionTime || null, type }),
      });
      if (res.status === 409) { window.toast('No slots available for this date', 'error'); return; }
      if (res.ok) {
        window.toast(`${type === 'consultation' ? 'Consultation' : 'Booking'} saved — ${clientName}`, 'success');
        const idx = studioAvailability.findIndex(a => a.date.slice(0,10) === date && a.artist_slug === artist.slug);
        const entry = { date, is_available: true, client_name: clientName, session_time: sessionTime || null, type, artist_slug: artist.slug, artist_name: artist.name, has_booking: false };
        if (idx >= 0) { studioAvailability[idx] = { ...studioAvailability[idx], ...entry }; }
        else { studioAvailability.push(entry); }
        renderCalendar();
      } else {
        window.toast('Failed to save session', 'error');
      }
    } catch {
      window.toast('Error saving session', 'error');
    }
  }

  async function deleteDate(date) {
    try {
      const res = await authFetch(`/api/artist/availability/${date}`, { method: 'DELETE' });
      if (res.ok) {
        window.toast('Session deleted', 'info');
        studioAvailability = studioAvailability.filter(a => !(a.date.slice(0,10) === date && a.artist_slug === artist.slug));
        renderCalendar();
      } else {
        window.toast('Failed to delete session', 'error');
      }
    } catch {
      window.toast('Error deleting session', 'error');
    }
  }

  calPrev.addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
  });

  calNext.addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar();
  });

  const calHeader = document.querySelector('.cal-header');
  if (calHeader) {
    const todayBtn = document.createElement('button');
    todayBtn.className = 'cal-today-btn';
    todayBtn.textContent = 'Today';
    todayBtn.addEventListener('click', () => {
      currentYear  = today.getFullYear();
      currentMonth = today.getMonth();
      renderCalendar();
    });
    calHeader.appendChild(todayBtn);
  }

  // ── Profile ──
  let profileStyles = [];

  let _completenessProfile = null;
  let _completenessPhotos  = null;
  let _liveModalSeen       = localStorage.getItem('art_profile_live_seen') === '1';
  let _wasPublic           = null;

  function profileChecks() {
    return {
      bio:       !!((_completenessProfile && _completenessProfile.bio || '').trim()),
      photo:     !!(_completenessPhotos && _completenessPhotos.profileUrl),
      portfolio: !!(_completenessPhotos && (_completenessPhotos.portfolio || []).length > 0),
      styles:    profileStyles.length > 0,
      contact:   !!(_completenessProfile && (_completenessProfile.whatsapp_url || _completenessProfile.booking_url)),
    };
  }

  function updateCompleteness() {
    if (!_completenessProfile || !_completenessPhotos) return;
    const checks = profileChecks();
    const keys   = Object.keys(checks);
    const done   = keys.filter(k => checks[k]).length;
    const pct    = Math.round((done / keys.length) * 100);
    const fill   = document.getElementById('completenessFill');
    const label  = document.getElementById('completenessLabel');
    const bar    = document.getElementById('completenessBar');
    if (!fill || !label || !bar) return;
    fill.style.width = pct + '%';
    keys.forEach(k => {
      const el = document.getElementById('cStep-' + k);
      if (el) el.classList.toggle('completeness-step--done', checks[k]);
    });
    if (done === keys.length) {
      label.textContent = isGuest ? '✓ Profile complete — your profile is live' : '✓ Profile complete';
      bar.classList.add('completeness-bar--ready');
    } else {
      const labels = { bio: 'Bio', photo: 'Photo', portfolio: 'Portfolio', styles: 'Styles', contact: 'Contact' };
      const left   = keys.filter(k => !checks[k]).map(k => labels[k]);
      label.textContent = isGuest
        ? done + ' of ' + keys.length + ' done — complete your profile to go live (missing: ' + left.join(', ') + ')'
        : done + ' of ' + keys.length + ' complete';
      bar.classList.remove('completeness-bar--ready');
    }
  }

  async function syncVisibility() {
    if (!isGuest) return;
    try {
      const res  = await authFetch('/api/artist/sync-visibility', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) return;
      if (data.is_public && !_liveModalSeen) {
        _liveModalSeen = true;
        localStorage.setItem('art_profile_live_seen', '1');
        showProfileLiveModal();
      } else if (!data.is_public && _wasPublic === true) {
        const miss = (data.missing || []).join(', ');
        window.toast('Your profile is no longer visible on the site' + (miss ? ' — missing: ' + miss : ''), 'info');
      }
      _wasPublic = !!data.is_public;
    } catch {}
  }

  function showProfileLiveModal() {
    const url = window.location.origin + '/artist.html?slug=' + encodeURIComponent(artist.slug);
    const modal = document.createElement('div');
    modal.id = 'liveModal';
    modal.className = 'dash-modal-overlay open';
    modal.innerHTML = `
      <div class="dash-modal dash-modal--sm">
        <p class="dash-modal-tag">You're live</p>
        <h2 class="dash-modal-title">Your profile is now public</h2>
        <p class="dash-modal-text">Clients can now find you on the Appreciart website. Take a look at how your profile appears.</p>
        <div class="dash-modal-actions dash-modal-actions--row">
          <a class="btn btn-primary" href="${esc(url)}" target="_blank" rel="noopener">View my profile</a>
          <button class="btn btn-secondary" id="liveModalClose">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('liveModalClose').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  }

async function loadProfile() {
    try {
      const res  = await authFetch('/api/artist/me');
      const data = await res.json();
      const a    = data.artist;
      document.getElementById('profileBio').value       = a.bio || '';
      const _bioCounter = document.getElementById('bioCounter');
      if (_bioCounter) _bioCounter.textContent = (a.bio || '').length + ' / 600';
      document.getElementById('profileInstagram').value = a.instagram || '';
      const waField = document.getElementById('profileWhatsapp');
      if (waField) {
        const waNum = a.whatsapp_url ? a.whatsapp_url.replace('https://wa.me/', '') : '';
        waField.value = waNum;
      }
      const bookingField = document.getElementById('profileBookingUrl');
      if (bookingField) bookingField.value = a.booking_url || '';
      profileStyles = a.styles || [];
      renderProfileStyles();
      _completenessProfile = {
        bio:          a.bio          || '',
        whatsapp_url: a.whatsapp_url || '',
        booking_url:  a.booking_url  || '',
      };
      _wasPublic = !!a.is_public;
      updateCompleteness();
      snapshotProfile();
    } catch {
      window.toast('Could not load profile', 'error');
    }
  }

  function renderProfileStyles() {
    const container = document.getElementById('profileStyles');
    if (!container) return;
    container.innerHTML = profileStyles.map((s, i) => `
      <span class="profile-style-tag">
        ${esc(s)}
        <button class="profile-style-remove" data-idx="${i}" aria-label="Remove">×</button>
      </span>
    `).join('');
    container.querySelectorAll('.profile-style-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        profileStyles.splice(parseInt(btn.dataset.idx, 10), 1);
        renderProfileStyles();
        updateCompleteness();
        checkDirty();
      });
    });
  }

  const profileStyleBtn   = document.getElementById('profileStyleBtn');
  const profileStyleInput = document.getElementById('profileStyleInput');
  const profileSaveBtn    = document.getElementById('profileSaveBtn');

  if (profileStyleBtn) {
    profileStyleBtn.addEventListener('click', () => {
      const val      = profileStyleInput.value.trim();
      const hintEl   = document.getElementById('stylesHint');
      if (profileStyles.length >= 3) {
        if (hintEl) hintEl.textContent = '3 styles max — remove one to add another';
        return;
      }
      if (!val || profileStyles.includes(val)) return;
      profileStyles.push(val);
      profileStyleInput.value = '';
      if (hintEl) hintEl.textContent = profileStyles.length >= 3 ? '3 styles max — remove one to add another' : 'Add up to 3';
      renderProfileStyles();
      updateCompleteness();
      checkDirty();
    });
    profileStyleInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') profileStyleBtn.click();
    });
  }

  let _profileSnapshot  = null;
  let _profileDirty     = false;

  function snapshotProfile() {
    const bioEl     = document.getElementById('profileBio');
    const igEl      = document.getElementById('profileInstagram');
    const waEl      = document.getElementById('profileWhatsapp');
    const bookEl    = document.getElementById('profileBookingUrl');
    _profileSnapshot = {
      bio:         bioEl    ? bioEl.value.trim()  : '',
      instagram:   igEl     ? igEl.value.trim()   : '',
      whatsapp:    waEl     ? waEl.value.trim()   : '',
      booking_url: bookEl   ? bookEl.value.trim() : '',
      styles:      JSON.stringify(profileStyles),
    };
    _profileDirty = false;
    if (profileSaveBtn) profileSaveBtn.disabled = true;
  }

  function checkDirty() {
    if (!_profileSnapshot) return;
    const bioEl  = document.getElementById('profileBio');
    const igEl   = document.getElementById('profileInstagram');
    const waEl   = document.getElementById('profileWhatsapp');
    const bookEl = document.getElementById('profileBookingUrl');
    const current = {
      bio:         bioEl    ? bioEl.value.trim()  : '',
      instagram:   igEl     ? igEl.value.trim()   : '',
      whatsapp:    waEl     ? waEl.value.trim()   : '',
      booking_url: bookEl   ? bookEl.value.trim() : '',
      styles:      JSON.stringify(profileStyles),
    };
    _profileDirty = Object.keys(current).some(k => current[k] !== _profileSnapshot[k]);
    if (profileSaveBtn) profileSaveBtn.disabled = !_profileDirty;
  }

  const _bioEl = document.getElementById('profileBio');
  const _bioCounterEl = document.getElementById('bioCounter');
  if (_bioEl && _bioCounterEl) {
    _bioEl.addEventListener('input', () => {
      _bioCounterEl.textContent = _bioEl.value.length + ' / 600';
      if (_bioEl.value.length > 540) {
        _bioCounterEl.classList.add('bio-counter--warn');
      } else {
        _bioCounterEl.classList.remove('bio-counter--warn');
      }
    });
  }

  const _profileFields = ['profileBio', 'profileInstagram', 'profileWhatsapp', 'profileBookingUrl'];
  _profileFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      if (_completenessProfile) {
        const waEl   = document.getElementById('profileWhatsapp');
        const bookEl = document.getElementById('profileBookingUrl');
        const waNum  = waEl ? waEl.value.trim() : '';
        _completenessProfile.bio          = (document.getElementById('profileBio')?.value || '').trim();
        _completenessProfile.whatsapp_url = waNum ? 'https://wa.me/' + waNum : '';
        _completenessProfile.booking_url  = bookEl ? bookEl.value.trim() : '';
      }
      updateCompleteness();
      checkDirty();
    });
  });

  window.addEventListener('beforeunload', (e) => {
    if (_profileDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  if (profileSaveBtn) {
    profileSaveBtn.addEventListener('click', async () => {
      const bio          = document.getElementById('profileBio').value.trim();
      const instagram    = document.getElementById('profileInstagram').value.trim();
      const waEl         = document.getElementById('profileWhatsapp');
      const waRaw        = waEl ? waEl.value.trim().replace(/\D/g, '') : '';
      const whatsapp_url = waRaw ? `https://wa.me/${waRaw}` : undefined;
      const bookingEl    = document.getElementById('profileBookingUrl');
      const booking_url  = bookingEl ? bookingEl.value.trim() : undefined;
      profileSaveBtn.disabled  = true;
      profileSaveBtn.innerHTML = '<svg class="btn-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg> Saving…';
      try {
        const res = await authFetch('/api/artist/profile', {
          method: 'PATCH',
          body:   JSON.stringify({ bio, instagram, styles: profileStyles, whatsapp_url, booking_url }),
        });
        if (res.ok) {
          window.toast('Profile updated', 'success');
          snapshotProfile();
          syncVisibility();
        } else {
          window.toast('Failed to save profile', 'error');
        }
      } catch {
        window.toast('Error saving profile', 'error');
      } finally {
        profileSaveBtn.disabled    = !_profileDirty;
        profileSaveBtn.textContent = 'Save changes';
      }
    });
  }

  // ── Photos ──
  function showConfirmModal(message, confirmLabel = 'Confirm', cancelLabel = 'Cancel') {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'dash-modal-overlay open';
      modal.innerHTML = `
        <div class="dash-modal dash-modal--sm">
          <p class="dash-modal-tag">Confirm</p>
          <p class="dash-modal-title dash-modal-title--sm" id="confirmMessage"></p>
          <div class="dash-modal-actions dash-modal-actions--row">
            <button class="btn btn-secondary" id="confirmCancel">${cancelLabel}</button>
            <button class="btn btn-primary" id="confirmOk">${confirmLabel}</button>
          </div>
        </div>
      `;
      modal.querySelector('#confirmMessage').textContent = message;
      document.body.appendChild(modal);
      modal.querySelector('#confirmOk').addEventListener('click', () => { modal.remove(); resolve(true); });
      modal.querySelector('#confirmCancel').addEventListener('click', () => { modal.remove(); resolve(false); });
    });
  }

  async function getUploadSignature(type, existingPublicId = null) {
    const res = await authFetch('/api/artist/upload-signature', {
      method: 'POST',
      body:   JSON.stringify({ type, existingPublicId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Could not get upload signature');
    }
    return res.json();
  }

  async function uploadToCloudinary(file, sig) {
    const form = new FormData();
    form.append('file',      file);
    form.append('api_key',   sig.apiKey);
    form.append('timestamp', String(sig.timestamp));
    form.append('signature', sig.signature);
    form.append('public_id', sig.publicId);
    form.append('folder',    sig.folder);
    form.append('overwrite', sig.overwrite ? 'true' : 'false');

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${sig.cloud}/image/upload`,
      { method: 'POST', body: form, signal: AbortSignal.timeout(30000) }
    );
    if (!res.ok) throw new Error('Upload to Cloudinary failed');
    return res.json();
  }

  async function loadPhotos(bustCache = false) {
    const preview  = document.getElementById('profilePhotoPreview');
    const grid     = document.getElementById('portfolioGrid');
    const countEl  = document.getElementById('portfolioCount');
    const addBtn   = document.getElementById('portfolioPhotoBtn');

    if (grid) grid.innerHTML = '<span class="profile-photo-empty">Loading...</span>';

    try {
      const res  = await authFetch('/api/artist/photos');
      const data = await res.json();
      _completenessPhotos = { profileUrl: data.profileUrl || null, portfolio: data.portfolio || [] };
      updateCompleteness();
      syncVisibility();

      if (preview) {
        if (data.profileUrl) {
          const img = document.createElement('img');
          if (data.profileUrl && data.profileUrl.startsWith('https://')) {
            img.src = bustCache ? data.profileUrl + '?v=' + Date.now() : data.profileUrl;
          }
          img.alt       = 'Profile photo';
          img.className = 'profile-photo-img';
          img.addEventListener('error', () => {
            preview.innerHTML = '<span class="profile-photo-empty">No photo yet</span>';
          });
          preview.innerHTML = '';
          preview.appendChild(img);
        } else {
          preview.innerHTML = '<span class="profile-photo-empty">No photo yet</span>';
        }
      }

      if (grid) {
        if (data.portfolio && data.portfolio.length) {
          grid.innerHTML = data.portfolio.map(p => `
            <div class="portfolio-thumb" data-public-id="${esc(p.publicId)}" data-public-id-bare="${esc(p.publicIdBare || '')}">
              <img src="${esc(p.url)}" alt="Portfolio image" loading="lazy">
              <div class="portfolio-overlay">
                <button class="portfolio-replace-btn" aria-label="Replace image">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="portfolio-delete-btn" aria-label="Remove image">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
          `).join('');

          grid.querySelectorAll('.portfolio-replace-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              const thumb    = btn.closest('.portfolio-thumb');
              const publicId     = thumb.dataset.publicId;
              const publicIdBare = thumb.dataset.publicIdBare || '';
              if (!publicId) return;

              const input = document.createElement('input');
              input.type   = 'file';
              input.accept = 'image/jpeg,image/png,image/webp';
              input.addEventListener('change', async () => {
                const file = input.files[0];
                if (!file) return;
                if (file.size > 10 * 1024 * 1024) { window.toast('File too large (max 10MB)', 'error'); return; }
                btn.disabled = true;
                try {
                  const sig = await getUploadSignature('portfolio', publicIdBare || publicId);
                  await uploadToCloudinary(file, sig);
                  window.toast('Image replaced', 'success');
                  loadPhotos();
                } catch (err) {
                  window.toast(err.message || 'Replace failed', 'error');
                  btn.disabled = false;
                }
              });
              input.click();
            });
          });

          grid.querySelectorAll('.portfolio-delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
              const thumb    = btn.closest('.portfolio-thumb');
              const publicId = thumb.dataset.publicId;
              if (!publicId) return;

              const confirmed = await showConfirmModal('Remove this image from your portfolio?', 'Remove', 'Cancel');
              if (!confirmed) return;

              btn.disabled = true;
              try {
                const res = await authFetch('/api/artist/photos/portfolio', {
                  method:  'DELETE',
                  body:    JSON.stringify({ publicId, publicIdBare: thumb.dataset.publicIdBare || '' }),
                });
                if (res.ok) {
                  thumb.remove();
                  window.toast('Image removed', 'info');
                  loadPhotos();
                } else {
                  window.toast('Failed to remove image', 'error');
                  btn.disabled = false;
                }
              } catch {
                window.toast('Error removing image', 'error');
                btn.disabled = false;
              }
            });
          });
        } else {
          grid.innerHTML = '<p class="dash-empty"><svg class="dash-empty-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="0"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>No portfolio images yet.<span class="dash-empty-sub">Upload 3–5 of your best work — clients preview these before booking.</span></p>';
        }
      }

      if (countEl) countEl.textContent = `(${data.count}/16)`;
      if (addBtn)  addBtn.disabled = data.count >= 16;

    } catch {
      window.toast('Could not load photos', 'error');
      if (grid) grid.innerHTML = '<span class="profile-photo-empty">Could not load images</span>';
    }
  }

  const profilePhotoBtn   = document.getElementById('profilePhotoBtn');
  const profilePhotoInput = document.getElementById('profilePhotoInput');
  const portfolioPhotoBtn   = document.getElementById('portfolioPhotoBtn');
  const portfolioPhotoInput = document.getElementById('portfolioPhotoInput');

  if (profilePhotoBtn) {
    profilePhotoBtn.addEventListener('click', () => profilePhotoInput.click());
    profilePhotoInput.addEventListener('change', async () => {
      const file = profilePhotoInput.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { window.toast('File too large (max 10MB)', 'error'); return; }
      profilePhotoBtn.disabled  = true;
      profilePhotoBtn.innerHTML = '<svg class="btn-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg> Uploading…';
      try {
        const sig  = await getUploadSignature('profile');
        await uploadToCloudinary(file, sig);
        window.toast('Profile photo updated', 'success');
        setTimeout(() => loadPhotos(true), 1500);
      } catch (err) {
        window.toast(err.message || 'Upload failed', 'error');
      } finally {
        profilePhotoBtn.disabled    = false;
        profilePhotoBtn.textContent = 'Upload profile photo';
        profilePhotoInput.value     = '';
      }
    });
  }

  if (portfolioPhotoBtn) {
    portfolioPhotoBtn.addEventListener('click', () => portfolioPhotoInput.click());
    portfolioPhotoInput.addEventListener('change', async () => {
      const file = portfolioPhotoInput.files[0];
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { window.toast('File too large (max 10MB)', 'error'); return; }
      portfolioPhotoBtn.disabled  = true;
      portfolioPhotoBtn.innerHTML = '<svg class="btn-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg> Uploading…';
      try {
        const sig  = await getUploadSignature('portfolio');
        await uploadToCloudinary(file, sig);
        window.toast('Portfolio image added', 'success');
        setTimeout(loadPhotos, 1500);
      } catch (err) {
        window.toast(err.message || 'Upload failed', 'error');
      } finally {
        portfolioPhotoBtn.disabled    = false;
        portfolioPhotoBtn.textContent = 'Add portfolio image';
        portfolioPhotoInput.value     = '';
      }
    });
  }

  loadBookings();
  loadAvailability();
  loadProfile();
  loadPhotos();
  initSSE();

  // Silent token refresh every 13 minutes (access token expires at 15min)
  setInterval(async () => {
    try {
      const res = await fetch(`${INTERNAL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        _token = data.token;
        localStorage.setItem('art_token', _token);
      }
    } catch {}
  }, 13 * 60 * 1000);

  // Refresh token when tab becomes visible again after inactivity
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const res = await fetch(`${INTERNAL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        _token = data.token;
        localStorage.setItem('art_token', _token);
      } else {
        localStorage.removeItem('art_token');
        localStorage.removeItem('art_artist');
        window.location.href = 'login.html';
      }
    } catch {}
  });

  // ── Change Password Modal ──
  function showChangePasswordModal() {
    const modal = document.createElement('div');
    modal.id = 'pwModal';
    modal.className = 'dash-modal-overlay open';
    modal.innerHTML = `
      <div class="dash-modal">
        <p class="dash-modal-tag">Welcome to Appreciart IE</p>
        <h2 class="dash-modal-title">Set your password</h2>
        <div class="form-field">
          <label class="form-label" for="pwOld">Temporary password</label>
          <input class="form-input" type="password" id="pwOld" placeholder="From your approval email" autocomplete="current-password">
        </div>
        <div class="form-field">
          <label class="form-label" for="pwNew">New password</label>
          <input class="form-input" type="password" id="pwNew" placeholder="Minimum 8 characters" autocomplete="new-password">
        </div>
        <div class="form-field">
          <label class="form-label" for="pwConfirm">Confirm password</label>
          <input class="form-input" type="password" id="pwConfirm" placeholder="Repeat password" autocomplete="new-password">
        </div>
        <p class="dash-modal-err" id="pwErr"></p>
        <div class="dash-modal-actions">
          <button class="btn btn-primary" id="pwSave">Save password</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('pwSave').addEventListener('click', async () => {
      const old = document.getElementById('pwOld').value;
      const pw  = document.getElementById('pwNew').value;
      const pw2 = document.getElementById('pwConfirm').value;
      const err = document.getElementById('pwErr');

      if (!old) { err.textContent = 'Temporary password is required'; err.style.display = 'block'; return; }
      if (pw.length < 8) { err.textContent = 'Password must be at least 8 characters'; err.style.display = 'block'; return; }
      if (pw !== pw2)    { err.textContent = 'Passwords do not match'; err.style.display = 'block'; return; }
      err.style.display = 'none';

      try {
        const res = await authFetch('/api/artist/change-password', {
          method: 'POST',
          body:   JSON.stringify({ old_password: old, password: pw }),
        });
        if (!res.ok) { err.textContent = 'Failed to save password'; err.style.display = 'block'; return; }

        // Update stored artist
        const stored = JSON.parse(localStorage.getItem('art_artist') || '{}');
        stored.must_change_password = false;
        localStorage.setItem('art_artist', JSON.stringify(stored));

        modal.remove();
        window.toast('Password updated', 'success');

        if (artist.role === 'guest' && !artist.onboarding_done) {
          showOnboardingModal();
        }
      } catch {
        err.textContent = 'Something went wrong. Please try again.';
        err.style.display = 'block';
        err.classList.add('dash-modal-err');
      }
    });
  }

  // ── Onboarding Modal ──
  function showOnboardingModal() {
    const modal = document.createElement('div');
    modal.id = 'onboardingModal';
    modal.className = 'dash-modal-overlay open';
    modal.innerHTML = `
      <div class="dash-modal">
        <p class="dash-modal-tag">Guest Artist</p>
        <h2 class="dash-modal-title">You're in — here's how it works.</h2>
        <div class="dash-modal-divider"></div>
        <div class="dash-modal-body">
          <div class="dash-modal-step">
            <span class="dash-modal-step-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </span>
            <div class="dash-modal-step-content">
              <h4>Complete your profile</h4>
              <p>Add your bio, photo, portfolio, styles and a contact method — your profile goes live on the site as soon as it's complete.</p>
            </div>
          </div>
          <div class="dash-modal-step">
            <span class="dash-modal-step-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </span>
            <div class="dash-modal-step-content">
              <h4>Mark your sessions</h4>
              <p>When you book a client, come back here and add their name and time to your calendar. This keeps the studio updated.</p>
            </div>
          </div>
          <div class="dash-modal-step">
            <span class="dash-modal-step-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </span>
            <div class="dash-modal-step-content">
              <h4>Clients contact you directly</h4>
              <p>We don't handle bookings for guests — your WhatsApp and booking link on your profile are how clients reach you.</p>
            </div>
          </div>
          <div class="dash-modal-step">
            <span class="dash-modal-step-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </span>
            <div class="dash-modal-step-content">
              <h4>Questions?</h4>
              <p>Reply to the email we sent or reach us on WhatsApp anytime.</p>
            </div>
          </div>
        </div>
        <div class="dash-modal-actions">
          <button class="btn btn-primary" id="onboardingDone">Got it — let's go</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('onboardingDone').addEventListener('click', async () => {
      try {
        await authFetch('/api/artist/onboarding-done', { method: 'POST' });
        const stored = JSON.parse(localStorage.getItem('art_artist') || '{}');
        stored.onboarding_done = true;
        localStorage.setItem('art_artist', JSON.stringify(stored));
      } catch {}
      modal.remove();
    });
  }
})();