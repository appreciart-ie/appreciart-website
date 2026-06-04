'use strict';

(function () {
  const INTERNAL = 'https://appreciart-internal-production-ee3c.up.railway.app';

  // ── FORM ──
  const formInner  = document.getElementById('gaFormInner');
  const successEl  = document.getElementById('gaSuccess');
  const submitBtn  = document.getElementById('gaSubmitBtn');
  const generalErr = document.getElementById('gaGeneralErr');

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

  // ── SLOTS CALENDAR ──
  const dateFromEl   = document.getElementById('gaDateFrom');
  const dateToEl     = document.getElementById('gaDateTo');
  const slotsPreview = document.getElementById('gaSlotsPreview');

  async function loadSlots() {
    const from = dateFromEl?.value;
    const to   = dateToEl?.value;
    if (!from || !to || !slotsPreview) return;
    if (new Date(to) < new Date(from)) {
      slotsPreview.innerHTML = '<p class="ga-slots-empty">End date must be after start date.</p>';
      slotsPreview.style.display = 'block';
      return;
    }

    slotsPreview.innerHTML = '<p class="ga-slots-loading">Checking availability...</p>';
    slotsPreview.style.display = 'block';

    try {
      const res  = await fetch(`${INTERNAL}/api/public/slots/range?from=${from}&to=${to}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error('Failed to load slots');
      const data = await res.json();

      if (!data.days || !data.days.length) {
        slotsPreview.innerHTML = '<p class="ga-slots-empty">No data available for this range.</p>';
        return;
      }

      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const days   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

      let html = '<p class="ga-slots-label">Available slots for your selected dates</p>';
      html += '<div class="ga-slots-grid">';

      data.days.forEach(({ date, available }) => {
        const d       = new Date(date + 'T00:00:00');
        const dayName = days[(d.getDay() + 6) % 7];
        const dayNum  = d.getDate();
        const month   = months[d.getMonth()];
        const full    = available === 0;
        const cls     = full ? 'ga-slot-day ga-slot-day--full' : available <= 1 ? 'ga-slot-day ga-slot-day--low' : 'ga-slot-day';

        html += `<div class="${cls}">
          <span class="ga-slot-weekday">${dayName}</span>
          <span class="ga-slot-num">${dayNum}</span>
          <span class="ga-slot-month">${month}</span>
          <span class="ga-slot-count">${full ? 'Full' : available === 1 ? '1 slot' : `${esc(String(available))} slots`}</span>
        </div>`;
      });

      html += '</div>';
      html += '<p class="ga-slots-note">Slots reflect studio availability — residents have priority. Final dates confirmed after review.</p>';
      slotsPreview.innerHTML = html;

    } catch {
      slotsPreview.innerHTML = '<p class="ga-slots-empty">Could not load availability. Please try again.</p>';
    }
  }

  if (dateFromEl) dateFromEl.addEventListener('change', loadSlots);
  if (dateToEl)   dateToEl.addEventListener('change', loadSlots);

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