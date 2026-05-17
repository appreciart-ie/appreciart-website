'use strict';

(function () {
  const INTERNAL = 'https://appreciart-internal-production-ee3c.up.railway.app';

  // ── Auth guard ──
  const token  = sessionStorage.getItem('art_token') || localStorage.getItem('art_token');
  const stored = sessionStorage.getItem('art_artist') || localStorage.getItem('art_artist');

  if (!token || !stored) {
    window.location.href = 'login.html';
    return;
  }

  let artist;
  try { artist = JSON.parse(stored); } catch { toast('Invalid session data. Please sign in again.', 'error'); setTimeout(() => { window.location.href = 'login.html'; }, 800); return; }

  // ── DOM ──
  const dashName    = document.getElementById('dashName');
  const dashSignOut = document.getElementById('dashSignOut');
  const tabs        = document.querySelectorAll('.dash-tab');
  const panels      = document.querySelectorAll('.dash-panel');
  const bookingsList = document.getElementById('bookingsList');
  const calGrid     = document.getElementById('calGrid');
  const calMonth    = document.getElementById('calMonth');
  const calPrev     = document.getElementById('calPrev');
  const calNext     = document.getElementById('calNext');

  dashName.textContent = artist.name || 'Artist';

  // ── Sign out ──
  if (dashSignOut) dashSignOut.addEventListener('click', () => {
    sessionStorage.removeItem('art_token');
    sessionStorage.removeItem('art_artist');
    localStorage.removeItem('art_token');
    localStorage.removeItem('art_artist');
    window.toast('Signed out successfully', 'info');
    setTimeout(() => { window.location.href = 'login.html'; }, 600);
  });

  // ── Tabs ──
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });


  // ── Auth fetch helper ──
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
      const res  = await authFetch('/api/artist/bookings');
      if (res.status === 401) { toast('Session expired. Please sign in again.', 'error'); setTimeout(() => { window.location.href = 'login.html'; }, 800); return; }
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
      toast('Could not load bookings', 'error');
      bookingsList.innerHTML = '<p class="dash-empty">Could not load bookings. Please refresh.</p>';
    }
  }

  // ── Calendar ──
  let currentYear  = new Date().getFullYear();
  let currentMonth = new Date().getMonth();
  let availability = [];

  async function loadAvailability() {
    try {
      const res  = await authFetch('/api/artist/availability');
      if (res.status === 401) { toast('Session expired. Please sign in again.', 'error'); setTimeout(() => { window.location.href = 'login.html'; }, 800); return; }
      const data = await res.json();
      availability = data.availability || [];
      renderCalendar();
    } catch {
      toast('Could not load availability dates', 'error');
      availability = [];
      renderCalendar();
    }
  }

  function getDateState(dateStr) {
    const entry = availability.find(a => a.date.slice(0, 10) === dateStr);
    if (!entry) return 'neutral';
    if (!entry.is_available) return 'unavailable';
    return 'available';
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
      const state   = getDateState(dateStr);

      html += `<div class="cal-day ${past ? 'past' : state}" data-date="${dateStr}">${d}</div>`;
    }

    calGrid.innerHTML = html;

    calGrid.querySelectorAll('.cal-day:not(.empty):not(.past):not(.booked)').forEach(el => {
      el.addEventListener('click', () => toggleDate(el));
    });
  }

  async function toggleDate(el) {
    const date     = el.dataset.date;
    const isAvail  = el.classList.contains('available');
    const newState = isAvail ? false : true;

    el.style.opacity = '0.5';
    el.style.pointerEvents = 'none';

    try {
      const res = await authFetch('/api/artist/availability', {
        method: 'POST',
        body:   JSON.stringify({ date, is_available: newState }),
      });

      if (res.ok) {
        toast(newState ? 'Date marked as available' : 'Date marked as unavailable', 'success');
        const idx = availability.findIndex(a => a.date.slice(0,10) === date);
        if (idx >= 0) {
          availability[idx].is_available = newState;
        } else {
          availability.push({ date, is_available: newState });
        }
        renderCalendar();
      } else {
        toast('Failed to update date', 'error');
        el.style.opacity = '';
        el.style.pointerEvents = '';
      }
    } catch {
      toast('Error updating date', 'error');
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