'use strict';

const API_BASE = 'https://appreciart-internal-production-ee3c.up.railway.app';

// ── AUTH ──────────────────────────────────────────────────────────────────────

let _adminSecret = null;

async function initAdminSecret() {
  if (_adminSecret) return _adminSecret;
  try {
    const res = await fetch(API_BASE + '/api/admin/config', {
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error('Failed to load config');
    const data = await res.json();
    _adminSecret = data.admin_secret;
    return _adminSecret;
  } catch (err) {
    console.error('[admin] Failed to load admin secret:', err.message);
    document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;color:#c00;">Failed to connect to server. Please try again.</div>';
    return null;
  }
}

async function api(path, options = {}) {
  const secret = await initAdminSecret();
  if (!secret) return;
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-secret': secret,
      ...(options.headers || {}),
    },
  });
  if (res.status === 401 || res.status === 403) {
    document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;color:#c00;">Access denied.</div>';
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── NAVIGATION ────────────────────────────────────────────────────────────────

const SECTION_TITLES = {
  overview:     'Overview',
  applications: 'Applications',
  artists:      'Artists',
  studio:       'Studio',
  bookings:     'Bookings',
  consent:      'Consent Forms',
};

function showSection(name) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.admin-nav-btn, .admin-bottom-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.section === name);
  });
  const section = document.getElementById('section-' + name);
  if (section) section.classList.add('active');
  const titleEl = document.getElementById('adminPageTitle');
  if (titleEl) titleEl.textContent = SECTION_TITLES[name] || name;
  const inner = section && section.querySelector('.admin-section-inner');
  if (inner && inner.children.length === 0) loadSection(name, inner);
}

