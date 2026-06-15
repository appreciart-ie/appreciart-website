'use strict';

(function () {
  const INTERNAL = 'https://appreciart-internal-production-ee3c.up.railway.app';

  // ── FORM ──
  const formInner  = document.getElementById('gaFormInner');
  const successEl  = document.getElementById('gaSuccess');
  const submitBtn  = document.getElementById('gaSubmitBtn');
  const generalErr = document.getElementById('gaGeneralErr');

  // Existing artists are already part of the studio — the guest application
  // doesn't apply to them. Replace the form with a dashboard notice.
  if (localStorage.getItem('art_token')) {
    if (formInner) {
      formInner.innerHTML =
        '<div style="text-align:center;padding:60px 24px;">' +
          '<h2 style="margin:0 0 12px;">You\'re already part of Appreciart</h2>' +
          '<p style="margin:0 0 24px;color:#555;">This application is for new guest artists. Manage your profile and sessions from your dashboard.</p>' +
          '<a href="dashboard.html" class="btn btn-primary">Go to Dashboard</a>' +
        '</div>';
    }
    return;
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      ['gaNameErr', 'gaEmailErr', 'gaInstagramErr'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('visible');
      });
      generalErr.classList.remove('visible');

      const name      = document.getElementById('gaName').value.trim();
      const email     = document.getElementById('gaEmail').value.trim();
      const instagram = document.getElementById('gaInstagram').value.trim();
      const styles    = document.getElementById('gaStyles').value.trim();
      const dateFrom  = document.getElementById('gaDateFrom').value;
      const dateTo    = document.getElementById('gaDateTo').value;
      const dates     = dateFrom && dateTo ? `${dateFrom} to ${dateTo}` : (dateFrom || dateTo || '');
      const howFound  = document.getElementById('gaHowFound').value;
      const honeypot  = document.querySelector('.ga-honeypot').value;

      const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      let valid = true;

      if (!name)                      { document.getElementById('gaNameErr').classList.add('visible');      valid = false; }
      if (!email || !emailRe.test(email)) { document.getElementById('gaEmailErr').classList.add('visible');     valid = false; }
      if (!instagram)                 { document.getElementById('gaInstagramErr').classList.add('visible'); valid = false; }
      if (!valid) return;
      if (honeypot) return;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      try {
        const res = await fetch(`${INTERNAL}/api/public/guests/apply`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            instagram,
            styles:          styles   || undefined,
            preferred_dates: dates    || undefined,
            how_found:       howFound || undefined,
            _honeypot:       honeypot,
          }),
          signal: AbortSignal.timeout(15000),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Something went wrong');

        toast('Application submitted successfully', 'success');
        formInner.style.display = 'none';
        successEl.classList.add('visible');
        successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

      } catch (err) {
        const errMsg = err.message || 'Something went wrong. Please try again.';
        toast(errMsg, 'error');
        generalErr.textContent = errMsg;
        generalErr.classList.add('visible');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Application';
      }
    });
  }

  // ── CALENDAR RANGE PICKER ──
  const dateFromEl  = document.getElementById('gaDateFrom');
  const dateToEl    = document.getElementById('gaDateTo');
  const calGrid     = document.getElementById('gaCalGrid');
  const calLabel    = document.getElementById('gaCalMonthLabel');
  const calPrev     = document.getElementById('gaCalPrev');
  const calNext     = document.getElementById('gaCalNext');
  const calSel      = document.getElementById('gaCalSelection');

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  var calYear   = new Date().getFullYear();
  var calMonth  = new Date().getMonth();
  var rangeStart = null;
  var rangeEnd   = null;
  var slotMap    = {};

  function toISO(y, m, d) {
    return y + '-' + String(m + 1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
  }

  function updateHiddenInputs() {
    if (dateFromEl) dateFromEl.value = rangeStart || '';
    if (dateToEl)   dateToEl.value   = rangeEnd   || '';
  }

  function updateSelectionLabel() {
    if (!calSel) return;
    if (!rangeStart) {
      calSel.textContent = '';
    } else if (!rangeEnd) {
      calSel.textContent = 'Arrival: ' + rangeStart + ' — select departure date';
    } else {
      calSel.textContent = rangeStart + ' → ' + rangeEnd;
    }
  }

  async function fetchSlots(from, to) {
    try {
      const res = await fetch(INTERNAL + '/api/public/slots/range?from=' + from + '&to=' + to, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      const data = await res.json();
      slotMap = {};
      (data.days || []).forEach(function(d) { slotMap[d.date] = d.available; });
      renderCal();
    } catch (_) {}
  }

  function renderCal() {
    if (!calGrid || !calLabel) return;
    calLabel.textContent = MONTHS[calMonth] + ' ' + calYear;

    var today    = new Date(); today.setHours(0,0,0,0);
    var todayISO = toISO(today.getFullYear(), today.getMonth(), today.getDate());

    var firstDay = new Date(calYear, calMonth, 1).getDay();
    var offset   = (firstDay + 6) % 7;
    var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

    var cells = '';
    for (var i = 0; i < offset; i++) cells += '<div class="ga-cal-cell ga-cal-cell--empty"></div>';

    for (var d = 1; d <= daysInMonth; d++) {
      var iso      = toISO(calYear, calMonth, d);
      var isPast   = iso < todayISO;
      var isToday  = iso === todayISO;
      var slots    = slotMap[iso];
      var isFull   = slots === 0;
      var isLow    = slots === 1;
      var inRange  = rangeStart && rangeEnd && iso >= rangeStart && iso <= rangeEnd;
      var isStart  = iso === rangeStart;
      var isEnd    = iso === rangeEnd;

      var cls = 'ga-cal-cell';
      if (isPast)   cls += ' ga-cal-cell--past';
      if (isToday)  cls += ' ga-cal-cell--today';
      if (isFull && !isPast) cls += ' ga-cal-cell--full';
      if (isLow  && !isPast) cls += ' ga-cal-cell--low';
      if (inRange)  cls += ' ga-cal-cell--range';
      if (isStart)  cls += ' ga-cal-cell--start';
      if (isEnd)    cls += ' ga-cal-cell--end';

      var disabled = isPast || isFull;
      var dot = isLow && !isPast ? '<span class="ga-cal-dot"></span>' : '';

      cells += '<div class="' + cls + '"' + (disabled ? '' : ' data-iso="' + iso + '"') + '>' +
        '<span class="ga-cal-day-num">' + d + '</span>' + dot +
        '</div>';
    }

    calGrid.innerHTML = cells;

    calGrid.querySelectorAll('.ga-cal-cell[data-iso]').forEach(function(cell) {
      cell.addEventListener('click', function() {
        var iso = cell.dataset.iso;
        if (!rangeStart || (rangeStart && rangeEnd)) {
          rangeStart = iso;
          rangeEnd   = null;
        } else {
          if (iso < rangeStart) {
            rangeEnd   = rangeStart;
            rangeStart = iso;
          } else if (iso === rangeStart) {
            rangeStart = null;
            rangeEnd   = null;
          } else {
            rangeEnd = iso;
          }
        }
        updateHiddenInputs();
        updateSelectionLabel();
        renderCal();
        if (rangeStart && rangeEnd) fetchSlots(rangeStart, rangeEnd);
      });
    });
  }

  if (calPrev) calPrev.addEventListener('click', function() {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCal();
  });

  if (calNext) calNext.addEventListener('click', function() {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCal();
  });

  renderCal();

  // Load initial slot availability for next 3 months
  (function() {
    var now   = new Date();
    var from  = toISO(now.getFullYear(), now.getMonth(), now.getDate());
    var end   = new Date(now.getFullYear(), now.getMonth() + 3, 0);
    var to    = toISO(end.getFullYear(), end.getMonth(), end.getDate());
    fetchSlots(from, to);
  })();

  // ── STUDIO CAROUSEL ──
  const studioTrack = document.getElementById('gaStudioTrack');
  const studioPrev  = document.getElementById('gaStudioPrev');
  const studioNext  = document.getElementById('gaStudioNext');

  if (studioTrack && studioPrev && studioNext) {
    const slideWidth = () => studioTrack.querySelector('.ga-studio-slide').offsetWidth + 2;
    const maxScroll  = () => studioTrack.scrollWidth - studioTrack.offsetWidth;

    studioNext.addEventListener('click', () => {
      studioTrack.scrollBy({ left: slideWidth(), behavior: 'smooth' });
    });

    studioPrev.addEventListener('click', () => {
      studioTrack.scrollBy({ left: -slideWidth(), behavior: 'smooth' });
    });
  }

  // ── REVIEWS NAV ARROWS ──
  const track    = document.getElementById('gaReviewsTrack');
  const prevBtn  = document.getElementById('gaPrev');
  const nextBtn  = document.getElementById('gaNext');

  if (track && prevBtn && nextBtn) {
    const scrollBy = track.querySelector('.ga-review')?.offsetWidth || 330;

    nextBtn.addEventListener('click', () => {
      track.scrollBy({ left: scrollBy, behavior: 'smooth' });
    });

    prevBtn.addEventListener('click', () => {
      track.scrollBy({ left: -scrollBy, behavior: 'smooth' });
    });

    // Drag scroll
    let isDown = false, startX, scrollLeft;

    track.addEventListener('mousedown', e => {
      isDown = true;
      track.classList.add('grabbing');
      startX     = e.pageX - track.offsetLeft;
      scrollLeft = track.scrollLeft;
    });

    track.addEventListener('mousemove', e => {
      if (!isDown) return;
      e.preventDefault();
      track.scrollLeft = scrollLeft - (e.pageX - track.offsetLeft - startX) * 1.4;
    });

    document.addEventListener('mouseup', () => {
      isDown = false;
      track.classList.remove('grabbing');
    });
  }
})();