'use strict';

(function () {
  const INTERNAL = 'https://appreciart-internal-production-ee3c.up.railway.app';

  const token  = sessionStorage.getItem('art_token') || localStorage.getItem('art_token');
  const stored = sessionStorage.getItem('art_artist') || localStorage.getItem('art_artist');

  if (!token || !stored) { window.location.href = 'login.html'; return; }

  let artist;
  try { artist = JSON.parse(stored); } catch {
    window.toast('Invalid session. Please sign in again.', 'error');
    setTimeout(() => { window.location.href = 'login.html'; }, 800);
    return;
  }

  const ARTIST_COLOURS = {
    'moreirart': { bg: '#2E7D32', text: '#ffffff' },
    'marina':    { bg: '#E64A19', text: '#ffffff' },
    'renan':     { bg: '#1565C0', text: '#ffffff' },
  };

  function getArtistColour(slug) {
    return ARTIST_COLOURS[slug] || { bg: '#636363', text: '#ffffff' };
  }

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
    return fetch(`${INTERNAL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(12000),
    });
  }

  // ── Bookings ──
  async function loadBookings() {
    try {
      const res = await authFetch('/api/artist/bookings');
      if (res.status === 401) {
        window.toast('Session expired. Please sign in again.', 'error');
        setTimeout(() => { window.location.href = 'login.html'; }, 800);
        return;
      }
      const data = await res.json();

      if (!data.bookings || data.bookings.length === 0) {
        bookingsList.innerHTML = '<p class="dash-empty">No bookings yet.</p>';
        return;
      }

      bookingsList.innerHTML = data.bookings.map(b => `
        <div class="booking-card">
          <span class="booking-client">${esc(b.client_name)}</span>
          <span class="booking-meta">${esc(b.style || '—')} · ${esc(b.date ? b.date.slice(0,10) : 'TBD')}</span>
          <span class="booking-badge${b.deposit_paid ? ' paid' : ''}">${b.deposit_paid ? 'Deposit paid' : esc(b.stage || 'novo_lead')}</span>
        </div>
      `).join('');

    } catch {
      window.toast('Could not load bookings', 'error');
      bookingsList.innerHTML = '<p class="dash-empty">Could not load bookings. Please refresh.</p>';
    }
  }

  // ── Calendar ──
  const today = new Date();
  today.setHours(0,0,0,0);

  let currentYear        = today.getFullYear();
  let currentMonth       = today.getMonth();
  let studioAvailability = [];

  async function loadAvailability() {
    try {
      const res = await authFetch('/api/artist/studio-availability');
      if (res.status === 401) {
        window.toast('Session expired. Please sign in again.', 'error');
        setTimeout(() => { window.location.href = 'login.html'; }, 800);
        return;
      }
      const data = await res.json();
      studioAvailability = data.availability || [];
      renderCalendar();
    } catch {
      window.toast('Could not load availability dates', 'error');
      studioAvailability = [];
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
      const entries = getDayEntries(dateStr);
      const myEntry = entries.find(e => e.artist_slug === artist.slug);
      const others  = entries.filter(e => e.artist_slug !== artist.slug);

      // Build event bars
      const bars = entries.map(e => {
        const isMine        = e.artist_slug === artist.slug;
        const isConsultation = e.type === 'consultation';
        const label = e.session_time ? e.session_time : '';
        return `<span class="cal-bar"
          data-slug="${esc(e.artist_slug)}"
          data-mine="${isMine}"
          data-consultation="${isConsultation}"
          data-tooltip="${esc(e.artist_name)}${e.session_time ? ' · ' + e.session_time : ''}${e.type ? ' · ' + e.type : ''}"
          >${label}</span>`;
      }).join('');

      let cls = 'cal-day';
      if (past) cls += ' past';
      if (myEntry) cls += ' has-mine';

      const canClick = !past;
      html += `<div class="${cls}" data-date="${dateStr}" ${canClick ? '' : 'data-readonly="true"'}>
        <span class="cal-day-num">${d}</span>
        ${bars ? `<span class="cal-bars">${bars}</span>` : ''}
      </div>`;
    }

    calGrid.innerHTML = html;

    // Apply colours via JS (CSP safe)
    calGrid.querySelectorAll('.cal-bar[data-slug]').forEach(bar => {
      const col            = getArtistColour(bar.dataset.slug);
      const isConsultation = bar.dataset.consultation === 'true';
      bar.style.background = col.bg;
      bar.style.color      = col.text;
      if (isConsultation) bar.style.opacity = '0.45';
    });

    // Tooltip
    calGrid.querySelectorAll('.cal-bar[data-tooltip]').forEach(bar => {
      bar.addEventListener('mouseenter', e => showTooltip(e, bar.dataset.tooltip));
      bar.addEventListener('mouseleave', hideTooltip);
    });

    // Click handlers
    calGrid.querySelectorAll('.cal-day:not(.empty):not(.past)').forEach(el => {
      el.addEventListener('click', () => handleDayClick(el));
    });
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
    const date    = el.dataset.date;
    const myEntry = studioAvailability.find(e => e.date.slice(0,10) === date && e.artist_slug === artist.slug);
    const friendly = new Date(date + 'T00:00:00').toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });

    if (myEntry) {
      showViewModal(date, friendly, myEntry);
    } else {
      // Fetch slots before showing modal
      try {
        const res  = await authFetch(`/api/artist/slots/${date}`);
        const data = await res.json();
        showBookModal(date, friendly, data.available || 0, data.total || 4);
      } catch {
        showBookModal(date, friendly, 4, 4);
      }
    }
  }

  // ── Modal: book ──
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
        <div class="cal-modal-field">
          <label class="cal-modal-label" for="calClientName">Client name</label>
          <input class="cal-modal-input" id="calClientName" type="text" placeholder="Client name" autocomplete="off">
        </div>
        <div class="cal-modal-field">
          <label class="cal-modal-label" for="calSessionTime">Time</label>
          <input class="cal-modal-input" id="calSessionTime" type="text" placeholder="e.g. 14:00" autocomplete="off" maxlength="5">
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
        // Consultation doesn't block slots — re-enable confirm
        const confirmBtn = document.getElementById('calModalConfirm');
        if (selectedType === 'consultation') {
          confirmBtn.disabled = false;
        } else {
          confirmBtn.disabled = noSlots;
        }
      });
    });

    const nameInput = document.getElementById('calClientName');
    const timeInput = document.getElementById('calSessionTime');
    setTimeout(() => nameInput.focus(), 200);

    document.getElementById('calModalConfirm').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.classList.add('cal-modal-input--error'); return; }
      removeModal();
      bookDate(date, name, timeInput.value.trim(), selectedType);
    });

    document.getElementById('calModalCancel').addEventListener('click', removeModal);
    modal.addEventListener('click', e => { if (e.target === modal) removeModal(); });
    document.addEventListener('keydown', onEsc);

    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') timeInput.focus(); });
    timeInput.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('calModalConfirm').click(); });
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
        ${entry.client_name ? `<p class="cal-modal-client">${esc(entry.client_name)}</p>` : ''}
        ${entry.session_time ? `<p class="cal-modal-time">${esc(entry.session_time)}</p>` : ''}
        <div class="cal-modal-actions">
          <button class="btn btn-secondary btn-sm cal-btn-delete" id="calModalDelete">Delete</button>
          <button class="btn btn-primary btn-sm" id="calModalClose">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('open'));

    document.getElementById('calModalDelete').addEventListener('click', () => {
      removeModal();
      deleteDate(date);
    });
    document.getElementById('calModalClose').addEventListener('click', removeModal);
    modal.addEventListener('click', e => { if (e.target === modal) removeModal(); });
    document.addEventListener('keydown', onEsc);
  }

  function onEsc(e) {
    if (e.key === 'Escape') { removeModal(); document.removeEventListener('keydown', onEsc); }
  }

  function removeModal() {
    const m = document.getElementById('calModal');
    if (m) { m.classList.remove('open'); setTimeout(() => m.remove(), 250); }
    document.removeEventListener('keydown', onEsc);
  }

  async function bookDate(date, clientName, sessionTime, type) {
    try {
      const res = await authFetch('/api/artist/availability', {
        method: 'POST',
        body:   JSON.stringify({ date, is_available: true, client_name: clientName, session_time: sessionTime || null, type }),
      });

      if (res.status === 409) {
        window.toast('No slots available for this date', 'error');
        return;
      }

      if (res.ok) {
        window.toast(`${type === 'consultation' ? 'Consultation' : 'Booking'} added — ${clientName}`, 'success');
        const idx = studioAvailability.findIndex(a => a.date.slice(0,10) === date && a.artist_slug === artist.slug);
        const entry = { date, is_available: true, client_name: clientName, session_time: sessionTime || null, type, artist_slug: artist.slug, artist_name: artist.name, has_booking: false };
        if (idx >= 0) { studioAvailability[idx] = { ...studioAvailability[idx], ...entry }; }
        else { studioAvailability.push(entry); }
        renderCalendar();
      } else {
        window.toast('Failed to add session', 'error');
      }
    } catch {
      window.toast('Error adding session', 'error');
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

  // ── Nav ──
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

  // ── Today button ──
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

  loadBookings();
  loadAvailability();
})();