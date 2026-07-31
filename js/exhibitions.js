(function () {
    document.querySelectorAll('.exh-item-play').forEach(btn => {
      // Keyboard-operable: the play control is a div, not a <button>.
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', '0');
      if (!btn.getAttribute('aria-label')) btn.setAttribute('aria-label', 'Play video');

      // Play always opens the lightbox — the inline iframe is never loaded,
      // so only one video ever exists and nothing is left playing underneath.
      const open = () => {
        const src = btn.dataset.video;
        if (!src) return;
        document.getElementById('exhLightboxVideo').src = src;
        document.getElementById('exhLightbox').classList.add('open');
        document.body.style.overflow = 'hidden';
      };

      btn.addEventListener('click', open);
      btn.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          open();
        }
      });
    });

    function closeLightbox() {
      document.getElementById('exhLightbox').classList.remove('open');
      document.getElementById('exhLightboxVideo').src = '';
      document.body.style.overflow = '';
    }

    document.getElementById('exhClose').addEventListener('click', closeLightbox);
    document.getElementById('exhLightbox').addEventListener('click', e => {
      if (e.target === document.getElementById('exhLightbox')) closeLightbox();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });
  })();