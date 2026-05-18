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
  let currentYear        = new Date().getFullYear();
  let currentMonth       = new Date().getMonth();
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

  function getDayData(dateStr) {
    return studioAvailability.filter(a => a.date.slice(0, 10) === dateStr);
  }

  function renderCalendar() {
    const months = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
    calMonth.textContent = `${months[currentMonth]} ${currentYear}`;

    const days   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const today  = new Date();
    today.setHours(0,0,0,0);

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
      const entries = getDayData(dateStr);

      const myEntry = entries.find(e => e.artist_slug === artist.slug);
      const others  = entries.filter(e => e.artist_slug !== artist.slug);

      // Build dots for other artists
      const dots = others.map(e => {
        const col = getArtistColour(e.artist_slug);
        return `<span class="cal-dot-artist" style="background:${col.bg}" title="${esc(e.artist_name)}"></span>`;
      }).join('');

      let cls       = 'cal-day';
      let colourKey = '';
      let readonly  = false;

      if (past) {
        cls += ' past';
        readonly = true;
      } else if (myEntry) {
        // My day — booked with client
        const col = getArtistColour(artist.slug);
        colourKey = `background:${col.bg};color:${col.text};`;
        cls += ' my-booked';
      } else {
        // Empty — available to book
        cls += ' neutral';
      }

      if (readonly) {
        html += `<div class="${cls}" data-date="${dateStr}" data-readonly="true">
          ${d}${dots ? `<span class="cal-others">${dots}</span>` : ''}
        </div>`;
      } else {
        const clientName = myEntry ? (myEntry.client_name || '') : '';
        html += `<div class="${cls}" data-date="${dateStr}" data-colour="${colourKey}" data-client="${esc(clientName)}" data-mine="true">
          ${d}${dots ? `<span class="cal-others">${dots}</span>` : ''}
        </div>`;
      }
    }

    calGrid.innerHTML = html;

    calGrid.querySelectorAll('.cal-day[data-colour]').forEach(el => {
      const col = el.dataset.colour;
      if (col) el.style.cssText = col;
    });

    calGrid.querySelectorAll('.cal-day[data-mine="true"]').forEach(el => {
      el.addEventListener('click', () => handleDayClick(el));
    });
  }

  function handleDayClick(el) {
    const date       = el.dataset.date;
    const isBooked   = el.classList.contains('my-booked');
    const clientName = el.dataset.client || '';
    const friendly   = new Date(date + 'T00:00:00').toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });

    if (isBooked) {
      showBookedModal(date, friendly, clientName);
    } else {
      showBookModal(date, friendly);
    }
  }

  // ── Modal: book a date ──
  function showBookModal(date, friendly) {
    removeModal();
    const modal = document.createElement('div');
    modal.id = 'calModal';
    modal.className = 'cal-modal-overlay';
    modal.innerHTML = `
      <div class="cal-modal-box">
        <p class="cal-modal-date">${esc(friendly)}</p>
        <p class="cal-modal-title">Book this date</p>
        <div class="cal-modal-field">
          <label class="cal-modal-label" for="calClientName">Client name</label>
          <input class="cal-modal-input" id="calClientName" type="text" placeholder="Client name" autocomplete="off">
        </div>
        <div class="cal-modal-actions">
          <button class="btn btn-primary btn-sm" id="calModalConfirm">Confirm booking</button>
          <button class="btn btn-secondary btn-sm" id="calModalCancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('open'));

    const input = document.getElementById('calClientName');
    setTimeout(() => input.focus(), 200);

    document.getElementById('calModalConfirm').addEventListener('click', () => {
      const name = input.value.trim();
      if (!name) { input.classList.add('cal-modal-input--error'); return; }
      removeModal();
      bookDate(date, name);
    });

    document.getElementById('calModalCancel').addEventListener('click', removeModal);
    modal.addEventListener('click', e => { if (e.target === modal) removeModal(); });
    document.addEventListener('keydown', onEsc);

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('calModalConfirm').click();
    });
  }

  // ── Modal: view/cancel a booked date ──
  function showBookedModal(date, friendly, clientName) {
    removeModal();
    const modal = document.createElement('div');
    modal.id = 'calModal';
    modal.className = 'cal-modal-overlay';
    modal.innerHTML = `
      <div class="cal-modal-box">
        <p class="cal-modal-date">${esc(friendly)}</p>
        <p class="cal-modal-title">Booked</p>
        ${clientName ? `<p class="cal-modal-client">${esc(clientName)}</p>` : ''}
        <div class="cal-modal-actions">
          <button class="btn btn-secondary btn-sm" id="calModalUnbook">Cancel booking</button>
          <button class="btn btn-primary btn-sm" id="calModalClose">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('open'));

    document.getElementById('calModalUnbook').addEventListener('click', () => {
      removeModal();
      unbookDate(date);
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

  async function bookDate(date, clientName) {
    try {
      const res = await authFetch('/api/artist/availability', {
        method: 'POST',
        body:   JSON.stringify({ date, is_available: true, client_name: clientName }),
      });

      if (res.ok) {
        window.toast(`Booked — ${clientName}`, 'success');
        const idx = studioAvailability.findIndex(a => a.date.slice(0,10) === date && a.artist_slug === artist.slug);
        if (idx >= 0) {
          studioAvailability[idx].client_name  = clientName;
          studioAvailability[idx].is_available = true;
        } else {
          studioAvailability.push({ date, is_available: true, client_name: clientName, artist_slug: artist.slug, artist_name: artist.name, has_booking: false });
        }
        renderCalendar();
      } else {
        window.toast('Failed to book date', 'error');
      }
    } catch {
      window.toast('Error booking date', 'error');
    }
  }

  async function unbookDate(date) {
    try {
      const res = await authFetch(`/api/artist/availability/${date}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        window.toast('Booking cancelled', 'info');
        studioAvailability = studioAvailability.filter(a => !(a.date.slice(0,10) === date && a.artist_slug === artist.slug));
        renderCalendar();
      } else {
        window.toast('Failed to cancel booking', 'error');
      }
    } catch {
      window.toast('Error cancelling booking', 'error');
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

  loadBookings();
  loadAvailability();
})();