(function () {
    const INTERNAL_API = 'https://appreciart-internal-production-ee3c.up.railway.app';
    document.querySelectorAll('.resident-photo[data-slug]').forEach(img => {
      const slug = img.dataset.slug;
      fetch(`${INTERNAL_API}/api/public/artists/${slug}`, { signal: AbortSignal.timeout(8000) })
        .then(r => r.json())
        .then(data => {
          const url = data.artist && data.artist.profile_url;
          if (url) img.src = url;
        })
        .catch(() => {});
    });
  })();