function loadSection(name, inner) {
  switch (name) {
    case 'overview':     renderOverview(inner);     break;
    case 'applications': renderApplications(inner); break;
    case 'artists':      renderArtists(inner);      break;
    case 'studio':       renderStudio(inner);       break;
    case 'bookings':     renderBookings(inner);     break;
    case 'consent':      renderConsent(inner);      break;
  }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function fmtDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function fmtDateTime(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusPill(status) {
  const map = {
    pending: 'pending', approved: 'approved', rejected: 'rejected',
    active: 'active', inactive: 'inactive', guest: 'guest',
    confirmed: 'confirmed', completed: 'completed', cancelled: 'cancelled',
    new_lead: 'inactive', contacted: 'guest', deposit_paid: 'approved',
  };
  const cls = map[status] || 'inactive';
  return `<span class="status-pill status-${esc(cls)}">${esc(status || '—')}</span>`;
}

function skeletonRows(cols, rows = 5) {
  let html = '';
  for (let r = 0; r < rows; r++) {
    html += '<tr>';
    for (let c = 0; c < cols; c++) {
      html += `<td><div class="admin-skeleton admin-skeleton--${c === 0 ? 'sm' : 'md'}"></div></td>`;
    }
    html += '</tr>';
  }
  return html;
}

function emptyState(icon, title, sub = '') {
  return `
    <div class="admin-empty">
      <i data-lucide="${esc(icon)}" style="width:40px;height:40px;margin:0 auto 12px;opacity:0.25;display:block;"></i>
      <div class="admin-empty-title">${esc(title)}</div>
      ${sub ? `<div class="admin-empty-sub">${esc(sub)}</div>` : ''}
    </div>`;
}

// ── MODAL ─────────────────────────────────────────────────────────────────────

function openModal(title, bodyHTML, footerHTML = '') {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay';
  overlay.id = 'adminModal';
  overlay.innerHTML = `
    <div class="admin-modal" role="dialog" aria-modal="true">
      <div class="admin-modal-header">
        <span class="admin-modal-title">${esc(title)}</span>
        <button class="admin-modal-close" id="modalCloseBtn" aria-label="Close">
          <i data-lucide="x" style="width:16px;height:16px;"></i>
        </button>
      </div>
      <div class="admin-modal-body">${bodyHTML}</div>
      ${footerHTML ? `<div class="admin-modal-footer">${footerHTML}</div>` : ''}
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => overlay.classList.add('open'));
  });
  overlay.querySelector('#modalCloseBtn').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', onEsc);
  lucide.createIcons();
}

function closeModal() {
  const overlay = document.getElementById('adminModal');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.removeEventListener('keydown', onEsc);
  overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 400);
}

function onEsc(e) { if (e.key === 'Escape') closeModal(); }

// ── OVERVIEW ──────────────────────────────────────────────────────────────────

async function renderOverview(inner) {
  inner.innerHTML = `
    <div class="admin-stats" id="overviewStats">
      ${['','','',''].map(() => `
        <div class="admin-stat-card">
          <div class="admin-skeleton admin-skeleton--sm" style="height:9px;margin-bottom:12px;"></div>
          <div class="admin-skeleton admin-skeleton--lg" style="height:48px;"></div>
        </div>`).join('')}
    </div>`;
  try {
    const d = await api('/api/admin/overview');
    const ov = d.overview || d;
    document.getElementById('overviewStats').innerHTML = `
      <div class="admin-stat-card">
        <div class="admin-stat-label">Pending Applications</div>
        <div class="admin-stat-value">${esc(String(ov.pending_applications ?? 0))}</div>
        <div class="admin-stat-sub">awaiting review</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-label">Active Artists</div>
        <div class="admin-stat-value">${esc(String(ov.active_artists ?? 0))}</div>
        <div class="admin-stat-sub">in studio</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-label">Bookings This Month</div>
        <div class="admin-stat-value">${esc(String(ov.bookings_this_month ?? 0))}</div>
        <div class="admin-stat-sub">confirmed sessions</div>
      </div>
      <div class="admin-stat-card">
        <div class="admin-stat-label">New Leads</div>
        <div class="admin-stat-value">${esc(String(ov.new_leads_this_week ?? 0))}</div>
        <div class="admin-stat-sub">this week</div>
      </div>`;
  } catch (err) {
    document.getElementById('overviewStats').innerHTML = emptyState('alert-circle', 'Failed to load stats', err.message);
  }
  lucide.createIcons();
}

// ── APPLICATIONS ──────────────────────────────────────────────────────────────

async function renderApplications(inner) {
  inner.innerHTML = `
    <div class="admin-section-header">
      <span class="admin-section-title">Guest Artist Applications</span>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>Name</th><th>Email</th><th>Dates</th><th>Submitted</th><th>Status</th>
        </tr></thead>
        <tbody id="appsTbody">${skeletonRows(5)}</tbody>
      </table>
    </div>`;
  lucide.createIcons();
  try {
    const d = await api('/api/admin/applications');
    const apps = d.applications || d || [];
    const tbody = document.getElementById('appsTbody');
    if (!apps.length) {
      tbody.innerHTML = `<tr><td colspan="5">${emptyState('inbox', 'No applications yet', 'Guest artist applications will appear here')}</td></tr>`;
      lucide.createIcons();
      return;
    }
    tbody.innerHTML = apps.map(a => `
      <tr data-id="${esc(String(a.id))}">
        <td><strong>${esc(a.name)}</strong></td>
        <td>${esc(a.email)}</td>
        <td>${esc(fmtDate(a.start_date))} → ${esc(fmtDate(a.end_date))}</td>
        <td style="color:var(--sec-grey);font-size:12px;">${esc(fmtDate(a.created_at))}</td>
        <td>${statusPill(a.status)}</td>
      </tr>`).join('');
    tbody.querySelectorAll('tr[data-id]').forEach(row => {
      row.addEventListener('click', () => {
        const app = apps.find(a => String(a.id) === row.dataset.id);
        if (app) openApplicationModal(app, inner);
      });
    });
    lucide.createIcons();
  } catch (err) {
    document.getElementById('appsTbody').innerHTML =
      `<tr><td colspan="5">${emptyState('alert-circle', 'Failed to load', err.message)}</td></tr>`;
    lucide.createIcons();
  }
}

function openApplicationModal(app, listInner) {
  const isPending = app.status === 'pending';
  const body = `
    <div class="admin-detail-row"><span class="admin-detail-label">Name</span><span class="admin-detail-value">${esc(app.name)}</span></div>
    <div class="admin-detail-row"><span class="admin-detail-label">Email</span><span class="admin-detail-value">${esc(app.email)}</span></div>
    <div class="admin-detail-row"><span class="admin-detail-label">WhatsApp</span><span class="admin-detail-value">${esc(app.whatsapp || '—')}</span></div>
    <div class="admin-detail-row"><span class="admin-detail-label">Dates</span><span class="admin-detail-value">${esc(fmtDate(app.start_date))} → ${esc(fmtDate(app.end_date))}</span></div>
    <div class="admin-detail-row"><span class="admin-detail-label">Instagram</span><span class="admin-detail-value">${esc(app.instagram || '—')}</span></div>
    <div class="admin-detail-row"><span class="admin-detail-label">Message</span><span class="admin-detail-value">${esc(app.message || '—')}</span></div>
    <div class="admin-detail-row"><span class="admin-detail-label">Status</span><span class="admin-detail-value">${statusPill(app.status)}</span></div>
    <div class="admin-detail-row"><span class="admin-detail-label">Submitted</span><span class="admin-detail-value">${esc(fmtDateTime(app.created_at))}</span></div>`;
  const footer = isPending ? `
    <button class="btn-secondary" id="modalRejectBtn">Reject</button>
    <button class="btn-primary" id="modalApproveBtn">Approve</button>` : '';
  openModal('Application — ' + app.name, body, footer);
  if (isPending) {
    document.getElementById('modalApproveBtn').addEventListener('click', () => approveApplication(app.id, listInner));
    document.getElementById('modalRejectBtn').addEventListener('click', () => rejectApplication(app.id, listInner));
  }
}

async function approveApplication(id, listInner) {
  const btn = document.getElementById('modalApproveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Approving…'; }
  try {
    await api('/api/admin/applications/' + id + '/approve', { method: 'POST' });
    window.toast('Application approved — credentials sent', 'success');
    closeModal();
    listInner.innerHTML = '';
    renderApplications(listInner);
    updatePendingBadge();
  } catch (err) {
    window.toast(err.message || 'Failed to approve', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Approve'; }
  }
}

async function rejectApplication(id, listInner) {
  const btn = document.getElementById('modalRejectBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Rejecting…'; }
  try {
    await api('/api/admin/applications/' + id + '/reject', { method: 'POST' });
    window.toast('Application rejected', 'info');
    closeModal();
    listInner.innerHTML = '';
    renderApplications(listInner);
    updatePendingBadge();
  } catch (err) {
    window.toast(err.message || 'Failed to reject', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Reject'; }
  }
}

async function updatePendingBadge() {
  try {
    const d = await api('/api/admin/overview');
    const badge = document.getElementById('badgePending');
    if (badge) badge.textContent = d.pending_applications > 0 ? String(d.pending_applications) : '';
  } catch { /* silent */ }
}

// ── ARTISTS ───────────────────────────────────────────────────────────────────

async function renderArtists(inner) {
  inner.innerHTML = `
    <div class="admin-section-header">
      <span class="admin-section-title">Artists</span>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>Name</th><th>Role</th><th>Email</th><th>Deposit</th><th>Status</th>
        </tr></thead>
        <tbody id="artistsTbody">${skeletonRows(5)}</tbody>
      </table>
    </div>`;
  lucide.createIcons();
  try {
    const d = await api('/api/admin/artists');
    const artists = d.artists || d || [];
    const tbody = document.getElementById('artistsTbody');
    if (!artists.length) {
      tbody.innerHTML = `<tr><td colspan="5">${emptyState('users', 'No artists found')}</td></tr>`;
      lucide.createIcons();
      return;
    }
    tbody.innerHTML = artists.map(a => `
      <tr data-id="${esc(String(a.id))}">
        <td><strong>${esc(a.name)}</strong></td>
        <td>${statusPill(a.role)}</td>
        <td style="font-size:12px;color:var(--mid);">${esc(a.email)}</td>
        <td>€${esc(String(a.deposit_amount ?? 0))}</td>
        <td>${statusPill(a.active ? 'active' : 'inactive')}</td>
      </tr>`).join('');
    tbody.querySelectorAll('tr[data-id]').forEach(row => {
      row.addEventListener('click', () => {
        const artist = artists.find(a => String(a.id) === row.dataset.id);
        if (artist) openArtistModal(artist, inner);
      });
    });
    lucide.createIcons();
  } catch (err) {
    document.getElementById('artistsTbody').innerHTML =
      `<tr><td colspan="5">${emptyState('alert-circle', 'Failed to load', err.message)}</td></tr>`;
    lucide.createIcons();
  }
}

function openArtistModal(artist, listInner) {
  const body = `
    <div class="admin-field">
      <label class="admin-label">Name</label>
      <input class="admin-input" id="editName" value="${esc(artist.name)}" maxlength="100">
    </div>
    <div class="admin-field">
      <label class="admin-label">Deposit Amount (€)</label>
      <input class="admin-input" id="editDeposit" type="number" min="0" value="${esc(String(artist.deposit_amount ?? 0))}">
    </div>
    <div class="admin-field">
      <label class="admin-label">Role</label>
      <select class="admin-select" id="editRole">
        <option value="resident" ${artist.role === 'resident' ? 'selected' : ''}>Resident</option>
        <option value="guest"    ${artist.role === 'guest'    ? 'selected' : ''}>Guest</option>
        <option value="admin"    ${artist.role === 'admin'    ? 'selected' : ''}>Admin</option>
      </select>
    </div>
    <div class="admin-field">
      <label class="admin-label">Guest Start Date</label>
      <input class="admin-input" id="editGuestStart" type="date" value="${esc(artist.guest_start_date ? artist.guest_start_date.slice(0,10) : '')}">
    </div>
    <div class="admin-field">
      <label class="admin-label">Guest End Date</label>
      <input class="admin-input" id="editGuestEnd" type="date" value="${esc(artist.guest_end_date ? artist.guest_end_date.slice(0,10) : '')}">
    </div>
    <div class="admin-detail-row" style="margin-top:8px;">
      <span class="admin-detail-label">Email</span>
      <span class="admin-detail-value" style="font-size:12px;color:var(--mid);">${esc(artist.email)}</span>
    </div>
    <div class="admin-detail-row">
      <span class="admin-detail-label">Status</span>
      <span class="admin-detail-value">${statusPill(artist.active ? 'active' : 'inactive')}</span>
    </div>`;
  const footer = `
    ${artist.active
      ? `<button class="btn-danger" id="artistDeactivateBtn">Deactivate</button>`
      : `<button class="btn-secondary" id="artistActivateBtn">Activate</button>`}
    <button class="btn-primary" id="artistSaveBtn">Save Changes</button>`;
  openModal('Artist — ' + artist.name, body, footer);
  document.getElementById('artistSaveBtn').addEventListener('click', () => saveArtist(artist.id, listInner));
  const deact = document.getElementById('artistDeactivateBtn');
  const act   = document.getElementById('artistActivateBtn');
  if (deact) deact.addEventListener('click', () => toggleArtist(artist.id, false, listInner));
  if (act)   act.addEventListener('click',   () => toggleArtist(artist.id, true,  listInner));
}

async function saveArtist(id, listInner) {
  const btn = document.getElementById('artistSaveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    const payload = {
      name:             document.getElementById('editName').value.trim(),
      deposit_amount:   parseFloat(document.getElementById('editDeposit').value) || 0,
      role:             document.getElementById('editRole').value,
      guest_start_date: document.getElementById('editGuestStart').value || null,
      guest_end_date:   document.getElementById('editGuestEnd').value   || null,
    };
    await api('/api/admin/artists/' + id, { method: 'PATCH', body: JSON.stringify(payload) });
    window.toast('Artist updated', 'success');
    closeModal();
    listInner.innerHTML = '';
    renderArtists(listInner);
  } catch (err) {
    window.toast(err.message || 'Failed to save', 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
  }
}

async function toggleArtist(id, activate, listInner) {
  const endpoint = activate ? '/activate' : '/deactivate';
  const btnId    = activate ? 'artistActivateBtn' : 'artistDeactivateBtn';
  const btn      = document.getElementById(btnId);
  if (btn) { btn.disabled = true; btn.textContent = activate ? 'Activating…' : 'Deactivating…'; }
  try {
    await api('/api/admin/artists/' + id + endpoint, { method: 'PATCH' });
    window.toast('Artist ' + (activate ? 'activated' : 'deactivated'), 'success');
    closeModal();
    listInner.innerHTML = '';
    renderArtists(listInner);
  } catch (err) {
    window.toast(err.message || 'Failed', 'error');
    if (btn) { btn.disabled = false; btn.textContent = activate ? 'Activate' : 'Deactivate'; }
  }
}

// ── STUDIO ────────────────────────────────────────────────────────────────────

function renderStudio(inner) {
  inner.innerHTML = `
    <div class="admin-section-header">
      <span class="admin-section-title">Studio Calendar</span>
    </div>
    ${emptyState('calendar', 'Studio calendar coming soon', 'Full calendar view will be available here')}`;
  lucide.createIcons();
}

// ── BOOKINGS ──────────────────────────────────────────────────────────────────

let bookingsPage = 1;

async function renderBookings(inner, page = 1) {
  bookingsPage = page;
  inner.innerHTML = `
    <div class="admin-section-header">
      <span class="admin-section-title">Bookings</span>
      <div style="display:flex;gap:8px;align-items:center;">
        <select class="admin-select" id="bookingsStageFilter" style="width:auto;padding:7px 12px;font-size:12px;">
          <option value="">All stages</option>
          <option>new_lead</option><option>contacted</option>
          <option>deposit_paid</option><option>confirmed</option>
          <option>completed</option><option>cancelled</option>
        </select>
      </div>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>Client</th><th>Artist</th><th>Date</th><th>Stage</th><th>Amount</th>
        </tr></thead>
        <tbody id="bookingsTbody">${skeletonRows(5)}</tbody>
      </table>
      <div id="bookingsPagination"></div>
    </div>`;
  lucide.createIcons();
  document.getElementById('bookingsStageFilter').addEventListener('change', () => {
    inner.querySelector('#bookingsTbody').innerHTML = skeletonRows(5);
    loadBookings(inner, 1);
  });
  loadBookings(inner, page);
}

async function loadBookings(inner, page) {
  const stage = document.getElementById('bookingsStageFilter')?.value || '';
  const tbody  = document.getElementById('bookingsTbody');
  const pagDiv = document.getElementById('bookingsPagination');
  try {
    const d = await api(`/api/admin/bookings?page=${page}&limit=20&stage=${encodeURIComponent(stage)}`);
    const bookings = d.bookings || [];
    if (!bookings.length) {
      tbody.innerHTML = `<tr><td colspan="5">${emptyState('clipboard-list', 'No bookings found')}</td></tr>`;
      if (pagDiv) pagDiv.innerHTML = '';
      lucide.createIcons();
      return;
    }
    tbody.innerHTML = bookings.map(b => `
      <tr>
        <td><strong>${esc(b.client_name || '—')}</strong><br><span style="font-size:11px;color:var(--sec-grey);">${esc(b.client_email || '')}</span></td>
        <td style="font-size:12px;">${esc(b.artist_name || '—')}</td>
        <td style="font-size:12px;color:var(--mid);">${esc(fmtDate(b.date || b.created_at))}</td>
        <td>${statusPill(b.stage)}</td>
        <td style="font-size:12px;">€${esc(String(b.amount ?? 0))}</td>
      </tr>`).join('');
    if (pagDiv && d.total) renderPagination(pagDiv, page, d.total, 20, p => loadBookings(inner, p));
    lucide.createIcons();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">${emptyState('alert-circle', 'Failed to load', err.message)}</td></tr>`;
    lucide.createIcons();
  }
}

// ── CONSENT FORMS ─────────────────────────────────────────────────────────────

async function renderConsent(inner, page = 1) {
  inner.innerHTML = `
    <div class="admin-section-header">
      <span class="admin-section-title">Consent Forms</span>
      <div style="display:flex;gap:8px;align-items:center;">
        <div style="position:relative;">
          <input class="admin-input" id="consentSearch" placeholder="Search by name or email…" style="padding-left:32px;width:220px;font-size:12px;">
          <i data-lucide="search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);width:14px;height:14px;color:var(--sec-grey);pointer-events:none;"></i>
        </div>
      </div>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>Name</th><th>Email</th><th>Date of Birth</th><th>Submitted</th><th>Photo Consent</th>
        </tr></thead>
        <tbody id="consentTbody">${skeletonRows(5)}</tbody>
      </table>
      <div id="consentPagination"></div>
    </div>`;
  lucide.createIcons();
  let searchTimer;
  document.getElementById('consentSearch').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      inner.querySelector('#consentTbody').innerHTML = skeletonRows(5);
      loadConsent(inner, 1);
    }, 350);
  });
  loadConsent(inner, page);
}

