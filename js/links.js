'use strict';

(function () {
  const INTERNAL_API = 'https://api.appreciart.ie';

  // Studio band: hide the broken-image glyph on failure; the off-white hero
  // keeps its fixed height, so nothing shifts.
  const band = document.getElementById('lkBandImg');
  if (band) {
    const fail = () => band.classList.add('lk-img-failed');
    if (band.complete && band.naturalWidth === 0) fail();
    band.addEventListener('error', fail, { once: true });
  }

  // No site footer here, so this page carries its own "Manage cookies" entry
  // (same event footer.js dispatches). Hidden in the HTML so it never shows
  // as a dead button without JS.
  const cookiesBtn = document.getElementById('lkCookiesBtn');
  const cookiesDot = document.getElementById('lkCookiesDot');
  if (cookiesBtn) {
    cookiesBtn.hidden = false;
    if (cookiesDot) cookiesDot.hidden = false;
    cookiesBtn.addEventListener('click', function () {
      document.dispatchEvent(new CustomEvent('appreciart:manage-cookies'));
    });
  }

  const hero = document.getElementById('lkHero');
  if (!hero) return;

  const NEXT_COUNT = 2;
  const YMD = /^\d{4}-\d{2}-\d{2}$/;

  // Parse "YYYY-MM-DD" (or an ISO string) as *local* midnight — new Date(str)
  // treats it as UTC, so local getters slip a day in negative-offset zones.
  // Duplicated from js/index.js:13 — no shared date module in this project.
  function parseYMD(s) {
    const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  const day      = d => String(d.getDate()).padStart(2, '0');
  const monLong  = d => d.toLocaleDateString('en-IE', { month: 'long' });
  const monShort = d => d.toLocaleDateString('en-IE', { month: 'short' });
  const sameMonth = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

  // "01–05 Nov", "28 Oct – 02 Nov", "05 Nov"
  function shortRange(start, end) {
    if (start.getTime() === end.getTime()) return day(start) + ' ' + monShort(start);
    if (sameMonth(start, end)) return day(start) + '–' + day(end) + ' ' + monShort(end);
    return day(start) + ' ' + monShort(start) + ' – ' + day(end) + ' ' + monShort(end);
  }

  // profile_url arrives as .../image/upload/q_auto,f_auto,w_680/v123/path —
  // swap that single transformation segment for a small face crop. Any other
  // shape (chained transforms, non-Cloudinary host) is left untouched.
  const CLD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(?:[a-z]{1,3}_[^/]+\/)?(v\d+\/.+)$/;
  function thumbUrl(url) {
    const m = CLD.exec(url);
    return m ? m[1] + 'c_fill,g_face,w_120,h_150,q_auto,f_auto/' + m[2] : url;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function guestHero(g, next) {
    const a = el('a', 'lk-feat');
    a.href = 'artist.html?slug=' + encodeURIComponent(g.slug);
    a.setAttribute('aria-label', g.name + ', at the studio ' + shortRange(g.start, g.end));

    const month = sameMonth(g.start, g.end)
      ? monLong(g.start)
      : monShort(g.start) + ' — ' + monShort(g.end);

    const body = el('div', 'lk-feat-body');
    body.appendChild(el('p', 'lk-feat-label', 'At the studio · ' + month));
    const days = el('div', 'lk-days');
    days.appendChild(el('span', 'lk-day', day(g.start)));
    if (g.startKey !== g.endKey) {
      const sep = el('span', 'lk-sep');
      sep.setAttribute('aria-hidden', 'true');
      days.appendChild(sep);
      days.appendChild(el('span', 'lk-day', day(g.end)));
    }
    body.appendChild(days);
    body.appendChild(el('p', 'lk-feat-name', g.name));
    a.appendChild(body);

    if (isSafeUrl(g.profile_url)) {
      const frame = el('span', 'lk-feat-photo');
      const img = el('img');
      img.alt = '';
      img.width = 120;
      img.height = 150;
      img.decoding = 'async';
      img.addEventListener('error', () => frame.remove(), { once: true });
      img.src = thumbUrl(g.profile_url);
      frame.appendChild(img);
      a.appendChild(frame);
    }

    const nodes = [a];
    if (next.length) {
      const line = el('p', 'lk-feat-next');
      line.appendChild(el('b', null, 'Next: '));
      line.appendChild(document.createTextNode(
        next.map(n => n.name + ' ' + shortRange(n.start, n.end)).join(' · ')
      ));
      nodes.push(line);
    }
    return nodes;
  }

  function render(data) {
    const today = todayKey();
    const guests = (data && Array.isArray(data.guests) ? data.guests : [])
      .filter(g => g && typeof g.slug === 'string' && g.slug &&
                   typeof g.name === 'string' && g.name.trim())
      .map(g => ({
        slug: g.slug,
        name: g.name.trim(),
        profile_url: g.profile_url,
        startKey: String(g.guest_start_date || '').slice(0, 10),
        endKey: String(g.guest_end_date || '').slice(0, 10),
      }))
      .filter(g => YMD.test(g.startKey) && YMD.test(g.endKey) && g.startKey <= g.endKey)
      .map(g => Object.assign(g, { start: parseYMD(g.startKey), end: parseYMD(g.endKey) }));

    // With overlapping visits, feature the most recent arrival.
    const now = guests
      .filter(g => g.startKey <= today && today <= g.endKey)
      .sort((a, b) => (a.startKey < b.startKey ? 1 : a.startKey > b.startKey ? -1 : 0));
    if (!now.length) return;

    const next = guests
      .filter(g => g.startKey > today)
      .sort((a, b) => (a.startKey < b.startKey ? -1 : a.startKey > b.startKey ? 1 : 0))
      .slice(0, NEXT_COUNT);

    // Build first, then swap in one step: a render error leaves the studio state.
    const nodes = guestHero(now[0], next);
    hero.replaceChildren(...nodes);
    hero.setAttribute('aria-label', 'Guest artist');
    hero.classList.add('is-guest');
  }

  // AbortSignal.timeout is missing on iOS < 16 WebViews; without this guard
  // the call would throw and take the rest of the script with it.
  let signal;
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    signal = AbortSignal.timeout(8000);
  } else if (typeof AbortController !== 'undefined') {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 8000);
    signal = ctrl.signal;
  }

  // Any failure (network, timeout, bad JSON, render error) keeps the studio
  // state — this page shows no error text.
  fetch(`${INTERNAL_API}/api/public/artists`, { signal })
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(render)
    .catch(() => {});
})();
