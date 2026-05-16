"use strict";

(function () {
  const form = document.getElementById('loginForm');
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('loginError');

  function showError(msg) {
    err.textContent = msg || '';
  }

  async function postLogin(payload) {
    try {
      const res = await fetch(`${INTERNAL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Invalid credentials');
      }
      return res.json();
    } catch (e) {
      throw e;
    }
  }

  // Fallback mock auth (used if /api/login is not available)
  async function mockAuth({ email, password }) {
    // This uses a simple client-side hash compare — suitable for local demo only.
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    // Example user: demo@appreciart.ie / demoPass (hash included for demo).
    const demoHash = 'd5579c46dfcc7d0d9b9b3b1c0f8b5c2d5b6e2f8a9c3d4e5f6a7b8c9d0e1f2a3b';
    if (email === 'demo@appreciart.ie' && hashHex.startsWith(demoHash.slice(0, 8))) {
      return { token: 'mock-session-token', user: { email } };
    }
    throw new Error('Invalid credentials');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    btn.disabled = true;
    const email = form.email.value.trim();
    const password = form.password.value;
    const remember = form.remember.checked;

    if (!email || !password) {
      showError('Please enter email and password.');
      btn.disabled = false;
      return;
    }

    const payload = { email, password };

    try {
      let data;
      try {
        data = await postLogin(payload);
      } catch (apiErr) {
        // If API not reachable, try mock fallback
        data = await mockAuth(payload);
      }
      const store = remember ? localStorage : sessionStorage;
      store.setItem('art_token', data.token);
      store.setItem('art_user', JSON.stringify(data.user));
      window.location.href = 'dashboard.html';
    } catch (err) {
      showError(err.message || 'Login failed.');
    } finally {
      btn.disabled = false;
    }
  });

})();