async function loadConsent(inner, page) {
  const search = document.getElementById('consentSearch')?.value.trim() || '';
  const tbody  = document.getElementById('consentTbody');
  const pagDiv = document.getElementById('consentPagination');
  try {
    const d = await api(`/api/admin/consent-forms?page=${page}&limit=20&search=${encodeURIComponent(search)}`);
    const forms = d.forms || d.consent_forms || [];
    if (!forms.length) {
      tbody.innerHTML = `<tr><td colspan="5">${emptyState('file-text', 'No consent forms found')}</td></tr>`;
      if (pagDiv) pagDiv.innerHTML = '';
      lucide.createIcons();
      return;
    }
    tbody.innerHTML = forms.map(f => `
      <tr data-id="${esc(String(f.id))}">
        <td><strong>${esc((f.client_first_name || '') + ' ' + (f.client_last_name || ''))}</strong></td>
        <td style="font-size:12px;color:var(--mid);">${esc(f.client_email || '—')}</td>
        <td style="font-size:12px;">${esc(f.date_of_birth || '—')}</td>
        <td style="font-size:12px;color:var(--sec-grey);">${esc(fmtDate(f.submitted_at))}</td>
        <td>${f.photo_consent ? '<span class="status-pill status-approved">Yes</span>' : '<span class="status-pill status-inactive">No</span>'}</td>
      </tr>`).join('');
    tbody.querySelectorAll('tr[data-id]').forEach(row => {
      row.addEventListener('click', () => openConsentModal(row.dataset.id));
    });
    if (pagDiv && d.total) renderPagination(pagDiv, page, d.total, 20, p => loadConsent(inner, p));
    lucide.createIcons();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">${emptyState('alert-circle', 'Failed to load', err.message)}</td></tr>`;
    lucide.createIcons();
  }
}

