
  (function () {
    'use strict';

    const INTERNAL = 'https://api.appreciart.ie';

    const lightbox    = document.getElementById('galleryLightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    const buyBtn      = document.getElementById('galleryBuyBtn');
    const buyError    = document.getElementById('galleryBuyError');

    let currentPriceId  = null;
    let activeRequestId = 0;
    let lastFocused     = null;

    // Grid image error handler — swap the broken image for a titled placeholder
    // so the card never reads as an empty grey block.
    document.querySelectorAll('.gallery-work-img').forEach(img => {
      img.addEventListener('error', () => {
        const wrap = img.parentElement;
        if (!wrap || wrap.querySelector('.gallery-work-fallback')) return;

        const card = img.closest('.gallery-work-card');
        const ph   = document.createElement('div');
        ph.className = 'gallery-work-fallback';

        const t = document.createElement('span');
        t.className   = 'gallery-work-fallback-title';
        t.textContent = (card && card.dataset.title) || 'Untitled';

        const n = document.createElement('span');
        n.className   = 'gallery-work-fallback-note';
        n.textContent = 'Image unavailable';

        ph.appendChild(t);
        ph.appendChild(n);
        wrap.appendChild(ph);
        img.style.display = 'none';
      }, { once: true });
    });

    // Open lightbox
    function openLightbox(card) {
        lastFocused = card;
        currentPriceId = card.dataset.priceId;
        activeRequestId++;   // invalidate any checkout request still in flight

        lightboxImg.style.display = '';
        lightboxImg.src = card.dataset.img || '';
        lightboxImg.alt = card.dataset.title || '';
        document.getElementById('lightboxArtist').textContent  = card.dataset.artist || '';
        document.getElementById('lightboxTitle').textContent   = card.dataset.title  || '';
        document.getElementById('lightboxMedium').textContent  = card.dataset.medium || '';
        document.getElementById('lightboxDesc').textContent    = card.dataset.desc   || '';
        document.getElementById('lightboxPrice').textContent   = card.dataset.price  || '';

        buyBtn.disabled      = false;
        buyBtn.textContent   = 'Purchase this Work';
        buyError.classList.remove('visible');

        lightbox.classList.add('open');
        document.body.style.overflow = 'hidden';

        // Move focus inside the dialog — aria-modal is a lie while focus is outside.
        const closeBtn = document.getElementById('lightboxClose');
        if (closeBtn) closeBtn.focus();
    }

    document.querySelectorAll('.gallery-work-card').forEach(card => {
      card.addEventListener('click', () => openLightbox(card));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();          // stop Space from scrolling the page
          openLightbox(card);
        }
      });
    });

    // Close lightbox
    function closeLightbox() {
      lightbox.classList.remove('open');
      document.body.style.overflow = '';
      lightboxImg.removeAttribute('src');
      currentPriceId  = null;
      activeRequestId++;   // invalidate any checkout request still in flight

      // Hand focus back to the card that opened the dialog.
      if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
      lastFocused = null;
    }

    document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && lightbox.classList.contains('open')) closeLightbox();
    });

    // Buy — POST to backend → redirect to Stripe Checkout
    buyBtn.addEventListener('click', async () => {
      if (!currentPriceId) return;

      const requestId = ++activeRequestId;
      const priceId   = currentPriceId;

      buyBtn.disabled    = true;
      buyBtn.textContent = 'Redirecting to checkout...';
      buyError.classList.remove('visible');

      try {
        const res = await fetch(`${INTERNAL}/api/public/gallery/checkout`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ price_id: priceId }),
          signal:  AbortSignal.timeout(15000),
        });

        // Read the body only after res.ok — error pages are often HTML, not JSON.
        if (!res.ok) {
          let serverMsg = '';
          try {
            const errBody = await res.json();
            serverMsg = errBody && errBody.error ? String(errBody.error) : '';
          } catch (_) { /* non-JSON error page — fall through to generic copy */ }
          throw new Error(serverMsg || 'We could not start the checkout. Please try again in a moment.');
        }

        let data;
        try {
          data = await res.json();
        } catch (_) {
          throw new Error('We received an unexpected response from our server. Please try again in a moment.');
        }

        if (!data || !data.url || !data.url.startsWith('https://checkout.stripe.com/')) {
          throw new Error('We could not start the checkout. Please try again in a moment.');
        }

        // The lightbox was closed or another work was opened while this was in
        // flight — discard the response instead of sending the buyer to the
        // checkout page for a work they are no longer looking at.
        if (requestId !== activeRequestId) return;

        window.location.href = data.url;
      } catch (err) {
        if (requestId !== activeRequestId) return;

        let errMsg;
        if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
          errMsg = 'The checkout is taking longer than expected. Please check your connection and try again.';
        } else if (err instanceof TypeError) {
          errMsg = 'We could not reach our server. Please check your connection and try again.';
        } else {
          errMsg = (err && err.message) || 'Something went wrong. Please try again.';
        }

        buyError.textContent = errMsg;
        buyError.classList.add('visible');
        toast(errMsg, 'error');
        buyBtn.disabled    = false;
        buyBtn.textContent = 'Purchase this Work';
      }
    });
  })();
  
