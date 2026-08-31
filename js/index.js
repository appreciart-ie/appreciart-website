(function () {
    const INTERNAL_API = 'https://api.appreciart.ie';

    // Single list fetch feeds both resident photos and guest cards
    // (profile_url now comes on the list endpoint — no per-artist requests)
    const track   = document.getElementById('guestsTrack');
    const empty   = document.getElementById('guestsEmpty');
    const section = document.querySelector('.guests-section');

    fetch(`${INTERNAL_API}/api/public/artists`, { signal: AbortSignal.timeout(8000) })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(data => {
          // Resident profile photos
          const residents = data.residents || [];
          document.querySelectorAll('.resident-photo[data-slug]').forEach(img => {
            const artist = residents.find(a => a.slug === img.dataset.slug);
            if (artist && isSafeUrl(artist.profile_url)) img.src = artist.profile_url;
          });

          if (!track) return;
          // Without a slug the card would link to artist.html?slug=undefined —
          // drop those rather than render dead profile links.
          const guests = (data.guests || []).filter(g => g && g.slug && g.name);

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
              '<a href="' + esc(ctaHref) + '" aria-label="' + esc(guest.name) + ' profile">' +
                '<div class="guest-photo-wrap">' +
                  '<img alt="' + esc(guest.name) + '">' +
                  (dateRange ? '<span class="guest-dates-badge">' + esc(dateRange) + '</span>' : '') +
                '</div>' +
              '</a>' +
              (month ? '<p class="guest-month">' + esc(month) + '</p>' : '') +
              '<h3 class="guest-name">' + esc(guest.name) + '</h3>' +
              (styles ? '<p class="guest-styles">' + esc(styles) + '</p>' : '') +
              '<a href="' + esc(ctaHref) + '" class="btn btn-primary btn-sm">View Profile</a>';

            track.appendChild(card);

            const cardImg = card.querySelector('img');
            if (cardImg) {
              const hidePhoto = () => {
                if (cardImg.parentElement) cardImg.parentElement.style.background = 'var(--light)';
                cardImg.style.display = 'none';
              };
              cardImg.addEventListener('error', hidePhoto);
              if (isSafeUrl(guest.profile_url)) cardImg.src = guest.profile_url;
              else hidePhoto();
            }
          });

          // Touch devices have no hover: the card most in view is the "active" one
          // and stays in colour while the rest hold grayscale (see @media (hover: none)).
          if (window.matchMedia('(hover: none)').matches && 'IntersectionObserver' in window) {
            const cards  = Array.from(track.querySelectorAll('.guest-card'));
            const ratios = new Map(cards.map(c => [c, 0]));
            const io = new IntersectionObserver(entries => {
              entries.forEach(e => ratios.set(e.target, e.intersectionRatio));
              let best = null, bestRatio = 0;
              ratios.forEach((ratio, card) => { if (ratio > bestRatio) { bestRatio = ratio; best = card; } });
              cards.forEach(c => c.classList.toggle('is-active', c === best));
            }, { root: track, threshold: [0, 0.25, 0.5, 0.75, 1] });
            cards.forEach(c => io.observe(c));
          }
        })
        .catch(() => {
          if (empty) {
            empty.textContent = "Couldn't load guest artists right now. Please try again later.";
            empty.style.display = 'block';
          }
        });
  })();
