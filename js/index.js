(function () {
    const INTERNAL_API = 'https://appreciart-internal-production-ee3c.up.railway.app';

    // Load resident profile photos
    document.querySelectorAll('.resident-photo[data-slug]').forEach(img => {
      const slug = img.dataset.slug;
      fetch(`${INTERNAL_API}/api/public/artists/${slug}`, { signal: AbortSignal.timeout(8000) })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => {
          const url = data.artist && data.artist.profile_url;
          if (isSafeUrl(url)) img.src = url;
        })
        .catch(() => {});
    });

    // Load guest artists dynamically
    const track   = document.getElementById('guestsTrack');
    const empty   = document.getElementById('guestsEmpty');
    const section = document.querySelector('.guests-section');

    if (track) {
      fetch(`${INTERNAL_API}/api/public/artists`, { signal: AbortSignal.timeout(8000) })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => {
          const guests = data.guests || [];

          if (!guests.length) {
            if (empty) empty.style.display = 'block';
            return;
          }

          guests.forEach(guest => {
            const startDate = guest.guest_start_date
              ? new Date(guest.guest_start_date).toLocaleDateString('en-IE', { day: '2-digit', month: 'short' })
              : '';
            const endDate = guest.guest_end_date
              ? new Date(guest.guest_end_date).toLocaleDateString('en-IE', { day: '2-digit', month: 'short' })
              : '';
            const dateRange = startDate && endDate ? `${startDate} – ${endDate}` : '';
            const month = guest.guest_start_date
              ? new Date(guest.guest_start_date).toLocaleDateString('en-IE', { month: 'long' })
              : '';
            const styles = Array.isArray(guest.styles) ? guest.styles.join(' · ') : '';
            const ctaHref = `artist.html?slug=${encodeURIComponent(guest.slug)}`;

            const card = document.createElement('div');
            card.className = 'guest-card';
            card.innerHTML =
              '<div class="guest-photo-wrap">' +
                '<img alt="' + esc(guest.name) + '">' +
                (dateRange ? '<span class="guest-dates-badge">' + esc(dateRange) + '</span>' : '') +
              '</div>' +
              (month ? '<p class="guest-month">' + esc(month) + '</p>' : '') +
              '<h3 class="guest-name">' + esc(guest.name) + '</h3>' +
              (styles ? '<p class="guest-styles">' + esc(styles) + '</p>' : '') +
              '<a href="' + esc(ctaHref) + '" class="btn btn-primary btn-sm">View Profile</a>';

            track.appendChild(card);

            const cardImg = card.querySelector('img');
            if (cardImg) {
              cardImg.addEventListener('error', () => {
                if (cardImg.parentElement) cardImg.parentElement.style.background = 'var(--light)';
                cardImg.style.display = 'none';
              });
            }

            // Load profile photo
            fetch(`${INTERNAL_API}/api/public/artists/${encodeURIComponent(guest.slug)}`, { signal: AbortSignal.timeout(8000) })
              .then(r => r.ok ? r.json() : Promise.reject())
              .then(d => {
                if (cardImg && d.artist && isSafeUrl(d.artist.profile_url)) cardImg.src = d.artist.profile_url;
              })
              .catch(() => {});
          });
        })
        .catch(() => {
          if (empty) empty.style.display = 'block';
        });
    }
  })();
