'use strict';

(function () {
  const INTERNAL = 'https://appreciart-internal-production-ee3c.up.railway.app';

  const form       = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passInput  = document.getElementById('password');
  const loginBtn   = document.getElementById('loginBtn');
  const errorEl    = document.getElementById('loginError');
  const remember   = document.getElementById('remember');

  if (!form) return;

  const existing = sessionStorage.getItem('art_token') || localStorage.getItem('art_token');
  if (existing) { window.location.href = 'dashboard.html'; return; }

  function setError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = msg ? 'block' : 'none';
  }

  function setLoading(on) {
    loginBtn.disabled = on;
    loginBtn.textContent = on ? 'Signing in…' : 'Sign in';
  }

  // ── Modal ──
  const accessBtn    = document.getElementById('accessBtn');
  const accessModal  = document.getElementById('accessModal');
  const modalClose   = document.getElementById('modalClose');
  const modalCloseBtn = document.getElementById('modalCloseBtn');

  function openModal() {
    accessModal.classList.add('open');
    accessModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    accessModal.classList.remove('open');
    accessModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  if (accessBtn)     accessBtn.addEventListener('click', openModal);
  if (modalClose)    modalClose.addEventListener('click', closeModal);
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);

  accessModal.addEventListener('click', (e) => {
    if (e.target === accessModal) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && accessModal.classList.contains('open')) closeModal();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setError('');

    const email    = emailInput.value.trim().toLowerCase();
    const password = passInput.value;

    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${INTERNAL}/api/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
        signal:  AbortSignal.timeout(12000),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Invalid credentials. Please try again.');
        return;
      }

      const store = remember.checked ? localStorage : sessionStorage;
      store.setItem('art_token',  data.token);
      store.setItem('art_artist', JSON.stringify(data.artist));

      window.location.href = 'dashboard.html';

    } catch (err) {
      if (err.name === 'TimeoutError') {
        setError('Request timed out. Please try again.');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  });
})();