async function openConsentModal(id) {
  openModal('Consent Form', `<div class="admin-loading">Loading…</div>`);
  try {
    const f = await api('/api/admin/consent-forms/' + id);
    const form = f.consent_form || f;
    const fields = [
      ['Full Name',      (form.client_first_name || '') + ' ' + (form.client_last_name || '')],
      ['Email',          form.client_email],
      ['Phone',          form.client_phone],
      ['Date of Birth',  form.date_of_birth],
      ['Eircode',        form.eircode],
      ['Artist',         form.artist_name],
      ['Medical',        form.has_medical ? (form.medical_details || 'Yes') : 'No'],
      ['Medications',    form.has_medications ? (form.medication_details || 'Yes') : 'No'],
      ['Bloodborne',     form.has_bloodborne ? (form.bloodborne_details || 'Yes') : 'No'],
      ['Photo Consent',  form.photo_consent ? 'Yes' : 'No'],
      ['Signature',      form.signature ? 'Provided' : 'Not provided'],
      ['Submitted',      fmtDateTime(form.submitted_at)],
    ];
    const body = fields.map(([label, val]) => `
      <div class="admin-detail-row">
        <span class="admin-detail-label">${esc(label)}</span>
        <span class="admin-detail-value">${esc(String(val ?? '—'))}</span>
      </div>`).join('');
    const modal = document.getElementById('adminModal');
    if (modal) {
      modal.querySelector('.admin-modal-body').innerHTML = body;
      lucide.createIcons();
    }
  } catch (err) {
    const modal = document.getElementById('adminModal');
    if (modal) modal.querySelector('.admin-modal-body').innerHTML = emptyState('alert-circle', 'Failed to load', err.message);
    lucide.createIcons();
  }
}

// ── PAGINATION ────────────────────────────────────────────────────────────────

function renderPagination(container, currentPage, total, limit, onPageChange) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  const start = (currentPage - 1) * limit + 1;
  const end   = Math.min(currentPage * limit, total);
  let btns = '';
  for (let i = 1; i <= totalPages; i++) {
    btns += `<button class="${i === currentPage ? 'active' : ''}" data-page="${i}"${i === currentPage ? ' disabled' : ''}>${i}</button>`;
  }
  container.innerHTML = `
    <div class="admin-pagination">
      <span>Showing ${start}–${end} of ${total}</span>
      <div class="admin-pagination-btns">${btns}</div>
    </div>`;
  container.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => onPageChange(parseInt(btn.dataset.page)));
  });
}

// ── INIT ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  guardAuth();

  const user = getUser();
  const nameEl = document.getElementById('adminArtistName');
  if (nameEl && user) nameEl.textContent = user.name || user.email || '';

  document.querySelectorAll('.admin-nav-btn[data-section], .admin-bottom-btn[data-section]').forEach(btn => {
    btn.addEventListener('click', () => showSection(btn.dataset.section));
  });

  document.getElementById('adminSignOut').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  });

  showSection('overview');
  updatePendingBadge();
});
