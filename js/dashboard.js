'use strict';

(function () {
  const INTERNAL = 'https://api.appreciart.ie';

  let _token = localStorage.getItem('art_token');
  let _refreshPromise = null;
  // Background refreshes (13-min timer, visibilitychange) can get a 401 that is
  // NOT a dead session: on iOS the ITP may withhold the sameSite:none refresh
  // cookie, and the backend then answers 401 for a session that is still valid.
  // The two cases are indistinguishable from here, so background handlers only
  // flag; only an authFetch driven by a real user action may end the session.
  let _sessionSuspect = false;
  function refreshAccessToken() {
    if (_refreshPromise) return _refreshPromise;
    _refreshPromise = fetch(`${INTERNAL}/api/auth/refresh`, {
      method: 'POST', credentials: 'include', signal: AbortSignal.timeout(8000),
    }).then(r => {
      if (r.ok) return r.json().then(d => ({ ok: true, token: d.token, status: r.status }));
      return { ok: false, status: r.status };
    }).catch(() => ({ ok: false, status: 0 }))
      .finally(() => { _refreshPromise = null; });
    return _refreshPromise;
  }
  const stored = localStorage.getItem('art_artist');

  if (!_token || !stored) { window.location.href = 'login.html'; return; }

  let artist;
  try { artist = JSON.parse(stored); } catch {
    localStorage.removeItem('art_token');
    localStorage.removeItem('art_artist');
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

  // Standalone (installed PWA) detection — hoisted so early setup below can
  // remove (not just CSS-hide) any element that links out of the calendar.
  const _standalone = !!(window.isStandalone && window.isStandalone());
  if (_standalone) {
    const siteLink = document.querySelector('.dash-topbar-site');
    if (siteLink) siteLink.remove();
    const publicProfileLink = document.getElementById('profileViewLink');
    if (publicProfileLink) publicProfileLink.remove();
  }

  // Set once loadProfile() resolves: a guest whose residency has ended. When true
  // the dashboard renders normally but all interactivity is stripped (read-only).
  let isFrozen = false;


  const whatsappField = document.getElementById('whatsappField');
  if (whatsappField) whatsappField.style.display = isGuest ? 'block' : 'none';
  const bookingUrlField = document.getElementById('bookingUrlField');
  if (bookingUrlField) bookingUrlField.style.display = isGuest ? 'block' : 'none';
  const countryField = document.getElementById('countryField');
  if (countryField) countryField.style.display = isGuest ? 'block' : 'none';

  // Options are built once here; loadProfile() only sets .value afterwards.
  const _countrySelect = document.getElementById('profileCountry');
  if (_countrySelect && Array.isArray(window.COUNTRIES)) {
    _countrySelect.innerHTML = ['<option value="">— Select country —</option>']
      .concat(window.COUNTRIES.map(c => `<option value="${esc(c)}">${esc(c)}</option>`))
      .join('');
  }

  // "View public profile" link in the Profile tab header — same URL as the live modal.
  const profileViewLink = document.getElementById('profileViewLink');
  if (profileViewLink && artist.slug) {
    profileViewLink.href = window.location.origin + '/artist.html?slug=' + encodeURIComponent(artist.slug);
    profileViewLink.hidden = false;
  }

  // Completeness panel is guest-only; for residents it would render empty, so hide it.
  if (!isGuest) {
    const _cbar = document.getElementById('completenessBar');
    if (_cbar) _cbar.style.display = 'none';
  }

  // Completeness chips scroll to (and focus) their field when clicked.
  document.querySelectorAll('.completeness-step').forEach(chip => {
    chip.addEventListener('click', () => {
      const target = document.getElementById(chip.dataset.target);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (typeof target.focus === 'function') {
        try { target.focus({ preventScroll: true }); } catch { target.focus(); }
      }
    });
  });

  const tabs         = document.querySelectorAll('.dash-tab');
  const panels       = document.querySelectorAll('.dash-panel');
  const bookingsList = document.getElementById('bookingsList');
  const calGrid      = document.getElementById('calGrid');
  const calMonth     = document.getElementById('calMonth');
  const calPrev      = document.getElementById('calPrev');
  const calNext      = document.getElementById('calNext');

  function activateTab(name, persist = true) {
    const tab = Array.from(tabs).find(t => t.dataset.tab === name);
    const panel = document.getElementById(`tab-${name}`);
    if (!tab || !panel) return;
    tabs.forEach(t => t.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    panel.classList.add('active');
    if (persist) localStorage.setItem('art_active_tab', name);
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  });

  // URL ?tab= (used by the installed PWA's start_url) is a one-time override:
  // it must not clobber the artist's persisted last-active-tab preference.
  const _urlTab = new URLSearchParams(window.location.search).get('tab');
  const _savedTab = localStorage.getItem('art_active_tab');
  if (_urlTab && document.getElementById(`tab-${_urlTab}`)) {
    activateTab(_urlTab, false);
  } else if (_savedTab) {
    activateTab(_savedTab);
  }

  // ── PWA: service worker, standalone mode, install hint ──
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  if (_standalone) {
    document.body.classList.add('pwa-standalone');
    activateTab('availability', false);
  }

  (function setupInstallHint() {
    if (_standalone) return;

    // Dismissal (× or a declined native prompt) snoozes the hint for 30 days
    // rather than silencing it forever. Legacy '1' values are treated as a
    // dismissal with no timestamp — snooze from first sight instead of never.
    const HINT_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
    const HINT_KEY = 'art_pwa_hint_dismissed';
    function snoozeHint() {
      try { localStorage.setItem(HINT_KEY, String(Date.now())); } catch {}
    }
    const _dismissedRaw = localStorage.getItem(HINT_KEY);
    if (_dismissedRaw) {
      const at = Number(_dismissedRaw);
      if (!Number.isFinite(at) || at === 1) { snoozeHint(); return; }
      if (Date.now() - at < HINT_SNOOZE_MS) return;
      localStorage.removeItem(HINT_KEY);
    }

    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua);
    const isMobile = isIos || /Android/i.test(ua);
    if (!isMobile) return;

    let deferredPrompt = null;

    function buildBanner(text, buttonLabel, onButton) {
      const panel = document.getElementById('tab-availability');
      if (!panel || document.getElementById('pwaInstallHint')) return;
      const banner = document.createElement('div');
      banner.className = 'pwa-hint';
      banner.id = 'pwaInstallHint';
      const msg = document.createElement('span');
      msg.className = 'pwa-hint-text';
      msg.textContent = text;
      banner.appendChild(msg);
      if (buttonLabel) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pwa-hint-install';
        btn.textContent = buttonLabel;
        btn.addEventListener('click', onButton);
        banner.appendChild(btn);
      }
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'pwa-hint-close';
      close.setAttribute('aria-label', 'Dismiss');
      close.textContent = '×';
      close.addEventListener('click', () => {
        snoozeHint();
        banner.remove();
      });
      banner.appendChild(close);
      const header = panel.querySelector('.dash-panel-header');
      if (header) header.insertAdjacentElement('afterend', banner);
      else panel.prepend(banner);
    }

    if (isIos) {
      buildBanner('Add your calendar to the home screen: tap Share, then "Add to Home Screen".');
    } else {
      function showAndroidBanner(e) {
        deferredPrompt = e;
        buildBanner('Install your calendar as an app on this phone.', 'Install', async () => {
          if (!deferredPrompt) return;
          deferredPrompt.prompt();
          const choice = await deferredPrompt.userChoice;
          deferredPrompt = null;
          window.__pwaInstallPrompt = null;
          // Declining snoozes on the same 30-day clock as the × button, so the
          // two dismissal paths no longer behave differently.
          if (!choice || choice.outcome !== 'accepted') snoozeHint();
          const el = document.getElementById('pwaInstallHint');
          if (el) el.remove();
        });
      }

      // beforeinstallprompt can fire before this script runs; an inline handler
      // in <head> stashes the event, so check for it first.
      if (window.__pwaInstallPrompt) showAndroidBanner(window.__pwaInstallPrompt);
      else window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        window.__pwaInstallPrompt = e;
        showAndroidBanner(e);
      });
    }
  })();

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
      const refreshRes = await refreshAccessToken();
      if (refreshRes.ok) {
        _token = refreshRes.token;
        localStorage.setItem('art_token', _token);
        res = await doFetch(_token);
      } else if (refreshRes.status === 401) {
        // Real auth rejection: the refresh token itself is invalid/expired.
        localStorage.removeItem('art_token');
        localStorage.removeItem('art_artist');
        window.toast('Session expired. Please sign in again.', 'error');
        setTimeout(() => { window.location.href = 'login.html'; }, 800);
        throw new Error('session expired');
      } else {
        // Network error (status 0) or server hiccup: keep the session — the
        // refresh cookie is still valid, so a retry can succeed.
        window.toast('Connection issue — please try again', 'error');
        throw new Error('refresh unavailable');
      }
    }

    return res;
  }

  // ── SSE ──
  let _sseRetries = 0;
  const SSE_MAX_RETRIES = 5;

  // Persistent stale-data note shown once SSE gives up for good.
  function showSseStaleNotice() {
    if (document.getElementById('sseStaleNotice')) return;
    const anchor = document.querySelector('.cal-header') || calGrid;
    if (!anchor || !anchor.parentNode) return;
    const note = document.createElement('p');
    note.id = 'sseStaleNotice';
    note.textContent = 'Live updates paused — refresh the page to reconnect.';
    note.style.fontSize   = '11px';
    note.style.color      = '#636363';
    note.style.margin     = '8px 0 0';
    note.style.textAlign  = 'right';
    anchor.parentNode.insertBefore(note, anchor.nextSibling);
  }

  function hideSseStaleNotice() {
    const note = document.getElementById('sseStaleNotice');
    if (note) note.remove();
  }

  // Discreet, non-blocking. Mirrors showSseStaleNotice(): CSSOM only, no inline
  // style attributes (CSP style-src 'self').
  function markSessionSuspect() {
    if (_sessionSuspect) return;
    _sessionSuspect = true;
    const dashTabs = document.getElementById('dashTabs');
    if (!dashTabs || !dashTabs.parentNode) return;
    if (document.getElementById('sessionSuspectNotice')) return;
    const note = document.createElement('p');
    note.id = 'sessionSuspectNotice';
    note.textContent = 'Connection issue — try refreshing if you get logged out unexpectedly.';
    note.style.fontSize = '11px';
    note.style.color    = '#636363';
    note.style.margin   = '0 0 12px';
    dashTabs.parentNode.insertBefore(note, dashTabs);
  }

  function clearSessionSuspect() {
    _sessionSuspect = false;
    const note = document.getElementById('sessionSuspectNotice');
    if (note) note.remove();
  }

  function initSSE() {
    const es = new EventSource(`${INTERNAL}/api/events?token=${encodeURIComponent(_token)}`);
    es.addEventListener('availability_update', () => {
      loadAvailability(false);
    });
    es.addEventListener('booking_update', () => {
      loadBookings();
    });
    es.addEventListener('artist_update', async () => {
      try {
        const res  = await authFetch('/api/artist/me');
        const data = await res.json();
        const a    = data.artist;
        if (!a) return;
        artist.name              = a.name;
        artist.role              = a.role;
        artist.is_resident       = a.is_resident;
        artist.guest_start_date  = a.guest_start_date;
        artist.guest_end_date    = a.guest_end_date;
        localStorage.setItem('art_artist', JSON.stringify(artist));
        loadAvailability(false);
      } catch {}
    });
    es.onopen = () => { _sseRetries = 0; hideSseStaleNotice(); };
    es.onerror = () => {
      es.close();
      if (_sseRetries >= SSE_MAX_RETRIES) { showSseStaleNotice(); return; }
      _sseRetries++;
      const delay = Math.min(10000 * Math.pow(2, _sseRetries - 1), 120000);
      setTimeout(async () => {
        try {
          const res = await refreshAccessToken();
          if (res.ok) {
            // Refresh the token so the reconnect carries a valid one, but do NOT
            // reset _sseRetries here — a working refresh cookie says nothing
            // about /api/events being reachable. Only es.onopen (a real
            // connection) may reset the backoff.
            _token = res.token;
            localStorage.setItem('art_token', _token);
          }
        } catch {}
        initSSE();
      }, delay);
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

  // Parse a date as a LOCAL calendar day. `new Date('2026-07-31')` is parsed as
  // UTC midnight, which lands on the previous day in negative-offset timezones.
  // Accepts both 'YYYY-MM-DD' and full ISO timestamps.
  function localDay(dateStr) {
    return new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  }

  function relativeDate(dateStr) {
    if (!dateStr) return 'TBD';
    const today = new Date(); today.setHours(0,0,0,0);
    const d     = localDay(dateStr); d.setHours(0,0,0,0);
    const diff  = Math.round((d - today) / 86400000);
    if (diff === 0)  return 'Today';
    if (diff === 1)  return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
  }

  function renderCards(list) {
    return list.map(b => `
      <div class="booking-card booking-card--clickable" data-id="${esc(String(b.id))}" data-source="${esc(String(b.source_type))}">
        <span class="booking-client">${esc(b.client_name)}</span>
        <span class="booking-meta">${esc(relativeDate(b.date))}</span>
        <span class="booking-badge${b.deposit_paid ? ' paid' : ''}">${b.deposit_paid ? 'Deposit paid' : stageLabel(b.stage)}</span>
      </div>
    `).join('');
  }

  let _bookingsRequestId = 0;

  async function loadBookings() {
    const requestId = ++_bookingsRequestId;

    // First load only — SSE/edit refreshes keep the current list until data arrives.
    if (!bookingsList.innerHTML.trim()) {
      bookingsList.innerHTML = '<p class="dash-empty">Loading sessions…</p>';
    }
    try {
      const res  = await authFetch('/api/artist/sessions');
      if (!res.ok) throw new Error('sessions fetch failed: ' + res.status);
      const data = await res.json();
      if (requestId !== _bookingsRequestId) return;

      const data_sessions = data.sessions || data.bookings || [];
      if (!data_sessions.length) {
        bookingsList.innerHTML = '<p class="dash-empty"><svg class="dash-empty-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="0"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>No sessions yet.<span class="dash-empty-sub">Sessions you log on the Availability tab will appear here.</span></p>';
        return;
      }

      const now      = new Date(); now.setHours(0,0,0,0);
      const upcoming = data_sessions.filter(b => !b.date || localDay(b.date) >= now);
      const past     = data_sessions.filter(b => b.date && localDay(b.date) < now);

      

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

      if (!isFrozen) {
        bookingsList.querySelectorAll('.booking-card').forEach(card => {
          const booking = data_sessions.find(b => String(b.id) === card.dataset.id && b.source_type === card.dataset.source);
          if (booking) card.addEventListener('click', () => showBookingModal(booking));
        });
      }

    } catch {
      if (requestId !== _bookingsRequestId) return;
      window.toast('Could not load sessions', 'error');
      bookingsList.innerHTML = '<p class="dash-empty dash-empty--error">Could not load sessions — try refreshing.</p>';
    }
  }

  // Module-level close/esc pair — mirrors removeModal()/onEsc() for the calendar
  // modals. A per-invocation closure would leak: replacing the modal node does
  // not detach the document-level keydown listener that closure registered.
  function removeBookingModal() {
    const m = document.getElementById('bookingModal');
    if (m) { m.classList.remove('open'); setTimeout(() => m.remove(), 250); }
    document.removeEventListener('keydown', onBookingEsc);
  }
  function onBookingEsc(e) { if (e.key === 'Escape') removeBookingModal(); }

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
        ${b.source_type === 'availability' ? '' : `
        <div class="form-field" id="bmStageField">
          <label class="form-label" for="bmStage">Status</label>
          <select class="form-input form-select" id="bmStage">
            ${STAGES.map(s => `<option value="${s}"${b.stage === s ? ' selected' : ''}>${stageLabel(s)}</option>`).join('')}
          </select>
        </div>`}
        ${b.source_type === 'booking' || b.source_type === 'availability' ? `
        <div class="form-field">
          <label class="form-label" for="bmDate">Date</label>
          <input class="form-input" id="bmDate" type="date" value="${esc(b.date ? b.date.slice(0,10) : '')}">
        </div>` : ''}
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
    const bmStageField = document.getElementById('bmStageField');
    if (bmStageField) bmStageField.style.marginTop = '20px';
    requestAnimationFrame(() => {
      modal.classList.add('open');

      // Apply read-only mode in PWA standalone
      if (_standalone) {
        document.getElementById('bmDate')?.setAttribute('disabled', 'disabled');
        document.getElementById('bmStage')?.setAttribute('disabled', 'disabled');
        document.getElementById('bmNotes')?.setAttribute('disabled', 'disabled');
        document.getElementById('bmSave').hidden = true;
      }
    });

    document.addEventListener('keydown', onBookingEsc);

    document.getElementById('bmClose').addEventListener('click', removeBookingModal);
    modal.addEventListener('click', e => { if (e.target === modal) removeBookingModal(); });

    document.getElementById('bmSave').addEventListener('click', async () => {
      const saveBtn = document.getElementById('bmSave');
      const stageEl = document.getElementById('bmStage');
      const stage = stageEl ? stageEl.value : b.stage;
      const notes = document.getElementById('bmNotes').value.trim();
      setBtnBusy(saveBtn, true);
      try {
        const isAvailability = b.source_type === 'availability';
        const endpoint = isAvailability
          ? `/api/artist/availability/${b.id}`
          : `/api/artist/bookings/${b.id}`;
        let body;
        const dateEl = document.getElementById('bmDate');
        const dateChanged = dateEl && dateEl.value && dateEl.value !== (b.date ? b.date.slice(0,10) : '');
        if (isAvailability) {
          const payload = { notes };
          if (dateChanged) payload.date = dateEl.value;
          body = JSON.stringify(payload);
        } else {
          const payload = { stage, notes };
          if (dateChanged) payload.date = dateEl.value;
          body = JSON.stringify(payload);
        }
        const res = await authFetch(endpoint, {
          method: 'PATCH',
          body,
        });
        if (res.ok) {
          window.toast('Session updated', 'success');
          removeBookingModal();
          loadBookings();
        } else {
          let msg = 'Failed to update booking';
          try {
            const data = await res.json();
            if (data && data.error) msg = data.error;
          } catch { /* keep generic message */ }
          window.toast(msg, 'error');
          setBtnBusy(saveBtn, false, 'Save');
        }
      } catch {
        window.toast('Error updating booking', 'error');
        setBtnBusy(saveBtn, false, 'Save');
      }
    });
  }

  // ── Consent Forms ──
  const consentList = document.getElementById('consentList');

  function consentName(f) {
    return [f.client_first_name, f.client_last_name].filter(Boolean).join(' ').trim() || 'Unnamed';
  }

  function consentDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function consentFlagPills(f) {
    const flags = [
      { on: f.has_medical,     label: 'Medical' },
      { on: f.has_medications, label: 'Medications' },
      { on: f.has_bloodborne,  label: 'Bloodborne' },
    ].filter(x => x.on);
    if (!flags.length) return '<span class="consent-flags"><span class="consent-flag consent-flag--clear">No flags</span></span>';
    return `<span class="consent-flags">${flags.map(x => `<span class="consent-flag consent-flag--alert">${esc(x.label)}</span>`).join('')}</span>`;
  }

  async function loadConsent() {
    if (!consentList) return;
    if (!consentList.innerHTML.trim()) {
      consentList.innerHTML = '<p class="dash-empty">Loading consent forms…</p>';
    }
    try {
      const res  = await authFetch('/api/artist/consent');
      if (!res.ok) throw new Error('consent fetch failed: ' + res.status);
      const data = await res.json();
      const forms = Array.isArray(data) ? data : (data.consent_forms || []);

      if (!forms.length) {
        consentList.innerHTML = '<p class="dash-empty"><svg class="dash-empty-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>No consent forms yet.<span class="dash-empty-sub">Forms clients submit before their session will appear here.</span></p>';
        return;
      }

      const sorted = forms.slice().sort((a, b) => new Date(b.submitted_at || 0) - new Date(a.submitted_at || 0));
      consentList.innerHTML = `<div class="bookings-list-inner">${sorted.map(f => `
        <div class="booking-card booking-card--clickable consent-card" data-id="${esc(String(f.id))}">
          <span class="booking-client">${esc(consentName(f))}</span>
          <span class="booking-meta">${esc(consentDate(f.submitted_at))}</span>
          ${consentFlagPills(f)}
        </div>
      `).join('')}</div>`;

      consentList.querySelectorAll('.consent-card').forEach(card => {
        const form = sorted.find(f => String(f.id) === card.dataset.id);
        if (form) card.addEventListener('click', () => showConsentModal(form));
      });
    } catch {
      window.toast('Could not load consent forms', 'error');
      consentList.innerHTML = '<p class="dash-empty">Could not load consent forms. Please refresh.</p>';
    }
  }

  function removeConsentModal() {
    const m = document.getElementById('consentModal');
    if (m) { m.classList.remove('open'); setTimeout(() => m.remove(), 250); }
    document.removeEventListener('keydown', onConsentEsc);
  }
  function onConsentEsc(e) { if (e.key === 'Escape') removeConsentModal(); }

  function showConsentModal(f) {
    const existing = document.getElementById('consentModal');
    if (existing) existing.remove();

    const row = (label, value) => value
      ? `<p class="consent-modal-row"><span class="consent-modal-label">${esc(label)}</span><span class="consent-modal-value">${esc(String(value))}</span></p>`
      : '';

    const flagBlock = (on, label, details) => {
      if (!on) return `<p class="consent-modal-row"><span class="consent-modal-label">${esc(label)}</span><span class="consent-modal-value consent-modal-value--clear">None declared</span></p>`;
      return `<p class="consent-modal-row"><span class="consent-modal-label">${esc(label)}</span><span class="consent-modal-value consent-modal-value--alert">${details ? esc(String(details)) : 'Declared'}</span></p>`;
    };

    const modal = document.createElement('div');
    modal.id = 'consentModal';
    modal.className = 'cal-modal-overlay';
    modal.innerHTML = `
      <div class="cal-modal-box cal-modal-box--scroll">
        <p class="cal-modal-date">${esc(consentDate(f.submitted_at))}</p>
        <p class="cal-modal-title">${esc(consentName(f))}</p>
        <div class="consent-modal-section">
          ${row('Email', f.client_email)}
          ${row('Phone', f.client_phone)}
          ${row('Date of birth', f.date_of_birth ? consentDate(f.date_of_birth) : '')}
          ${row('Eircode', f.eircode)}
          ${row('Instagram', f.client_instagram)}
          ${row('Referral source', f.referral_source)}
          ${row('Artist', f.artist_name)}
        </div>
        <div class="consent-modal-section">
          ${flagBlock(f.has_medical, 'Medical conditions', f.medical_details)}
          ${flagBlock(f.has_medications, 'Medications', f.medication_details)}
          ${flagBlock(f.has_bloodborne, 'Bloodborne', f.bloodborne_details)}
          ${row('Photo consent', f.photo_consent ? 'Yes' : 'No')}
          ${row('Not fasting confirmed', f.confirm_not_fasting ? 'Yes' : 'No')}
          ${row('No alcohol confirmed', f.confirm_no_alcohol ? 'Yes' : 'No')}
          ${row('Signature', f.signature)}
        </div>
        <div class="cal-modal-actions">
          <button class="btn btn-secondary btn-sm" id="consentClose">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('open'));

    document.addEventListener('keydown', onConsentEsc);
    document.getElementById('consentClose').addEventListener('click', removeConsentModal);
    modal.addEventListener('click', e => { if (e.target === modal) removeConsentModal(); });
  }

  // ── Calendar ──
  const today = new Date();
  today.setHours(0,0,0,0);

  let currentYear        = today.getFullYear();
  let currentMonth       = today.getMonth();
  let calendarTransition = '';

  // Guests open the calendar on the month of their residency start, not today.
  if (isGuest && artist.guest_start_date) {
    const gs = new Date(artist.guest_start_date.slice(0, 10) + 'T00:00:00');
    if (!isNaN(gs)) { currentYear = gs.getFullYear(); currentMonth = gs.getMonth(); }
  }

  let studioAvailability = [];
  // null = studio slot counts are UNKNOWN (never loaded, or the fetch failed).
  // An empty object would mean "loaded, and no day has any slot" — the opposite
  // reading. Never conflate the two: unknown must not render as available.
  let guestSlotMap       = null;

  // Sequence token — SSE can fire availability_update twice in quick succession,
  // and the older GET may resolve last. Only the newest run may write state.
  let _availabilityRequestId = 0;

  async function loadAvailability(showToast = true) {
    const requestId = ++_availabilityRequestId;

    if (!calGrid.innerHTML.trim()) {
      calGrid.innerHTML = '<p class="dash-empty">Loading calendar…</p>';
    }
    try {
      const endpoint = isGuest ? '/api/artist/my-availability' : '/api/artist/studio-availability';
      const res  = await authFetch(endpoint);
      if (!res.ok) throw new Error('availability fetch failed: ' + res.status);
      const data = await res.json();
      if (requestId !== _availabilityRequestId) return;

      const availability = data.availability || [];

      // Guests need a second, dependent fetch. Collect into locals and commit
      // both together at the end, so an interleaved run can never pair one
      // run's availability with another run's slot map.
      // undefined = this run has no slot map to commit (resident, or no dates);
      // null = tried and failed (unknown); object = loaded.
      let slotMap;
      if (isGuest && artist.guest_start_date && artist.guest_end_date) {
        try {
          const from = artist.guest_start_date.slice(0, 10);
          const to   = artist.guest_end_date.slice(0, 10);
          const slotsRes  = await fetch(
            `${INTERNAL}/api/public/slots/range?from=${from}&to=${to}`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (!slotsRes.ok) throw new Error('slots range failed: ' + slotsRes.status);
          const slotsData = await slotsRes.json();
          if (!slotsData.days || !Array.isArray(slotsData.days)) {
            throw new Error('slots range: malformed payload');
          }
          slotMap = {};
          slotsData.days.forEach(d => { slotMap[d.date] = d.available; });
        } catch {
          // HTTP error, network failure and malformed payload are the same
          // outcome for the artist: we don't know the studio's capacity.
          slotMap = null;
          if (showToast) window.toast('Could not load slot availability', 'error');
        }
      }

      if (requestId !== _availabilityRequestId) return;

      studioAvailability = availability;
      if (slotMap !== undefined) guestSlotMap = slotMap;

      if (guestSlotMap === null && isGuest) {
        showCalendarError('Could not check studio availability — your sessions are shown, but new ones can’t be logged until this loads. Try refreshing.');
      } else {
        hideCalendarError();
      }
      renderCalendar();
    } catch {
      if (requestId !== _availabilityRequestId) return;
      if (showToast) window.toast('Could not load availability dates', 'error');
      // Never fall back to a silent empty calendar: an empty grid reads as
      // "nothing booked". Keep whatever was last known good and say so.
      showCalendarError();
      renderCalendar();
    }
  }

  // Persistent banner above the grid — the calendar's equivalent of the
  // "Could not load X" empty-state the list views render inline.
  function showCalendarError(message) {
    if (document.getElementById('calLoadError')) return;
    const anchor = document.querySelector('.cal-header') || calGrid;
    if (!anchor || !anchor.parentNode) return;
    const note = document.createElement('p');
    note.id = 'calLoadError';
    note.className = 'cal-load-error';
    note.textContent = message || (studioAvailability.length
      ? 'Could not refresh the calendar — showing the last loaded version. Try refreshing.'
      : 'Could not load the calendar — try refreshing.');
    anchor.parentNode.insertBefore(note, anchor.nextSibling);
  }

  function hideCalendarError() {
    const note = document.getElementById('calLoadError');
    if (note) note.remove();
  }

  function getDayEntries(dateStr) {
    return studioAvailability.filter(a => a.date.slice(0, 10) === dateStr);
  }

  // As minhas sessões nesse dia, por ordem de hora (sem hora → fim, depois id).
  // Espelha a ordenação do backend, para a lista e a grelha coincidirem.
  function getMyDayEntries(dateStr) {
    return getDayEntries(dateStr)
      .filter(e => e.artist_slug === artist.slug)
      .sort((a, b) => {
        if (!a.session_time && !b.session_time) return (a.id || 0) - (b.id || 0);
        if (!a.session_time) return 1;
        if (!b.session_time) return -1;
        return a.session_time.localeCompare(b.session_time);
      });
  }

  function clearCalendarSelection() {
    calGrid.querySelectorAll('.cal-day--selected').forEach(day => {
      day.classList.remove('cal-day--selected');
    });
  }

  function renderCalendar() {
    const filterMineSessions = localStorage.getItem(`art_calendar_filter_mine_${artist.slug}`) === 'true';
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
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      let bars = '';
      let cls = 'cal-day';

      if (isGuest) {
        const guestStart  = artist.guest_start_date ? artist.guest_start_date.slice(0, 10) : null;
        const guestEnd    = artist.guest_end_date   ? artist.guest_end_date.slice(0, 10)   : null;
        const inPeriod    = guestStart && guestEnd && dateStr >= guestStart && dateStr <= guestEnd;
        const slotsKnown  = guestSlotMap !== null;
        const available   = slotsKnown ? (guestSlotMap[dateStr] ?? null) : null;
        const myEntries   = getMyDayEntries(dateStr);
        const mySessions  = myEntries.filter(e => e.client_name);

        if (!inPeriod) {
          cls += ' cal-day--blocked';
        } else if (mySessions.length) {
          // Own sessions are local state — always shown, even when the studio
          // slot counts failed to load.
          bars = mySessions.map(e =>
            `<span class="cal-bar cal-bar--guest">${esc(e.client_name)}${e.session_time ? ' · ' + esc(e.session_time) : ''}</span>`
          ).join('');
        } else if (!slotsKnown) {
          // Capacity unknown — must not read as "free to book".
          cls += ' cal-day--unknown';
          bars = `<span class="cal-guest-empty cal-guest-empty--unknown">Availability unknown</span>`;
        } else if (available === 0) {
          cls += ' cal-day--full';
          bars = `<span class="cal-guest-empty cal-guest-empty--full">Full</span>`;
        } else {
          bars = `<span class="cal-guest-empty">Tap to log a session</span>`;
        }
      } else {

      const MAX_BARS = 3;
      // Filter BEFORE slicing: three sessions from other artists would otherwise
      // fill the 3-bar budget and hide your own session on that day.
      const dayEntries = filterMineSessions
        ? getDayEntries(dateStr).filter(e => e.artist_slug === artist.slug)
        : getDayEntries(dateStr);
      const allEntries = dayEntries.sort((a, b) => {
        if (!a.session_time && !b.session_time) return 0;
        if (!a.session_time) return 1;
        if (!b.session_time) return -1;
        return a.session_time.localeCompare(b.session_time);
      });
      const entries = allEntries.slice(0, MAX_BARS);
      const overflowCount = allEntries.length - entries.length;

      bars = entries.map(e => {
        const isMine         = e.artist_slug === artist.slug;
        const isConsultation = e.type === 'consultation';
        const isAvailable    = e.is_available && !e.client_name;
        const typeLabel      = e.type === 'consultation' ? 'Consult' : '';
        const timeLabel      = e.session_time ? esc(e.session_time) : '';
        const nameLabel      = isMine && e.client_name ? esc(e.client_name) : '';
        const initials = e.artist_name ? e.artist_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2) : '';
        const availLabel = initials ? `${initials} · Free` : 'Available';
        const label      = isAvailable ? availLabel : [nameLabel, timeLabel, typeLabel].filter(Boolean).join(' · ');
        const barClass   = isAvailable ? 'cal-bar cal-bar--available' : isConsultation ? 'cal-bar cal-bar--consultation' : 'cal-bar cal-bar--booked';
        return `<span class="${barClass} cal-bar--minw0"
          data-slug="${esc(e.artist_slug)}"
          data-mine="${isMine}"
          data-consultation="${isConsultation}"
          data-available="${isAvailable}"
          data-tooltip="${isAvailable ? esc(e.artist_name) + ' · Available' : esc(e.artist_name) + (e.session_time ? ' · ' + esc(e.session_time) : '') + (e.type ? ' · ' + esc(e.type) : '')}"
          >${label}</span>`;
      }).join('');

      if (overflowCount > 0) {
        bars += `<span class="cal-bar-overflow">+${overflowCount}</span>`;
      }
      } // end isGuest else

      // Guests may log sessions on days already past, as long as the day falls
      // inside their residency — the backend allows it, so the calendar must too.
      // Residents keep the past-day block.
      if (past && !isGuest) cls += ' past';
      if (isToday) cls += ' cal-day--today';
      if (isWeekend) cls += ' cal-day--weekend';

      html += `<div class="${cls}" data-date="${dateStr}" ${past ? 'data-readonly="true"' : ''}>
        <span class="cal-day-num">${d}</span>
        ${bars ? `<span class="cal-bars">${bars}</span>` : ''}
      </div>`;
    }

    calGrid.innerHTML = html;

    if (calendarTransition) {
      const transitionClass = calendarTransition === 'prev'
        ? 'cal-grid--transition-prev'
        : calendarTransition === 'next'
          ? 'cal-grid--transition-next'
          : 'cal-grid--transition-fade';
      calGrid.classList.remove('cal-grid--transition-prev', 'cal-grid--transition-next', 'cal-grid--transition-fade');
      void calGrid.offsetWidth;
      calGrid.classList.add(transitionClass);
      setTimeout(() => {
        calGrid.classList.remove(transitionClass);
      }, 220);
      calendarTransition = '';
    }

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

    // (The "only my sessions" filter is applied when building `bars` above —
    // hiding bars post-render would leave the +N overflow count wrong.)

    // Tooltip
    calGrid.querySelectorAll('.cal-bar[data-tooltip]').forEach(bar => {
      bar.addEventListener('mouseenter', e => showTooltip(e, bar.dataset.tooltip));
      bar.addEventListener('mouseleave', hideTooltip);
      if (bar.dataset.mine === 'false') {
        bar.addEventListener('click', e => e.stopPropagation());
      }
    });

    // Click handlers — skipped entirely for a frozen (inactive) guest.
    if (!isFrozen) {
      calGrid.querySelectorAll('.cal-day:not(.empty):not(.past):not(.cal-day--full):not(.cal-day--blocked)').forEach(el => {
        el.addEventListener('click', () => {
          clearCalendarSelection();
          el.classList.add('cal-day--selected');
          handleDayClick(el);
        });
      });
    }

    // Update legend
    updateLegend();

    // Setup filter button (residents only)
    if (!isGuest) {
      setupFilterButton(filterMineSessions);
    }
  }

  function setupFilterButton(isActive) {
    let filterBtn = document.getElementById('calFilterMine');
    if (!filterBtn) {
      const legend = document.querySelector('.cal-legend');
      if (!legend) return;
      filterBtn = document.createElement('button');
      filterBtn.id = 'calFilterMine';
      filterBtn.className = 'cal-filter-btn';
      filterBtn.type = 'button';
      legend.parentNode.insertBefore(filterBtn, legend.nextSibling);
    }

    filterBtn.textContent = 'Show only my sessions';
    filterBtn.setAttribute('data-active', isActive ? 'true' : 'false');
    filterBtn.removeEventListener('click', handleFilterToggle);
    filterBtn.addEventListener('click', handleFilterToggle);
  }

  function handleFilterToggle() {
    const currentState = localStorage.getItem(`art_calendar_filter_mine_${artist.slug}`) === 'true';
    localStorage.setItem(`art_calendar_filter_mine_${artist.slug}`, !currentState ? 'true' : 'false');
    renderCalendar();
  }

  function changeMonth(direction) {
    calendarTransition = direction;
    if (direction === 'prev') {
      currentMonth--;
      if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    } else if (direction === 'next') {
      currentMonth++;
      if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    }
    renderCalendar();
  }

  // ── Legend ──
  function updateLegend() {
    const legend = document.querySelector('.cal-legend');
    if (!legend) return;
    if (isGuest) {
      legend.innerHTML = '';
      legend.style.display = 'flex';
      const guestStates = [
        { label: 'Your session', color: '#B8860B' },
        { label: 'Tap to log a session', color: '#e8e8e8', border: '#ccc' },
        { label: 'Full — no slots', color: '#f5c6c6', border: '#e88' },
        { label: 'Outside your period', color: '#f0f0f0', border: '#ddd', opacity: '0.4' },
      ];
      guestStates.forEach(({ label, color, border, opacity }) => {
        const item = document.createElement('div');
        item.className = 'cal-legend-item';
        const dot = document.createElement('span');
        dot.className = 'cal-dot';
        dot.style.background = color;
        if (border) dot.style.borderColor = border;
        if (opacity) dot.style.opacity = opacity;
        const text = document.createElement('span');
        text.textContent = label;
        item.appendChild(dot);
        item.appendChild(text);
        legend.appendChild(item);
      });
      return;
    }

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
  // Sequence token — the slots fetch below is the only async step between the
  // tap and the modal. Tapping a second day while the first is in flight must
  // not let the older response open its modal over the newer one.
  let _dayClickId = 0;

  async function handleDayClick(el) {
    if (isFrozen) return;
    const clickId  = ++_dayClickId;
    const date     = el.dataset.date;
    const friendly = new Date(date + 'T00:00:00').toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' });
    const mine     = getMyDayEntries(date);

    if (isGuest) {
      // Guests: skip intermediate modal, go straight to booking
      const slotsKnown = guestSlotMap !== null;
      const available  = slotsKnown ? (guestSlotMap[date] ?? null) : null;
      if (mine.length > 1) { showDayModal(date, friendly, mine); return; }
      if (mine.length === 1 && mine[0].client_name) { showViewModal(date, friendly, mine[0]); return; }
      // Dia cheio só bloqueia a criação — sessões próprias abrem sempre.
      if (slotsKnown && available === 0) return;
      showGuestBookModal(date, friendly, slotsKnown);
      return;
    }

    if (mine.length > 1) {
      showDayModal(date, friendly, mine);
    } else if (mine.length === 1) {
      const myEntry = mine[0];
      const isAvailableOnly = myEntry.is_available && !myEntry.client_name;
      if (isAvailableOnly) {
        showAvailableModal(date, friendly, myEntry);
      } else {
        showViewModal(date, friendly, myEntry);
      }
    } else {
      try {
        const res  = await authFetch(`/api/artist/slots/${date}`);
        if (!res.ok) throw new Error('slots fetch failed: ' + res.status);
        const data = await res.json();
        if (clickId !== _dayClickId) return;
        showNewModal(date, friendly, data.available || 0, data.total || 4, data.available_reservations || 0);
      } catch {
        if (clickId !== _dayClickId) return;
        // Capacity unknown — never fabricate "4 of 4 free", that just moves the
        // rejection to a 409 after the artist has already committed.
        showNewModal(date, friendly, null, null, 0);
      }
    }
  }

  // ── Modal: guest booking ──
  function showGuestBookModal(date, friendly, slotsKnown = true) {
    removeModal();
    const modal = document.createElement('div');
    modal.id = 'calModal';
    modal.className = 'cal-modal-overlay';
    modal.innerHTML = `
      <div class="cal-modal-box">
        <p class="cal-modal-date">${esc(friendly)}</p>
        <p class="cal-modal-title">Add client</p>
        ${slotsKnown ? '' : `<p class="cal-modal-slots cal-modal-slots--full">Couldn’t check availability — try again</p>`}
        <div class="form-field">
          <label class="form-label" for="calClientName">Client name</label>
          <input class="form-input" id="calClientName" type="text" placeholder="Client name" autocomplete="off">
        </div>
        <div class="form-field">
          <label class="form-label" for="calSessionTime">Time</label>
          <select class="form-input form-select" id="calSessionTime">
            <option value="">— Select time —</option>
            ${Array.from({length: 24}, (_, i) => {
              const h = Math.floor(i / 2) + 11;
              const m = i % 2 === 0 ? '00' : '30';
              const val = `${String(h).padStart(2,'0')}:${m}`;
              return `<option value="${val}">${val}</option>`;
            }).join('')}
          </select>
        </div>
        <p class="form-label">Payment type</p>
        <div class="cal-modal-type" id="paymentTypeToggle">
          <button class="cal-type-btn active" data-payment-type="daily">Daily</button>
          <button class="cal-type-btn" data-payment-type="commission">Commission</button>
        </div>
        <div class="form-field" id="tattooValueField">
          <label class="form-label" for="calTattooValue">Full tattoo value (€)</label>
          <input class="form-input" id="calTattooValue" type="number" min="0" step="0.01" placeholder="0.00" autocomplete="off">
          <p class="profile-hint">We keep 30%, you keep 70% — calculated automatically.</p>
        </div>
        <div class="cal-modal-actions">
          <button class="btn btn-primary btn-sm" id="calModalConfirm" ${slotsKnown ? '' : 'disabled'}>Confirm</button>
          <button class="btn btn-secondary btn-sm" id="calModalCancel">${slotsKnown ? 'Cancel' : 'Close'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('open'));

    const nameInput = document.getElementById('calClientName');
    const timeInput = document.getElementById('calSessionTime');
    if (slotsKnown) setTimeout(() => nameInput.focus(), 200);

    // Payment type — Daily by default. The value field is hidden via CSSOM
    // (inline style attributes are blocked by the CSP).
    const paymentToggle   = document.getElementById('paymentTypeToggle');
    const valueField      = document.getElementById('tattooValueField');
    const valueInput      = document.getElementById('calTattooValue');
    const confirmBtn      = document.getElementById('calModalConfirm');
    let   selectedPayment = 'daily';

    valueField.style.display = 'none';

    // Mirrors the backend's 400 (`tattoo_value must be greater than 0 for
    // commission`) so the guest is stopped before committing, not after.
    function commissionValueOk() {
      return selectedPayment !== 'commission' || Number(valueInput.value) > 0;
    }
    function syncConfirmState() {
      confirmBtn.disabled = !slotsKnown || !commissionValueOk();
    }

    paymentToggle.querySelectorAll('.cal-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        paymentToggle.querySelectorAll('.cal-type-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedPayment = btn.dataset.paymentType;
        const isCommission = selectedPayment === 'commission';
        valueField.style.display = isCommission ? 'block' : 'none';
        if (!isCommission) valueInput.classList.remove('form-input--error');
        syncConfirmState();
        if (isCommission) valueInput.focus();
      });
    });

    valueInput.addEventListener('input', () => {
      valueInput.classList.remove('form-input--error');
      syncConfirmState();
    });

    document.getElementById('calModalConfirm').addEventListener('click', async (e) => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.classList.add('form-input--error'); return; }
      if (!commissionValueOk()) { valueInput.classList.add('form-input--error'); return; }
      setBtnBusy(e.currentTarget, true);
      const tattooValue = selectedPayment === 'commission' ? Number(valueInput.value) : null;
      const ok = await bookDate(date, name, timeInput.value, 'booking', selectedPayment, tattooValue);
      if (ok) removeModal();
      else setBtnBusy(document.getElementById('calModalConfirm'), false, 'Confirm');
    });

    document.getElementById('calModalCancel').addEventListener('click', removeModal);
    modal.addEventListener('click', e => { if (e.target === modal) removeModal(); });
    document.addEventListener('keydown', onEsc);
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') timeInput.focus(); });
  }

  // ── Modal: empty day ──
  function showNewModal(date, friendly, slotsAvailable, slotsTotal, availReservations = 0) {
    removeModal();
    // slotsAvailable === null means the capacity check failed — distinct from 0.
    const unknown      = slotsAvailable === null;
    const noSlots      = slotsAvailable === 0;
    const canReserve   = !unknown && availReservations < 2;
    const modal = document.createElement('div');
    modal.id = 'calModal';
    modal.className = 'cal-modal-overlay';
    modal.innerHTML = `
      <div class="cal-modal-box">
        <p class="cal-modal-date">${esc(friendly)}</p>
        <p class="cal-modal-title">Add to calendar</p>
        <p class="cal-modal-slots ${noSlots || unknown ? 'cal-modal-slots--full' : ''}">
          ${unknown ? 'Couldn’t check availability — try again'
                    : noSlots ? 'No slots available'
                              : `${slotsAvailable} of ${slotsTotal} slots available`}
        </p>
        <div class="cal-modal-actions">
          ${canReserve ? `<button class="btn btn-primary btn-sm" id="calModalMarkAvail">Mark available</button>` : ''}
          <button class="btn btn-secondary btn-sm" id="calModalBookClient" ${noSlots || unknown ? 'disabled' : ''}>Book client</button>
          <button class="btn btn-secondary btn-sm" id="calModalCancel">${unknown ? 'Close' : 'Cancel'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('open'));

    const markAvailBtn = document.getElementById('calModalMarkAvail');
    if (markAvailBtn) markAvailBtn.addEventListener('click', async () => {
      setBtnBusy(markAvailBtn, true);
      const ok = await markAvailable(date);
      if (ok) removeModal();
      else setBtnBusy(markAvailBtn, false, 'Mark available');
    });
    document.getElementById('calModalBookClient').addEventListener('click', () => {
      removeModal();
      showBookModal(date, friendly, slotsAvailable, slotsTotal);
    });
    document.getElementById('calModalCancel').addEventListener('click', removeModal);
    modal.addEventListener('click', e => { if (e.target === modal) removeModal(); });
    document.addEventListener('keydown', onEsc);
  }

  // ── Modal: dia com várias sessões ──
  function showDayModal(date, friendly, entries) {
    removeModal();
    const modal = document.createElement('div');
    modal.id = 'calModal';
    modal.className = 'cal-modal-overlay';
    modal.innerHTML = `
      <div class="cal-modal-box">
        <p class="cal-modal-date">${esc(friendly)}</p>
        <p class="cal-modal-title">${entries.length} sessions</p>
        <div class="cal-session-list">
          ${entries.map((e, i) => {
            const free  = e.is_available && !e.client_name;
            const title = free ? 'Available' : esc(e.client_name || 'Session');
            const meta  = free
              ? 'No client'
              : [e.session_time ? esc(e.session_time) : null,
                 e.type === 'consultation' ? 'Consultation' : 'Booking'].filter(Boolean).join(' · ');
            return `<button class="cal-session-row" data-idx="${i}">
              <span>${title}</span>
              <span class="cal-session-row-meta">${meta}</span>
            </button>`;
          }).join('')}
        </div>
        <div class="cal-modal-actions" id="calDayActions">
          <button class="btn btn-primary btn-sm" id="calModalAdd">Add another session</button>
          <button class="btn btn-secondary btn-sm" id="calModalCancel">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('calDayActions').style.marginTop = '24px';
    requestAnimationFrame(() => modal.classList.add('open'));

    modal.querySelectorAll('.cal-session-row').forEach(row => {
      row.addEventListener('click', () => {
        const entry = entries[parseInt(row.dataset.idx, 10)];
        removeModal();
        if (entry.is_available && !entry.client_name) showAvailableModal(date, friendly, entry);
        else showViewModal(date, friendly, entry);
      });
    });

    document.getElementById('calModalAdd').addEventListener('click', () => startNewSession(date, friendly));
    document.getElementById('calModalCancel').addEventListener('click', removeModal);
    modal.addEventListener('click', e => { if (e.target === modal) removeModal(); });
    document.addEventListener('keydown', onEsc);
  }

  // Abre o fluxo de criação, venha de onde vier (dia vazio, lista, ou um modal
  // de sessão existente). Centralizado para os chamadores não divergirem.
  async function startNewSession(date, friendly) {
    removeModal();
    if (isGuest) { showGuestBookModal(date, friendly, guestSlotMap !== null); return; }
    try {
      const res  = await authFetch(`/api/artist/slots/${date}`);
      if (!res.ok) throw new Error('slots fetch failed: ' + res.status);
      const data = await res.json();
      showBookModal(date, friendly, data.available || 0, data.total || 4);
    } catch {
      showBookModal(date, friendly, null, null);
    }
  }

  // ── Modal: available day (no client) ──
  function showAvailableModal(date, friendly, entry) {
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

    document.getElementById('calModalBookClient').addEventListener('click', () => startNewSession(date, friendly));
    document.getElementById('calModalRemove').addEventListener('click', async () => {
      if (!await showConfirmModal('Delete this session?')) return;
      removeModal();
      deleteSession(entry.id);
    });
    document.getElementById('calModalCancel').addEventListener('click', removeModal);
    modal.addEventListener('click', e => { if (e.target === modal) removeModal(); });
    document.addEventListener('keydown', onEsc);
  }

  // ── Modal: book client ──
  function showBookModal(date, friendly, slotsAvailable, slotsTotal) {
    removeModal();
    // slotsAvailable === null means the capacity check failed — distinct from 0.
    const unknown = slotsAvailable === null;
    const noSlots = slotsAvailable === 0;
    const modal = document.createElement('div');
    modal.id = 'calModal';
    modal.className = 'cal-modal-overlay';
    modal.innerHTML = `
      <div class="cal-modal-box">
        <p class="cal-modal-date">${esc(friendly)}</p>
        <p class="cal-modal-title">New session</p>
        <p class="cal-modal-slots ${noSlots || unknown ? 'cal-modal-slots--full' : ''}">
          ${unknown ? 'Couldn’t check availability — try again'
                    : noSlots ? 'No slots available'
                              : `${slotsAvailable} of ${slotsTotal} slots available`}
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
            ${Array.from({length: 24}, (_, i) => {
              const h = Math.floor(i / 2) + 11;
              const m = i % 2 === 0 ? '00' : '30';
              const val = `${String(h).padStart(2,'0')}:${m}`;
              return `<option value="${val}">${val}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="cal-modal-actions">
          <button class="btn btn-primary btn-sm" id="calModalConfirm" ${noSlots || unknown ? 'disabled' : ''}>Confirm</button>
          <button class="btn btn-secondary btn-sm" id="calModalCancel">${unknown ? 'Close' : 'Cancel'}</button>
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
        document.getElementById('calModalConfirm').disabled = unknown || (selectedType === 'booking' && noSlots);
      });
    });

    const nameInput = document.getElementById('calClientName');
    const timeInput = document.getElementById('calSessionTime');
    setTimeout(() => nameInput.focus(), 200);

    document.getElementById('calModalConfirm').addEventListener('click', async (e) => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.classList.add('form-input--error'); return; }
      setBtnBusy(e.currentTarget, true);
      const ok = await bookDate(date, name, timeInput.value, selectedType);
      if (ok) removeModal();
      else setBtnBusy(document.getElementById('calModalConfirm'), false, 'Confirm');
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
            ${Array.from({length: 24}, (_, i) => {
              const h = Math.floor(i / 2) + 11;
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
          <button class="btn btn-secondary btn-sm" id="calModalCancel">Cancel</button>
        </div>
        <div class="cal-modal-actions" id="calViewAdd">
          <button class="btn btn-secondary btn-sm" id="calModalAdd">Add another session</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('calViewActions').style.marginTop = '24px';
    document.getElementById('calViewAdd').style.marginTop = '8px';
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

    document.getElementById('calModalSave').addEventListener('click', async (e) => {
      const name = document.getElementById('calEditName').value.trim();
      const time = document.getElementById('calEditTime').value;
      if (!name) { document.getElementById('calEditName').classList.add('form-input--error'); return; }
      if (!entry.id) {
        // Sem id não há forma segura de editar — um POST criaria um duplicado.
        window.toast('Session out of sync — refresh the page', 'error');
        return;
      }
      setBtnBusy(e.currentTarget, true);
      const ok = await updateSession(entry, name, time, selectedType);
      if (ok) removeModal();
      else setBtnBusy(document.getElementById('calModalSave'), false, 'Save');
    });

    document.getElementById('calModalAdd').addEventListener('click', () => startNewSession(date, friendly));

    // Confirm BEFORE closing: a declined delete must leave the modal open with
    // any unsaved edits intact. showConfirmModal renders at z-index 500, above
    // this modal's 400, so it is visible while this one stays on screen.
    document.getElementById('calModalDelete').addEventListener('click', async () => {
      if (!await showConfirmModal('Delete this session?')) return;
      removeModal();
      deleteSession(entry.id);
    });

    document.getElementById('calModalCancel').addEventListener('click', removeModal);

    modal.addEventListener('click', e => { if (e.target === modal) removeModal(); });
  }

  function onEsc(e) {
    if (e.key === 'Escape') { removeModal(); document.removeEventListener('keydown', onEsc); }
  }

  function removeModal() {
    const m = document.getElementById('calModal');
    if (m) { m.classList.remove('open'); setTimeout(() => m.remove(), 250); }
    clearCalendarSelection();
    document.removeEventListener('keydown', onEsc);
  }

  // In-flight button state — same spinner the Profile save bar uses.
  const BTN_SPINNER = '<svg class="btn-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>';
  function setBtnBusy(btn, busy, idleLabel) {
    if (!btn) return;
    btn.disabled = busy;
    if (busy) { btn.innerHTML = BTN_SPINNER; }
    else      { btn.textContent = idleLabel; }
  }

  // Prefer the backend's explanation over a generic string — a 409 that says
  // "daily reservation limit reached" is far more useful than "Failed to mark date".
  async function errorMessage(res, fallback) {
    try {
      const data = await res.json();
      if (data && data.error) return String(data.error);
    } catch { /* non-JSON error page — fall through */ }
    return fallback;
  }

  async function markAvailable(date) {
    try {
      const res = await authFetch('/api/artist/availability', {
        method: 'POST',
        body:   JSON.stringify({ date, is_available: true, client_name: null, session_time: null, type: 'booking' }),
      });
      if (res.status === 409) {
        window.toast(await errorMessage(res, 'No slots available for this date'), 'error');
        loadAvailability(false);   // our view of this day is out of date
        return false;
      }
      if (res.ok) {
        window.toast('Date marked as available', 'success');
        // Cada POST cria uma linha nova — nunca substitui uma existente.
        const created = await res.json().catch(() => ({}));
        studioAvailability.push({
          id: created.availability && created.availability.id,
          date, is_available: true, client_name: null, session_time: null, type: 'booking',
          artist_slug: artist.slug, artist_name: artist.name, has_booking: false,
        });
        _availabilityRequestId++;   // invalidate any load still in flight — it predates this write
        renderCalendar();
        return true;
      } else {
        window.toast(await errorMessage(res, 'Failed to mark date'), 'error');
      }
    } catch {
      window.toast('Error marking date', 'error');
    }
    return false;
  }

  async function bookDate(date, clientName, sessionTime, type, paymentType, tattooValue) {
    try {
      const res = await authFetch('/api/artist/availability', {
        method: 'POST',
        body:   JSON.stringify({
          date, is_available: true, client_name: clientName,
          session_time: sessionTime || null, type,
          // Omitted entirely when absent — the other two call sites pass neither,
          // so their payload is unchanged and the backend's COALESCE preserves
          // whatever payment fields the row already had.
          ...(paymentType ? { payment_type: paymentType } : {}),
          ...(tattooValue != null ? { tattoo_value: tattooValue } : {}),
        }),
      });
      if (res.status === 409) {
        window.toast(await errorMessage(res, 'No slots available for this date'), 'error');
        return false;
      }
      if (res.ok) {
        window.toast(`${type === 'consultation' ? 'Consultation' : 'Booking'} saved — ${clientName}`, 'success');
        const created = await res.json().catch(() => ({}));
        studioAvailability.push({
          id: created.availability && created.availability.id,
          date, is_available: true, client_name: clientName, session_time: sessionTime || null, type,
          artist_slug: artist.slug, artist_name: artist.name, has_booking: false,
        });
        _availabilityRequestId++;   // invalidate any load still in flight — it predates this write
        renderCalendar();
        return true;
      } else {
        window.toast(await errorMessage(res, 'Failed to save session'), 'error');
      }
    } catch {
      window.toast('Error saving session', 'error');
    }
    return false;
  }

  // Edição de uma sessão existente. Distinto do POST, que cria sempre.
  // session_time vai como '' quando limpo — o backend lê a string vazia como
  // "apagar a hora"; um campo ausente seria "preservar".
  async function updateSession(entry, clientName, sessionTime, type) {
    try {
      const res = await authFetch(`/api/artist/availability/${entry.id}`, {
        method: 'PATCH',
        body:   JSON.stringify({ client_name: clientName, session_time: sessionTime || '', type }),
      });
      if (res.ok) {
        window.toast(`${type === 'consultation' ? 'Consultation' : 'Booking'} saved — ${clientName}`, 'success');
        const idx = studioAvailability.findIndex(a => a.id === entry.id);
        if (idx >= 0) {
          studioAvailability[idx] = { ...studioAvailability[idx],
            client_name: clientName, session_time: sessionTime || null, type };
        }
        _availabilityRequestId++;   // invalidate any load still in flight — it predates this write
        renderCalendar();
        return true;
      }
      window.toast(await errorMessage(res, 'Failed to save session'), 'error');
    } catch {
      window.toast('Error saving session', 'error');
    }
    return false;
  }

  async function deleteSession(id) {
    try {
      const res = await authFetch(`/api/artist/availability/${id}`, { method: 'DELETE' });
      if (res.ok) {
        window.toast('Session deleted', 'info');
        studioAvailability = studioAvailability.filter(a => a.id !== id);
        _availabilityRequestId++;   // invalidate any load still in flight — it predates this write
        renderCalendar();
      } else {
        window.toast(await errorMessage(res, 'Failed to delete session'), 'error');
      }
    } catch {
      window.toast('Error deleting session', 'error');
    }
  }

  calPrev.addEventListener('click', () => changeMonth('prev'));
  calNext.addEventListener('click', () => changeMonth('next'));

  // ── Swipe gesture (PWA calendar navigation) ──
  let swipeStartX = 0;
  let swipeStartY = 0;

  calGrid.addEventListener('touchstart', (e) => {
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
  }, { passive: true });

  calGrid.addEventListener('touchend', (e) => {
    if (!e.changedTouches.length) return;
    const swipeEndX = e.changedTouches[0].clientX;
    const swipeEndY = e.changedTouches[0].clientY;

    const deltaX = swipeEndX - swipeStartX;
    const deltaY = swipeEndY - swipeStartY;

    if (Math.abs(deltaY) > Math.abs(deltaX)) return;
    if (Math.abs(deltaX) < 50) return;

    if (deltaX < 0) changeMonth('next');
    else changeMonth('prev');
  }, { passive: true });

  const calHeader = document.querySelector('.cal-header');
  if (calHeader) {
    const todayBtn = document.createElement('button');
    todayBtn.className = 'cal-today-btn';
    todayBtn.textContent = 'Today';
    todayBtn.addEventListener('click', () => {
      calendarTransition = 'fade';
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
  let _pendingProfileUrl   = null;  // last-uploaded profile photo, kept until the backend echoes it back
  let _liveModalSeen       = localStorage.getItem('art_profile_live_seen') === '1';
  let _wasPublic           = null;

  // Two views of the same five checks. 'draft' reads what the user is typing
  // right now (so the bar reacts immediately); 'server' reads the last state the
  // backend confirmed. Photos are server-truth in both — they upload on their
  // own, without going through the save bar.
  function profileChecks(source) {
    const draft  = source === 'draft';
    const val    = id => (document.getElementById(id)?.value || '').trim();
    const bio    = draft ? val('profileBio')          : (_completenessProfile && _completenessProfile.bio || '');
    const wa     = draft ? val('profileWhatsapp')     : (_completenessProfile && _completenessProfile.whatsapp_url || '');
    const book   = draft ? val('profileBookingUrl')   : (_completenessProfile && _completenessProfile.booking_url  || '');
    const styles = draft ? profileStyles              : (_completenessProfile && _completenessProfile.styles || []);
    return {
      bio:       !!bio.trim(),
      photo:     !!(_completenessPhotos && _completenessPhotos.profileUrl),
      portfolio: !!(_completenessPhotos && (_completenessPhotos.portfolio || []).length > 0),
      styles:    styles.length > 0,
      contact:   !!(wa || book),
    };
  }

  function updateCompleteness() {
    if (!isGuest) return;
    if (!_completenessProfile || !_completenessPhotos) return;
    const checks = profileChecks('draft');
    const keys   = Object.keys(checks);
    const done   = keys.filter(k => checks[k]).length;
    const serverChecks   = profileChecks('server');
    const serverComplete = keys.every(k => serverChecks[k]);
    const pct    = Math.round((done / keys.length) * 100);
    const fill   = document.getElementById('completenessFill');
    const label  = document.getElementById('completenessLabel');
    const bar    = document.getElementById('completenessBar');
    if (!fill || !label || !bar) return;
    fill.style.width = pct + '%';
    const pctEl = document.getElementById('completenessPct');
    if (pctEl) pctEl.textContent = pct + '%';
    keys.forEach(k => {
      const el = document.getElementById('cStep-' + k);
      if (el) el.classList.toggle('completeness-step--done', checks[k]);
    });
    if (done === keys.length) {
      // Only claim "live" once the backend actually has these values — otherwise
      // the label would contradict the save bar reading "Unsaved changes".
      label.textContent = !isGuest         ? '✓ Profile complete'
                        : serverComplete   ? '✓ Profile complete — your profile is live'
                                           : '✓ Profile complete — save to go live';
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
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      if (data.is_public && !_liveModalSeen) {
        _liveModalSeen = true;
        localStorage.setItem('art_profile_live_seen', '1');
        // Standalone (installed PWA): the modal links to artist.html, which must
        // not open inside the locked-down calendar scope — use a link-free toast.
        if (_standalone) window.toast('Your profile is now live', 'success');
        else showProfileLiveModal();
      } else if (!data.is_public && _wasPublic === true) {
        const miss = (data.missing || []).join(', ');
        window.toast('Your profile is no longer visible on the site' + (miss ? ' — missing: ' + miss : ''), 'info');
      }
      _wasPublic = !!data.is_public;
    } catch (err) {
      // Session-expiry redirects from authFetch stay silent; anything else is
      // a real failure the artist should see rather than a stale visibility state.
      if (err && err.message === 'session expired') return;
      window.toast('Could not check your profile visibility — try again shortly', 'error');
    }
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
      if (!res.ok) throw new Error('profile fetch failed: ' + res.status);
      const data = await res.json();
      const a    = data.artist;
      if (!a) throw new Error('profile response missing artist');
      isFrozen   = isGuest && a.active === false;
      document.getElementById('profileBio').value       = a.bio || '';
      const _bioCounter = document.getElementById('bioCounter');
      if (_bioCounter) _bioCounter.textContent = (a.bio || '').length + ' / 600';
      const _igLoad = document.getElementById('profileInstagram');
      _igLoad.value = (a.instagram || '').replace(/^@+/, '');
      updateIgEcho();
      const waField = document.getElementById('profileWhatsapp');
      if (waField) {
        const waNum = a.whatsapp_url ? a.whatsapp_url.replace('https://wa.me/', '') : '';
        waField.value = waNum;
      }
      const bookingField = document.getElementById('profileBookingUrl');
      if (bookingField) bookingField.value = a.booking_url || '';
      const countrySelect = document.getElementById('profileCountry');
      if (countrySelect) countrySelect.value = a.country || '';
      updateContactEmptyHint();
      profileStyles = a.styles || [];
      renderProfileStyles();
      _completenessProfile = {
        bio:          a.bio          || '',
        whatsapp_url: a.whatsapp_url || '',
        booking_url:  a.booking_url  || '',
        styles:       a.styles       || [],
      };
      _wasPublic = !!a.is_public;
      updateCompleteness();
      snapshotProfile();
      if (isFrozen) applyFrozenState(a);
      const _perr = document.getElementById('profileLoadError');
      if (_perr) _perr.remove();
    } catch {
      window.toast('Could not load profile', 'error');
      // The fields are still blank at this point — without a banner that reads
      // as "my profile is empty" rather than "it didn't load".
      showProfileLoadError();
    }
  }

  // Banner at the top of the Profile tab. Saving is already blocked while this
  // shows: snapshotProfile() never ran, so checkDirty() bails and the save
  // button stays disabled — no risk of overwriting the real profile with blanks.
  function showProfileLoadError() {
    if (document.getElementById('profileLoadError')) return;
    const form = document.getElementById('profileForm');
    if (!form || !form.parentNode) return;
    const note = document.createElement('p');
    note.id = 'profileLoadError';
    note.className = 'dash-empty dash-empty--error';
    note.textContent = 'Could not load your profile — try refreshing. Editing is disabled until it loads.';
    form.parentNode.insertBefore(note, form);
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
    const styleInput = document.getElementById('profileStyleInput');
    const styleBtn   = document.getElementById('profileStyleBtn');
    const styleHint  = document.getElementById('stylesHint');
    const atMax      = profileStyles.length >= 3;
    if (styleInput) styleInput.disabled = atMax;
    if (styleBtn)   styleBtn.disabled   = atMax;
    if (styleHint)  styleHint.textContent = atMax ? '3 styles max — remove one to add another' : 'Add up to 3 · press Enter or click Add';
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
  let _saving           = false;
  let _saveStatusTimer  = null;
  const profileSaveBar    = document.getElementById('profileSaveBar');
  const profileSaveStatus = document.getElementById('profileSaveStatus');

  function setSaveState(state) {
    if (profileSaveBar) profileSaveBar.dataset.state = state;
    if (!profileSaveStatus) return;
    profileSaveStatus.textContent =
      state === 'dirty'  ? 'Unsaved changes'            :
      state === 'saving' ? 'Saving…'                    :
      state === 'saved'  ? 'Saved'                      :
      state === 'error'  ? 'Couldn’t save — try again' :
                           'All changes saved';
  }

  function snapshotProfile() {
    const bioEl     = document.getElementById('profileBio');
    const igEl      = document.getElementById('profileInstagram');
    const waEl      = document.getElementById('profileWhatsapp');
    const bookEl    = document.getElementById('profileBookingUrl');
    const cntEl     = document.getElementById('profileCountry');
    _profileSnapshot = {
      bio:         bioEl    ? bioEl.value.trim()  : '',
      instagram:   igEl     ? igEl.value.trim()   : '',
      whatsapp:    waEl     ? waEl.value.trim()   : '',
      booking_url: bookEl   ? bookEl.value.trim() : '',
      country:     cntEl    ? cntEl.value         : '',
      styles:      JSON.stringify(profileStyles),
    };
    _profileDirty = false;
    if (profileSaveBtn) profileSaveBtn.disabled = true;
    if (!_saving) setSaveState('clean');
  }

  function checkDirty() {
    if (!_profileSnapshot) return;
    const bioEl  = document.getElementById('profileBio');
    const igEl   = document.getElementById('profileInstagram');
    const waEl   = document.getElementById('profileWhatsapp');
    const bookEl = document.getElementById('profileBookingUrl');
    const cntEl  = document.getElementById('profileCountry');
    const current = {
      bio:         bioEl    ? bioEl.value.trim()  : '',
      instagram:   igEl     ? igEl.value.trim()   : '',
      whatsapp:    waEl     ? waEl.value.trim()   : '',
      booking_url: bookEl   ? bookEl.value.trim() : '',
      country:     cntEl    ? cntEl.value         : '',
      styles:      JSON.stringify(profileStyles),
    };
    _profileDirty = Object.keys(current).some(k => current[k] !== _profileSnapshot[k]);
    if (profileSaveBtn) profileSaveBtn.disabled = !_profileDirty;
    if (!_saving) setSaveState(_profileDirty ? 'dirty' : 'clean');
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

  // Guest-only: prompt when neither WhatsApp nor booking link is set
  function updateContactEmptyHint() {
    const hint = document.getElementById('contactEmptyHint');
    if (!hint) return;
    if (!isGuest) { hint.hidden = true; return; }
    const waEl   = document.getElementById('profileWhatsapp');
    const bookEl = document.getElementById('profileBookingUrl');
    const wa   = waEl ? waEl.value.trim() : '';
    const book = bookEl ? bookEl.value.trim() : '';
    hint.hidden = !!(wa || book);
  }

  const _profileFields = ['profileBio', 'profileInstagram', 'profileWhatsapp', 'profileBookingUrl'];
  _profileFields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      // _completenessProfile is the server mirror and is deliberately NOT touched
      // here — updateCompleteness() reads the live fields as the draft itself.
      updateCompleteness();
      updateContactEmptyHint();
      checkDirty();
    });
  });

  // A <select> fires 'change', not 'input', so it can't ride along in _profileFields.
  const _countryDirtyEl = document.getElementById('profileCountry');
  if (_countryDirtyEl) _countryDirtyEl.addEventListener('change', checkDirty);

  function igHandle() {
    const el = document.getElementById('profileInstagram');
    return el ? el.value.trim().replace(/^@+/, '') : '';
  }

  function updateIgEcho() {
    const echo = document.getElementById('igEcho');
    if (!echo) return;
    const h = igHandle();
    echo.textContent = 'instagram.com/' + (h || 'yourusername');
    echo.classList.toggle('ig-echo--filled', !!h);
  }

  const _igEl = document.getElementById('profileInstagram');
  if (_igEl) {
    _igEl.addEventListener('input', () => {
      // Keep the field bare — the decorative "@" prefix stands in for it.
      if (/^@/.test(_igEl.value)) {
        const pos = _igEl.selectionStart;
        _igEl.value = _igEl.value.replace(/^@+/, '');
        const c = Math.max(0, (pos || 0) - 1);
        try { _igEl.setSelectionRange(c, c); } catch {}
      }
      updateIgEcho();
      checkDirty();
    });
  }

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
      const whatsapp_url = waRaw ? `https://wa.me/${waRaw}` : null;
      const bookingEl    = document.getElementById('profileBookingUrl');
      const bookingRaw   = bookingEl ? bookingEl.value.trim() : undefined;
      const booking_url  = bookingRaw ? (/^https?:\/\//i.test(bookingRaw) ? bookingRaw : `https://${bookingRaw}`) : bookingRaw;

      // Client-side sanity checks (UX only — the backend re-validates).
      if (waEl)      waEl.classList.remove('form-input--error');
      if (bookingEl) bookingEl.classList.remove('form-input--error');
      // National-format numbers (leading 0) have a plausible length, so the
      // 8–15 check below can't catch them: "0871234567" is 10 digits and would
      // save as a wa.me link WhatsApp rejects.
      if (waRaw && waRaw.startsWith('0')) {
        waEl.classList.add('form-input--error');
        window.toast('Include the country code (e.g. 353 for Ireland) — don’t start with 0', 'error');
        return;
      }
      if (waRaw && (waRaw.length < 8 || waRaw.length > 15)) {
        waEl.classList.add('form-input--error');
        window.toast('WhatsApp number looks wrong — use 8–15 digits incl. country code', 'error');
        return;
      }
      if (booking_url) {
        let urlOk = true;
        try {
          const u = new URL(booking_url);
          // Structural check only: a real host needs at least one dot.
          if (!u.hostname.includes('.')) urlOk = false;
        } catch { urlOk = false; }
        if (!urlOk) {
          bookingEl.classList.add('form-input--error');
          window.toast('Booking link doesn’t look like a valid URL', 'error');
          return;
        }
      }

      _saving = true;
      setSaveState('saving');
      if (_saveStatusTimer) clearTimeout(_saveStatusTimer);
      profileSaveBtn.disabled  = true;
      profileSaveBtn.innerHTML = '<svg class="btn-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>';
      try {
        // Country is guest-only (the backend ignores it for residents anyway).
        const countryEl = document.getElementById('profileCountry');
        const payload = { bio, instagram, styles: profileStyles, whatsapp_url, booking_url };
        if (isGuest && countryEl) payload.country = countryEl.value;
        const res = await authFetch('/api/artist/profile', {
          method: 'PATCH',
          body:   JSON.stringify(payload),
        });
        if (res.ok) {
          window.toast('Profile updated', 'success');
          _saving = false;
          // The backend now holds these values — advance the mirror so the
          // completeness label can stop saying "save to go live".
          _completenessProfile = {
            bio:          bio,
            whatsapp_url: whatsapp_url || '',
            booking_url:  booking_url  || '',
            styles:       profileStyles.slice(),
          };
          updateCompleteness();
          snapshotProfile();
          syncVisibility();
          setSaveState('saved');
          _saveStatusTimer = setTimeout(() => { if (!_profileDirty && !_saving) setSaveState('clean'); }, 2200);
        } else {
          window.toast('Failed to save profile', 'error');
          _saving = false;
          setSaveState('error');
        }
      } catch {
        window.toast('Error saving profile', 'error');
        _saving = false;
        setSaveState('error');
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

  // Insert a delivery transform into a Cloudinary secure_url (mirrors the backend),
  // e.g. .../image/upload/v123/x.jpg -> .../image/upload/q_auto,f_auto,w_680/v123/x.jpg
  function withCloudinaryTransform(url, t) {
    return url && url.includes('/image/upload/')
      ? url.replace('/image/upload/', `/image/upload/${t}/`)
      : url;
  }

  let _photosRequestId = 0;

  // Only one photo operation (upload / replace / delete) may run at a time.
  // Concurrent ops race on the same public_id — e.g. a replace that resolves
  // after a delete re-creates the asset in Cloudinary, resurrecting it for good.
  let _photoOpInFlight = false;
  // Deletes confirmed by the backend this session. loadPhotos() is backed by the
  // Cloudinary Search API, which is eventually consistent, so a refresh right
  // after a delete often still lists the removed image — filtering it here keeps
  // it gone. Symmetric to _pendingProfileUrl, which covers the same lag on add.
  const _deletedThisSession = new Set();
  let _portfolioFull   = false;  // last known count >= 16, so the add button is restored correctly

  function setPhotoOpInFlight(v) {
    _photoOpInFlight = v;
    document.querySelectorAll('.portfolio-replace-btn, .portfolio-delete-btn')
      .forEach(b => { b.disabled = v || isFrozen; });
    if (profilePhotoBtn)   profilePhotoBtn.disabled   = v || isFrozen;
    if (portfolioPhotoBtn) portfolioPhotoBtn.disabled = v || isFrozen || _portfolioFull;
  }

  async function loadPhotos(bustCache = false) {
    const requestId = ++_photosRequestId;

    const preview  = document.getElementById('profilePhotoPreview');
    const grid     = document.getElementById('portfolioGrid');
    const countEl  = document.getElementById('portfolioCount');
    const addBtn   = document.getElementById('portfolioPhotoBtn');

    if (grid) grid.innerHTML = '<span class="profile-photo-empty">Loading...</span>';

    try {
      const res  = await authFetch('/api/artist/photos');
      if (!res.ok) throw new Error('photos fetch failed: ' + res.status);
      const data = await res.json();
      // A later upload already re-rendered the grid — this older response would
      // drop the freshly-added thumbnail and re-bind stale delete handlers.
      if (requestId !== _photosRequestId) return;

      // Drop images the backend already confirmed deleted but the Search API
      // hasn't caught up on yet, and keep the count consistent with the grid.
      if (_deletedThisSession.size && Array.isArray(data.portfolio)) {
        const kept = data.portfolio.filter(p =>
          !_deletedThisSession.has(p.publicId) && !_deletedThisSession.has(p.publicIdBare));
        if (kept.length !== data.portfolio.length) {
          data.count = typeof data.count === 'number'
            ? Math.max(0, data.count - (data.portfolio.length - kept.length))
            : kept.length;
        }
        data.portfolio = kept;
      }

      _completenessPhotos = { profileUrl: data.profileUrl || null, portfolio: data.portfolio || [] };
      updateCompleteness();
      syncVisibility();

      if (preview) {
        const profileUrl = data.profileUrl || _pendingProfileUrl;
        if (profileUrl) {
          const img = document.createElement('img');
          if (profileUrl.startsWith('https://')) {
            img.src = bustCache ? profileUrl + '?v=' + Date.now() : profileUrl;
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
              <img src="${esc(bustCache ? p.url + '?v=' + Date.now() : p.url)}" alt="Portfolio image" loading="lazy">
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

          // Frozen guests: portfolio is read-only — no replace/delete affordances.
          // Same while a photo op is in flight, though the finally releases the
          // flag before refreshing, so that case is only a belt-and-braces guard.
          if (isFrozen || _photoOpInFlight) {
            grid.querySelectorAll('.portfolio-replace-btn, .portfolio-delete-btn').forEach(b => { b.disabled = true; });
          }
          if (!isFrozen) {
          grid.querySelectorAll('.portfolio-replace-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              const thumb    = btn.closest('.portfolio-thumb');
              const publicId     = thumb.dataset.publicId;
              const publicIdBare = thumb.dataset.publicIdBare || '';
              if (!publicId) return;
              if (_photoOpInFlight) return;

              const input = document.createElement('input');
              input.type   = 'file';
              input.accept = 'image/jpeg,image/png,image/webp';
              input.addEventListener('change', async () => {
                const file = input.files[0];
                if (!file) return;
                if (file.size > 10 * 1024 * 1024) { window.toast('File too large (max 10MB)', 'error'); return; }
                // Claimed here, not on click: the file dialog can be cancelled,
                // which fires no event and would strand the flag.
                if (_photoOpInFlight) return;
                setPhotoOpInFlight(true);
                try {
                  const sig = await getUploadSignature('portfolio', publicIdBare || publicId);
                  const uploaded = await uploadToCloudinary(file, sig);
                  // Optimistic: swap this thumbnail to the freshly-uploaded image
                  // immediately (Search-API-backed loadPhotos is eventually consistent).
                  const thumbImg = thumb.querySelector('img');
                  if (uploaded && uploaded.secure_url && thumbImg) {
                    thumbImg.src = withCloudinaryTransform(uploaded.secure_url, 'q_auto,f_auto,w_800');
                  }
                  window.toast('Image replaced', 'success');
                } catch (err) {
                  window.toast(err.message || 'Replace failed', 'error');
                } finally {
                  // Released before the refresh so the re-rendered buttons come
                  // back enabled. Server is the source of truth after any
                  // attempt; this re-renders the grid (and its handlers), so no
                  // manual rollback of the optimistic thumbnail swap is needed.
                  setPhotoOpInFlight(false);
                  await loadPhotos(true);
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

              if (_photoOpInFlight) return;
              // Claimed before the modal: the confirmation window is part of the
              // operation, so a replace can't start against this same public_id
              // while the user is still deciding.
              setPhotoOpInFlight(true);
              let issued = false;
              try {
                const confirmed = await showConfirmModal('Remove this image from your portfolio?', 'Remove', 'Cancel');
                if (!confirmed) return;

                issued = true;
                const res = await authFetch('/api/artist/photos/portfolio', {
                  method:  'DELETE',
                  body:    JSON.stringify({ publicId, publicIdBare: thumb.dataset.publicIdBare || '' }),
                });
                if (res.ok) {
                  // Recorded before the refresh below, so the stale Search API
                  // listing can't bring this image back.
                  _deletedThisSession.add(publicId);
                  const bare = thumb.dataset.publicIdBare;
                  if (bare) _deletedThisSession.add(bare);
                  thumb.remove();
                  window.toast('Image removed', 'info');
                } else {
                  window.toast('Failed to remove image', 'error');
                }
              } catch {
                window.toast('Error removing image', 'error');
              } finally {
                setPhotoOpInFlight(false);
                // Cancelling changed nothing on the server — no refresh needed.
                if (issued) await loadPhotos(true);
              }
            });
          });
          } // end !isFrozen
        } else {
          grid.innerHTML = '<p class="dash-empty"><svg class="dash-empty-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="0"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>No portfolio images yet.<span class="dash-empty-sub">Upload 3–5 of your best work — clients preview these before booking.</span></p>';
        }
      }

      if (countEl) countEl.textContent = `(${data.count}/16)`;
      _portfolioFull = data.count >= 16;
      if (addBtn)  addBtn.disabled = isFrozen || _portfolioFull || _photoOpInFlight;

    } catch {
      if (requestId !== _photosRequestId) return;
      window.toast('Could not load photos', 'error');
      if (grid) grid.innerHTML = '<p class="dash-empty dash-empty--error">Could not load images — try refreshing.</p>';
      // Don't leave a stale "Loading…" placeholder where the photo should be.
      const _preview = document.getElementById('profilePhotoPreview');
      if (_preview && !_preview.querySelector('img')) {
        _preview.innerHTML = '<span class="profile-photo-empty">Could not load photo</span>';
      }
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
      if (_photoOpInFlight) { profilePhotoInput.value = ''; return; }
      setPhotoOpInFlight(true);
      profilePhotoBtn.innerHTML = '<svg class="btn-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg> Uploading…';
      const preview     = document.getElementById('profilePhotoPreview');
      // CSP img-src forbids blob: URLs, so a local object-URL preview can't render.
      // Show a text placeholder while uploading, then swap in the real https CDN URL.
      if (preview) preview.innerHTML = '<span class="profile-photo-empty">Uploading…</span>';
      try {
        const sig  = await getUploadSignature('profile');
        const uploaded = await uploadToCloudinary(file, sig);
        // Show the real (versioned) CDN URL right away and remember it, so the
        // eventually-consistent loadPhotos() below doesn't revert to "No photo yet".
        if (uploaded && uploaded.secure_url) {
          _pendingProfileUrl = withCloudinaryTransform(uploaded.secure_url, 'q_auto,f_auto,w_680');
          if (preview) {
            const img = document.createElement('img');
            img.src       = _pendingProfileUrl;
            img.alt       = 'Profile photo';
            img.className = 'profile-photo-img';
            preview.innerHTML = '';
            preview.appendChild(img);
          }
        }
        window.toast('Profile photo updated', 'success');
      } catch (err) {
        window.toast(err.message || 'Upload failed', 'error');
      } finally {
        profilePhotoBtn.textContent = 'Upload profile photo';
        profilePhotoInput.value     = '';
        setPhotoOpInFlight(false);
        // Re-renders the preview from the server (falling back to
        // _pendingProfileUrl), so the "Uploading…" placeholder is always
        // replaced — no manual restore of the previous markup needed.
        await loadPhotos(true);
      }
    });
  }

  if (portfolioPhotoBtn) {
    portfolioPhotoBtn.addEventListener('click', () => portfolioPhotoInput.click());
    portfolioPhotoInput.addEventListener('change', async () => {
      const files = Array.from(portfolioPhotoInput.files);
      if (!files.length) return;
      // Check every file before uploading any of them — a batch that would fail
      // halfway is aborted whole, so no bandwidth is spent on a doomed upload.
      const tooBig = files.find(f => f.size > 10 * 1024 * 1024);
      if (tooBig) {
        window.toast(`"${tooBig.name}" is too large (max 10MB) — nothing was uploaded`, 'error');
        portfolioPhotoInput.value = '';
        return;
      }
      const currentCount = (_completenessPhotos && _completenessPhotos.portfolio ? _completenessPhotos.portfolio.length : 0);
      if (currentCount + files.length > 16) {
        window.toast('You can only have 16 portfolio images — remove some first', 'error');
        portfolioPhotoInput.value = '';
        return;
      }
      if (_photoOpInFlight) { portfolioPhotoInput.value = ''; return; }
      setPhotoOpInFlight(true);
      portfolioPhotoBtn.innerHTML = '<svg class="btn-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg> Uploading…';
      try {
        const grid  = document.getElementById('portfolioGrid');
        for (const f of files) {
          const sig = await getUploadSignature('portfolio');
          const uploaded = await uploadToCloudinary(f, sig);
          // Optimistic: append the new image immediately so the user sees it without
          // waiting on the eventually-consistent loadPhotos() below (which re-renders
          // the full grid and reattaches replace/delete handlers).
          if (uploaded && uploaded.secure_url && grid) {
            const empty = grid.querySelector('.dash-empty');
            if (empty) grid.innerHTML = '';
            const div = document.createElement('div');
            div.className = 'portfolio-thumb';
            const img = document.createElement('img');
            img.src     = withCloudinaryTransform(uploaded.secure_url, 'q_auto,f_auto,w_800');
            img.alt     = 'Portfolio image';
            img.loading = 'lazy';
            div.appendChild(img);
            grid.appendChild(div);
          }
        }
        window.toast(`${files.length} image${files.length > 1 ? 's' : ''} added`, 'success');
      } catch (err) {
        window.toast(err.message || 'Upload failed', 'error');
      } finally {
        portfolioPhotoBtn.textContent = 'Add portfolio image';
        portfolioPhotoInput.value     = '';
        setPhotoOpInFlight(false);
        // Always reconcile against the server, success or failure. On a partial
        // batch this keeps the images that did upload (a manual rollback would
        // wrongly remove them) and drops the optimistic thumbs that didn't.
        await loadPhotos(true);
      }
    });
  }

  // Topbar — artist name + logout
  const dashArtistName = document.getElementById('dashArtistName');
  if (dashArtistName) dashArtistName.textContent = artist.name || artist.slug;

  const dashLogout = document.getElementById('dashLogout');
  if (dashLogout) {
    dashLogout.addEventListener('click', async () => {
      dashLogout.disabled = true;
      dashLogout.textContent = 'Logging out…';
      try {
        await fetch(`${INTERNAL}/api/auth/logout`, {
          method: 'POST', credentials: 'include',
          signal: AbortSignal.timeout(5000),
        });
      } catch {}
      localStorage.removeItem('art_token');
      localStorage.removeItem('art_artist');
      window.location.href = 'login.html';
    });
  }

  // Standalone-mode logout icon delegates to the topbar logout logic.
  const pwaLogoutBtn = document.getElementById('pwaLogout');
  if (pwaLogoutBtn && dashLogout) {
    pwaLogoutBtn.addEventListener('click', () => dashLogout.click());
  }

  // ── Frozen (inactive guest) — read-only dashboard + reapply ──
  function applyFrozenState(a) {
    renderFrozenNotice(a);

    // Onboarding doesn't apply to an already-frozen account — drop it rather
    // than let it sit on top of the frozen notice inviting the guest to
    // complete a profile that's about to go read-only.
    const onboarding = document.getElementById('onboardingModal');
    if (onboarding) onboarding.remove();

    // Profile fields → read-only.
    ['profileBio', 'profileInstagram', 'profileWhatsapp', 'profileBookingUrl', 'profileCountry', 'profileStyleInput']
      .forEach(id => { const el = document.getElementById(id); if (el) el.disabled = true; });
    if (profileStyleBtn) profileStyleBtn.disabled = true;

    // Save bar off.
    if (profileSaveBar)  profileSaveBar.style.display = 'none';
    if (profileSaveBtn)  profileSaveBtn.disabled = true;

    // Uploads off (both the add buttons and any already-rendered thumb controls).
    if (profilePhotoBtn)   profilePhotoBtn.disabled = true;
    if (portfolioPhotoBtn) portfolioPhotoBtn.disabled = true;
    document.querySelectorAll('.portfolio-replace-btn, .portfolio-delete-btn')
      .forEach(b => { b.disabled = true; });

    // Re-render the interactive surfaces so their click handlers are dropped,
    // regardless of whether they finished loading before or after loadProfile().
    renderCalendar();
    loadBookings();
  }

  function renderFrozenNotice(a) {
    if (document.getElementById('frozenNotice')) return;
    const dashTabs = document.getElementById('dashTabs');
    if (!dashTabs || !dashTabs.parentNode) return;

    const from = consentDate(a.guest_start_date);
    const to   = consentDate(a.guest_end_date);

    const notice = document.createElement('div');
    notice.id = 'frozenNotice';
    notice.className = 'frozen-notice';

    const label = document.createElement('span');
    label.className = 'frozen-notice-label';
    label.textContent = 'Guest access · Inactive';

    const line = document.createElement('p');
    line.id = 'frozenNoticeLine';
    line.className = 'frozen-notice-line';
    line.textContent = 'Your guest period (' + from + '–' + to + ') has ended, so your dashboard is now read-only and your profile is offline. Want to come back? Request new dates.';

    const btn = document.createElement('button');
    btn.id = 'frozenNoticeBtn';
    btn.className = 'btn btn-primary btn-sm';
    btn.textContent = 'Request new dates';
    btn.addEventListener('click', showReapplyModal);

    notice.appendChild(label);
    notice.appendChild(line);
    notice.appendChild(btn);
    dashTabs.parentNode.insertBefore(notice, dashTabs);
  }

  function removeReapplyModal() {
    const m = document.getElementById('reapplyModal');
    if (m) { m.classList.remove('open'); setTimeout(() => m.remove(), 250); }
    document.removeEventListener('keydown', onReapplyEsc);
  }
  function onReapplyEsc(e) { if (e.key === 'Escape') removeReapplyModal(); }

  // Reapply modal — month-grid range picker ported from js/guest-artist.js.
  function showReapplyModal() {
    const existing = document.getElementById('reapplyModal');
    if (existing) existing.remove();

    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    let calYear    = today.getFullYear();
    let calMonth   = today.getMonth();
    let rangeStart = null;
    let rangeEnd   = null;
    let slotMap    = {};

    const modal = document.createElement('div');
    modal.id = 'reapplyModal';
    modal.className = 'dash-modal-overlay';
    modal.innerHTML = `
      <div class="dash-modal dash-modal--reapply">
        <div id="raBody">
          <p class="dash-modal-tag">Guest access</p>
          <h2 class="dash-modal-title dash-modal-title--sm">Request new dates</h2>
          <p class="dash-modal-text">Pick the range you'd like to come back for. We'll confirm by email.</p>
          <div class="ra-cal-wrap">
            <div class="ra-cal-nav">
              <button type="button" class="ra-cal-nav-btn" id="raCalPrev" aria-label="Previous month">‹</button>
              <span class="ra-cal-month-label" id="raCalMonthLabel"></span>
              <button type="button" class="ra-cal-nav-btn" id="raCalNext" aria-label="Next month">›</button>
            </div>
            <div class="ra-cal-weekdays"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div>
            <div class="ra-cal-grid" id="raCalGrid"></div>
          </div>
          <p class="ra-cal-selection" id="raCalSelection"></p>
          <p class="dash-modal-err" id="raErr"></p>
          <div class="dash-modal-actions dash-modal-actions--row">
            <button class="btn btn-secondary" id="raCancel">Cancel</button>
            <button class="btn btn-primary" id="raSend">Send request</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('open'));

    const grid   = document.getElementById('raCalGrid');
    const label  = document.getElementById('raCalMonthLabel');
    const selEl  = document.getElementById('raCalSelection');
    const errEl  = document.getElementById('raErr');
    const sendBtn = document.getElementById('raSend');

    function toISO(y, m, d) {
      return y + '-' + String(m + 1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
    }

    function updateSelectionLabel() {
      if (!rangeStart)      selEl.textContent = '';
      else if (!rangeEnd)   selEl.textContent = 'Arrival: ' + rangeStart + ' — select departure date';
      else                  selEl.textContent = rangeStart + ' → ' + rangeEnd;
    }

    async function fetchSlots(from, to) {
      try {
        const res = await fetch(INTERNAL + '/api/public/slots/range?from=' + from + '&to=' + to, {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error('slots range failed: ' + res.status);
        const data = await res.json();
        slotMap = {};
        (data.days || []).forEach(d => { slotMap[d.date] = d.available; });
        renderCal();
      } catch {
        // Visible failure: an empty grid would read as "no studio availability"
        // when in fact the request never landed.
        slotMap = {};
        renderCal();
        errEl.textContent = 'Could not load studio availability — dates may be incomplete.';
        errEl.style.display = 'block';
      }
    }

    function renderCal() {
      label.textContent = MONTHS[calMonth] + ' ' + calYear;
      const now      = new Date(); now.setHours(0,0,0,0);
      const todayISO = toISO(now.getFullYear(), now.getMonth(), now.getDate());
      const firstDay = new Date(calYear, calMonth, 1).getDay();
      const offset   = (firstDay + 6) % 7;
      const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

      let cells = '';
      for (let i = 0; i < offset; i++) cells += '<div class="ra-cal-cell ra-cal-cell--empty"></div>';

      for (let d = 1; d <= daysInMonth; d++) {
        const iso     = toISO(calYear, calMonth, d);
        const isPast  = iso < todayISO;
        const isToday = iso === todayISO;
        const slots   = slotMap[iso];
        const isFull  = slots === 0;
        const isLow   = slots === 1;
        const inRange = rangeStart && rangeEnd && iso >= rangeStart && iso <= rangeEnd;
        const isStart = iso === rangeStart;
        const isEnd   = iso === rangeEnd;

        let cls = 'ra-cal-cell';
        if (isPast)            cls += ' ra-cal-cell--past';
        if (isToday)           cls += ' ra-cal-cell--today';
        if (isFull && !isPast) cls += ' ra-cal-cell--full';
        if (isLow  && !isPast) cls += ' ra-cal-cell--low';
        if (inRange)           cls += ' ra-cal-cell--range';
        if (isStart)           cls += ' ra-cal-cell--start';
        if (isEnd)             cls += ' ra-cal-cell--end';

        const disabled = isPast || isFull;
        const dot = isLow && !isPast ? '<span class="ra-cal-dot"></span>' : '';
        cells += '<div class="' + cls + '"' + (disabled ? '' : ' data-iso="' + iso + '"') + '>' +
          '<span class="ra-cal-day-num">' + d + '</span>' + dot + '</div>';
      }

      grid.innerHTML = cells;
      grid.querySelectorAll('.ra-cal-cell[data-iso]').forEach(cell => {
        cell.addEventListener('click', () => {
          const iso = cell.dataset.iso;
          if (!rangeStart || (rangeStart && rangeEnd)) {
            rangeStart = iso; rangeEnd = null;
          } else if (iso < rangeStart) {
            rangeEnd = rangeStart; rangeStart = iso;
          } else if (iso === rangeStart) {
            rangeStart = null; rangeEnd = null;
          } else {
            rangeEnd = iso;
          }
          updateSelectionLabel();
          renderCal();
          if (rangeStart && rangeEnd) fetchSlots(rangeStart, rangeEnd);
        });
      });
    }

    document.getElementById('raCalPrev').addEventListener('click', () => {
      calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
      renderCal();
    });
    document.getElementById('raCalNext').addEventListener('click', () => {
      calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
      renderCal();
    });

    document.addEventListener('keydown', onReapplyEsc);
    document.getElementById('raCancel').addEventListener('click', removeReapplyModal);
    modal.addEventListener('click', e => { if (e.target === modal) removeReapplyModal(); });

    sendBtn.addEventListener('click', async () => {
      if (!rangeStart || !rangeEnd) {
        errEl.textContent = 'Select an arrival and departure date.';
        errEl.style.display = 'block';
        return;
      }
      errEl.style.display = 'none';
      sendBtn.disabled = true;
      sendBtn.textContent = 'Sending…';
      try {
        const res = await authFetch('/api/artist/reapply', {
          method: 'POST',
          body:   JSON.stringify({ dateFrom: rangeStart, dateTo: rangeEnd }),
        });
        if (!res.ok) {
          let msg = 'Something went wrong. Please try again.';
          try { const data = await res.json(); if (data && data.error) msg = data.error; } catch {}
          throw new Error(msg);
        }
        window.toast('Request sent', 'success');
        sendBtn.textContent = 'Request sent';

        const body = document.getElementById('raBody');
        if (body) {
          body.innerHTML = `
            <div class="ra-confirm">
              <span class="ra-confirm-check">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              <h2 class="dash-modal-title dash-modal-title--sm">Request sent</h2>
              <p class="dash-modal-text">Request sent — we'll confirm your new dates by email within 2–3 days.</p>
              <div class="dash-modal-actions"><button class="btn btn-primary" id="raDone">Close</button></div>
            </div>
          `;
          const done = document.getElementById('raDone');
          if (done) done.addEventListener('click', removeReapplyModal);
        }

        const noticeLine = document.getElementById('frozenNoticeLine');
        if (noticeLine) noticeLine.textContent = "New dates requested — we'll be in touch.";
      } catch (e) {
        const msg = e && e.message ? e.message : 'Something went wrong. Please try again.';
        window.toast(msg, 'error');
        errEl.textContent = msg;
        errEl.style.display = 'block';
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send request';
      }
    });

    updateSelectionLabel();
    renderCal();
    // Prime the next 3 months of slot availability.
    (function () {
      const now = new Date();
      const from = toISO(now.getFullYear(), now.getMonth(), now.getDate());
      const end  = new Date(now.getFullYear(), now.getMonth() + 3, 0);
      fetchSlots(from, toISO(end.getFullYear(), end.getMonth(), end.getDate()));
    })();
  }

  loadBookings();
  loadAvailability();
  loadConsent();
  loadProfile();
  loadPhotos();
  initSSE();

  // Silent token refresh every 13 minutes (access token expires at 15min)
  setInterval(async () => {
    try {
      const res = await refreshAccessToken();
      if (res.ok) {
        _token = res.token;
        localStorage.setItem('art_token', _token);
        clearSessionSuspect();
      } else {
        // Includes a 401: a background refresh may not end the session on its
        // own. The next user-driven authFetch decides.
        markSessionSuspect();
      }
    } catch {}
  }, 13 * 60 * 1000);

  // Refresh token when tab becomes visible again after inactivity
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const res = await refreshAccessToken();
      if (res.ok) {
        _token = res.token;
        localStorage.setItem('art_token', _token);
        clearSessionSuspect();
      } else {
        markSessionSuspect();
      }
    } catch {}
  });

  // ── Change Password Modal ──
  function showChangePasswordModal({ voluntary = false } = {}) {
    const existing = document.getElementById('pwModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'pwModal';
    modal.className = 'dash-modal-overlay open';
    modal.innerHTML = `
      <div class="dash-modal">
        <p class="dash-modal-tag">${voluntary ? 'Account' : 'Welcome to Appreciart IE'}</p>
        <h2 class="dash-modal-title">${voluntary ? 'Change password' : 'Set your password'}</h2>
        <div class="form-field">
          <label class="form-label" for="pwOld">${voluntary ? 'Current password' : 'Temporary password'}</label>
          <input class="form-input" type="password" id="pwOld" placeholder="${voluntary ? 'Your current password' : 'From your approval email'}" autocomplete="current-password">
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
          ${voluntary ? '<button class="btn btn-secondary" id="pwCancel">Cancel</button>' : ''}
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    function closePwModal() {
      modal.remove();
      document.removeEventListener('keydown', pwEscHandler);
    }
    function pwEscHandler(e) { if (e.key === 'Escape') closePwModal(); }

    if (voluntary) {
      document.addEventListener('keydown', pwEscHandler);
      document.getElementById('pwCancel').addEventListener('click', closePwModal);
      modal.addEventListener('click', e => { if (e.target === modal) closePwModal(); });
    }

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
        if (!res.ok) {
          let msg = 'Failed to save password';
          try { const data = await res.json(); if (data && data.error) msg = data.error; } catch {}
          err.textContent = msg;
          err.style.display = 'block';
          return;
        }

        // Update stored artist
        const stored = JSON.parse(localStorage.getItem('art_artist') || '{}');
        stored.must_change_password = false;
        localStorage.setItem('art_artist', JSON.stringify(stored));

        closePwModal();
        window.toast('Password updated', 'success');

        if (!voluntary && artist.role === 'guest' && !artist.onboarding_done) {
          showOnboardingModal();
        }
      } catch {
        err.textContent = 'Something went wrong. Please try again.';
        err.style.display = 'block';
        err.classList.add('dash-modal-err');
      }
    });
  }

  const changePwBtn = document.getElementById('changePwBtn');
  if (changePwBtn) {
    changePwBtn.addEventListener('click', () => showChangePasswordModal({ voluntary: true }));
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