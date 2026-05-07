
  (function () {
    'use strict';

    const INTERNAL = 'https://appreciart-internal-production-ee3c.up.railway.app';

    const lightbox    = document.getElementById('galleryLightbox');
    const lightboxImg = document.getElementById('lightboxImg');
    const buyBtn      = document.getElementById('galleryBuyBtn');
    const buyError    = document.getElementById('galleryBuyError');

    let currentPriceId = null;

    // Open lightbox
    document.querySelectorAll('.gallery-work-card').forEach(card => {
      card.addEventListener('click', () => {
        currentPriceId = card.dataset.priceId;

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
      });
    });

    // Close lightbox
    function closeLightbox() {
      lightbox.classList.remove('open');
      document.body.style.overflow = '';
      lightboxImg.src = '';
      currentPriceId  = null;
    }

    document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

    // Buy — POST to backend → redirect to Stripe Checkout
    buyBtn.addEventListener('click', async () => {
      if (!currentPriceId) return;

      buyBtn.disabled    = true;
      buyBtn.textContent = 'Redirecting to checkout...';
      buyError.classList.remove('visible');

      try {
        const res = await fetch(`${INTERNAL}/api/public/gallery/checkout`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ price_id: currentPriceId }),
          signal:  AbortSignal.timeout(15000),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Checkout failed');

        window.location.href = data.url;
      } catch (err) {
        buyError.textContent = err.message || 'Something went wrong. Please try again.';
        buyError.classList.add('visible');
        buyBtn.disabled    = false;
        buyBtn.textContent = 'Purchase this Work';
      }
    });
  })();
  
