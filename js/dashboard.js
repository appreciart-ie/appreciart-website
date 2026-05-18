'use strict';

(function () {
  const INTERNAL = 'https://appreciart-internal-production-ee3c.up.railway.app';

  // ── Auth guard ──
  const token  = sessionStorage.getItem('art_token') || localStorage.getItem('art_token');
  const stored = sessionStorage.getItem('art_artist') || localStorage.getItem('art_artist');

  if (!token || !stored) { window.location.href = 'login.html'; return; }

  let artist;
  try { artist = JSON.parse(stored); } catch {
    window.toast('Invalid session. Please sign in again.', 'error');
    setTimeout(() => { window.location.href = 'login.html'; }, 800);
    return;
  }

  // ── Artist colours ──
  const ARTIST_COLOURS = {
    'moreirart': { bg: '#2E7D32', text: '#ffffff' },
    'marina':    { bg: '#E64A19', text: '#ffffff' },
    'renan':     { bg: '#1565C0', text: '#ffffff' },
  };

  function getArtistColour(slug) {
    return ARTIST_COLOURS[slug] || { bg: '#636363', text: '#ffffff' };
  }

  // ── DOM ──
  const tabs         = document.querySelectorAll('.dash-tab');
  const panels       = document.querySelectorAll('.dash-panel');
  const bookingsList = document.getElementById('bookingsList');
  const calGrid      = document.getElementById('calGrid');
  const calMonth     = document.getElementById('calMonth');
  const calPrev      = document.getElementById('calPrev');
  const calNext      = document.getElementById('calNext');

  // ── Tabs ──
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // ── Auth fetch ──
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
  let currentYear  = new Date().getFullYear();
  let currentMonth = new Date().getMonth();
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

    const days    = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const today   = new Date();
    today.setHours(0,0,0,0);

    const first   = new Date(currentYear, currentMonth, 1);
    const total   = new Date(currentYear, currentMonth + 1, 0).getDate();
    let startDay  = first.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;

    let html = days.map(d => `<div class="cal-day-label">${d}</div>`).join('');

    for (let i = 0; i < startDay; i++) html += `<div class="cal-day empty"></div>`;

    for (let d = 1; d <= total; d++) {
      const date    = new Date(currentYear, currentMonth, d);
      const dateStr = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const past    = date < today;
      const entries = getDayData(dateStr);

      // My own entry for this day
      const myEntry = entries.find(e => e.artist_slug === artist.slug);

      // Other artists available on this day
      const others  = entries.filter(e => e.artist_slug !== artist.slug && e.is_available);

      // Is this day booked (has confirmed booking)
      const isBooked = myEntry && myEntry.has_booking;

      // Build colour dots for other artists
      const dots = others.map(e => {
        const col = getArtistColour(e.artist_slug);
        return `<span class="cal-dot-artist" style="background:${col.bg}" title="${esc(e.artist_name)}"></span>`;
      }).join('');

      let cls  = 'cal-day';
      let style = '';
      let canToggle = false;

      if (past) {
        cls += ' past';
      } else if (isBooked) {
        cls += ' booked';
      } else if (myEntry && myEntry.is_available) {
        const col = getArtistColour(artist.slug);
        style = `background:${col.bg};color:${col.text};`;
        cls += ' my-available';
        canToggle = true;
      } else if (myEntry && !myEntry.is_available) {
        cls += ' unavailable';
        canToggle = true;
      } else {
        cls += ' neutral';
        canToggle = true;
      }

      html += `<div class="${cls}" style="${style}" data-date="${dateStr}" ${canToggle && !past ? '' : 'data-readonly="true"'}>
        ${d}
        ${dots ? `<span class="cal-others">${dots}</span>` : ''}
      </div>`;
    }

    calGrid.innerHTML = html;

    calGrid.querySelectorAll('.cal-day:not(.empty):not(.past):not(.booked)[data-readonly!="true"]').forEach(el => {
      el.addEventListener('click', () => confirmToggle(el));
    });
  }

  // ── Confirm modal ──
  function confirmToggle(el) {
    const date     = el.dataset.date;
    const isAvail  = el.classList.contains('my-available');
    const action   = isAvail ? 'mark as unavailable' : 'mark as available';
    const friendly = new Date(date + 'T00:00:00').toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });

    showConfirm(
      `${friendly}`,
      `Do you want to ${action} this date?`,
      () => toggleDate(el, date, !isAvail)
    );
  }

  function showConfirm(title, body, onConfirm) {
    const existing = document.getElementById('calConfirmModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'calConfirmModal';
    modal.className = 'cal-modal-overlay';
    modal.innerHTML = `
      <div class="cal-modal-box">
        <p class="cal-modal-title">${esc(title)}</p>
        <p class="cal-modal-body">${esc(body)}</p>
        <div class="cal-modal-actions">
          <button class="btn btn-primary btn-sm" id="calConfirmYes">Confirm</button>
          <button class="btn btn-secondary btn-sm" id="calConfirmNo">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('open'));

    function close() { modal.classList.remove('open'); setTimeout(() => modal.remove(), 250); }

    document.getElementById('calConfirmYes').addEventListener('click', () => { close(); onConfirm(); });
    document.getElementById('calConfirmNo').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
  }

  async function toggleDate(el, date, newState) {
    el.style.opacity = '0.5';
    el.style.pointerEvents = 'none';

    try {
      const res = await authFetch('/api/artist/availability', {
        method: 'POST',
        body:   JSON.stringify({ date, is_available: newState }),
      });

      if (res.ok) {
        window.toast(newState ? 'Date marked as available' : 'Date marked as unavailable', 'success');
        const idx = studioAvailability.findIndex(a => a.date.slice(0,10) === date && a.artist_slug === artist.slug);
        if (idx >= 0) {
          studioAvailability[idx].is_available = newState;
        } else {
          studioAvailability.push({ date, is_available: newState, artist_slug: artist.slug, artist_name: artist.name, has_booking: false });
        }
        renderCalendar();
      } else {
        window.toast('Failed to update date', 'error');
        el.style.opacity = '';
        el.style.pointerEvents = '';
      }
    } catch {
      window.toast('Error updating date', 'error');
      el.style.opacity = '';
      el.style.pointerEvents = '';
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

  // ── Init ──
  loadBookings();
  loadAvailability();
})();