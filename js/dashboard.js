'use strict';

(function () {
  const INTERNAL = 'https://appreciart-internal-production-ee3c.up.railway.app';

  const token  = localStorage.getItem('art_token');
  const stored = localStorage.getItem('art_artist');

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

  // ── SSE ──
  function initSSE() {
    const es = new EventSource(`${INTERNAL}/api/events?token=${encodeURIComponent(token)}`);
    es.addEventListener('availability_update', () => {
      loadAvailability(false);
    });
    es.onerror = () => {
      setTimeout(initSSE, 10000);
    };
  }

  // ── Bookings ──
  const STAGE_LABELS = {
    'novo_lead':     'New lead',
    'contactado':    'Contacted',
    'deposito_pago': 'Deposit paid',
    'confirmado':    'Confirmed',
    'concluido':     'Completed',
    'cancelado':     'Cancelled',
  };

  const STAGES = Object.keys(STAGE_LABELS);

  function stageLabel(s) { return STAGE_LABELS[s] || s; }

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

      const now      = new Date(); now.setHours(0,0,0,0);
      const upcoming = data.bookings.filter(b => !b.date || new Date(b.date) >= now);
      const past     = data.bookings.filter(b => b.date && new Date(b.date) < now);

      function renderCards(list) {
        return list.map(b => `
          <div class="booking-card booking-card--clickable" data-id="${b.id}">
            <span class="booking-client">${esc(b.client_name)}</span>
            <span class="booking-meta">${esc(b.date ? b.date.slice(0,10) : 'TBD')}</span>
            <span class="booking-badge${b.deposit_paid ? ' paid' : ''}">${b.deposit_paid ? 'Deposit paid' : stageLabel(b.stage)}</span>
          </div>
        `).join('');
      }

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
        const id = card.dataset.id;
        const booking = data.bookings.find(b => String(b.id) === id);
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
        <div class="cal-modal-field" style="margin-top:20px">
          <label class="cal-modal-label" for="bmStage">Status</label>
          <select class="cal-modal-input cal-modal-select" id="bmStage">
            ${STAGES.map(s => `<option value="${s}"${b.stage === s ? ' selected' : ''}>${stageLabel(s)}</option>`).join('')}
          </select>
        </div>
        <div class="cal-modal-field">
          <label class="cal-modal-label" for="bmNotes">Notes</label>
          <input class="cal-modal-input" id="bmNotes" type="text" value="${esc(b.notes || '')}" placeholder="Internal notes">
        </div>
        <div class="cal-modal-actions">
          <button class="btn btn-primary btn-sm" id="bmSave">Save</button>
          <button class="btn btn-secondary btn-sm" id="bmClose">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
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

  async function loadAvailability(showToast = true) {
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
      if (showToast) window.toast('Could not load availability dates', 'error');
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

      const bars = entries.map(e => {
        const isMine         = e.artist_slug === artist.slug;
        const isConsultation = e.type === 'consultation';
        const isAvailable    = e.is_available && !e.client_name;
        const typeLabel      = e.type === 'consultation' ? 'Consult' : '';
        const timeLabel      = e.session_time || '';
        const label          = isAvailable ? 'Available' : [timeLabel, typeLabel].filter(Boolean).join(' · ');
        return `<span class="cal-bar${isAvailable ? ' cal-bar--available' : ''}"
          data-slug="${esc(e.artist_slug)}"
          data-mine="${isMine}"
          data-consultation="${isConsultation}"
          data-available="${isAvailable}"
          data-tooltip="${isAvailable ? esc(e.artist_name) + ' · Available' : esc(e.artist_name) + (e.session_time ? ' · ' + e.session_time : '') + (e.type ? ' · ' + e.type : '')}"
          >${label}</span>`;
      }).join('');

      let cls = 'cal-day';
      if (past) cls += ' past';

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

    // Tooltip
    calGrid.querySelectorAll('.cal-bar[data-tooltip]').forEach(bar => {
      bar.addEventListener('mouseenter', e => showTooltip(e, bar.dataset.tooltip));
      bar.addEventListener('mouseleave', hideTooltip);
      if (bar.dataset.mine === 'false') {
        bar.addEventListener('click', e => e.stopPropagation());
      }
    });

    // Click handlers
    calGrid.querySelectorAll('.cal-day:not(.empty):not(.past)').forEach(el => {
      el.addEventListener('click', () => handleDayClick(el));
    });

    // Update legend
    updateLegend();
  }

  // ── Legend ──
  function updateLegend() {
    const legend = document.querySelector('.cal-legend');
    if (!legend) return;

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
    const myEntry  = studioAvailability.find(e => e.date.slice(0,10) === date && e.artist_slug === artist.slug);
    const friendly = new Date(date + 'T00:00:00').toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });

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
        showNewModal(date, friendly, data.available || 0, data.total || 4);
      } catch {
        showNewModal(date, friendly, 4, 4);
      }
    }
  }

  // ── Modal: empty day ──
  function showNewModal(date, friendly, slotsAvailable, slotsTotal) {
    removeModal();
    const noSlots = slotsAvailable === 0;
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
          <button class="btn btn-primary btn-sm" id="calModalMarkAvail">Mark available</button>
          <button class="btn btn-secondary btn-sm" id="calModalBookClient" ${noSlots ? 'disabled' : ''}>Book client</button>
          <button class="btn btn-secondary btn-sm" id="calModalCancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('open'));

    document.getElementById('calModalMarkAvail').addEventListener('click', () => {
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
        <div class="cal-modal-field">
          <label class="cal-modal-label" for="calClientName">Client name</label>
          <input class="cal-modal-input" id="calClientName" type="text" placeholder="Client name" autocomplete="off">
        </div>
        <div class="cal-modal-field">
          <label class="cal-modal-label" for="calSessionTime">Time</label>
          <select class="cal-modal-input cal-modal-select" id="calSessionTime">
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
      if (!name) { nameInput.classList.add('cal-modal-input--error'); return; }
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
        <div class="cal-modal-field">
          <label class="cal-modal-label" for="calEditName">Client name</label>
          <input class="cal-modal-input" id="calEditName" type="text" value="${esc(entry.client_name || '')}" autocomplete="off">
        </div>
        <div class="cal-modal-field">
          <label class="cal-modal-label" for="calEditTime">Time</label>
          <select class="cal-modal-input cal-modal-select" id="calEditTime">
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
        <div class="cal-modal-actions" style="margin-top:24px">
          <button class="btn btn-primary btn-sm" id="calModalSave">Save</button>
          <button class="btn btn-secondary btn-sm cal-btn-delete" id="calModalDelete">Delete</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('open'));

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
      if (!name) { document.getElementById('calEditName').classList.add('cal-modal-input--error'); return; }
      removeModal();
      bookDate(date, name, time, selectedType);
    });

    document.getElementById('calModalDelete').addEventListener('click', () => {
      removeModal();
      deleteDate(date);
    });

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

  loadBookings();
  loadAvailability();
  initSSE();
})();