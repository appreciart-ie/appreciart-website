// js/constants.js
// Central config — import this in every JS file that needs the API
// ES module (import/export) — matches appreciart-ie stack

// Set VITE_INTERNAL_API_URL in Vercel environment variables
// Local dev: create .env.local with INTERNAL_API_URL=http://localhost:3000
export const INTERNAL_API_URL =
  (typeof process !== 'undefined' && process.env?.INTERNAL_API_URL) ||
  'https://appreciart-internal-production-ee3c.up.railway.app';

export const STRIPE_PUBLIC_KEY =
  (typeof process !== 'undefined' && process.env?.STRIPE_PUBLIC_KEY) || '';

// Timeouts (ms)
export const FETCH_TIMEOUT = 25000;

// Stage labels — keep in sync with backend conversations.stage
export const STAGES = {
  NOVO_LEAD:   'novo_lead',
  QUALIFICADO: 'qualificado',
  CONFIRMADO:  'confirmado',
  PAGO:        'pago',
  CONCLUIDO:   'concluido'
};
