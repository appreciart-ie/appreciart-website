'use strict';

(function () {
  const INTERNAL = 'https://appreciart-internal-production-ee3c.up.railway.app';

  const form       = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passInput  = document.getElementById('password');
  const loginBtn   = document.getElementById('loginBtn');
  const errorEl    = document.getElementById('loginError');

  if (!form) return;

  const existing = localStorage.getItem('art_token');
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
    const password = passInput.value.trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
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
        setError('Invalid credentials. Please try again.');
        return;
      }

      localStorage.setItem('art_token',  data.token);
      localStorage.setItem('art_artist', JSON.stringify(data.artist));

      toast('Signed in successfully', 'success');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 500);

    } catch (err) {
      const errMsg = err.name === 'TimeoutError'
        ? 'Request timed out. Please try again.'
        : 'Something went wrong. Please try again.';
      toast(errMsg, 'error');
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  });
})();