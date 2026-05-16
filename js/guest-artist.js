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

        formInner.style.display = 'none';
        successEl.classList.add('visible');
        successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

      } catch (err) {
        generalErr.textContent = err.message || 'Something went wrong. Please try again.';
        generalErr.classList.add('visible');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Application';
      }
    });
  }

  // ── REVIEWS NAV ARROWS ──
  const track    = document.getElementById('gaReviewsTrack');
  const prevBtn  = document.getElementById('gaPrev');
  const nextBtn  = document.getElementById('gaNext');

  if (track && prevBtn && nextBtn) {
    const scrollBy = 330;

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