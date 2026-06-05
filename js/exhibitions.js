(function () {
    document.querySelectorAll('.exh-item-play').forEach(btn => {
      const wrap   = btn.closest('.exh-item-iframe-wrap');
      const iframe = wrap ? wrap.querySelector('iframe[data-src]') : null;

      btn.addEventListener('click', () => {
        // Load inline iframe on first play
        if (iframe && iframe.dataset.src && !iframe.src) {
          iframe.src = iframe.dataset.src;
        }

        // Open lightbox with autoplay version
        const src = btn.dataset.video;
        if (!src) return;
        document.getElementById('exhLightboxVideo').src = src;
        document.getElementById('exhLightbox').classList.add('open');
        document.body.style.overflow = 'hidden';
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