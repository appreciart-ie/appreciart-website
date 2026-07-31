# TASKS.md — Tracked Backlog (Appreciart IE Frontend)

> Format: `- [ ] [block] — description — severity — effort (S/M/L)`
> Verified against source on 2026-07-31 (HEAD `ec1ad89`). Only incomplete / pending / known-broken
> items — nothing already working. See SPECIFY.md for how the system behaves today.

## Launch blockers / infrastructure

- [ ] [infra] Switch Stripe to live mode — backend `/api/public/config` still serves a `pk_test_…`
      publishable key (verified live 2026-07-15). Frontend no longer hardcodes keys, so this is a
      coordinated backend/env change, but gallery.html DOES hardcode 4 Stripe Price IDs that must be
      re-created as live prices at the same time. — severity: high — effort: M
- [x] [infra] Point `appreciart.ie` → Cloudflare Pages. — severity: high — effort: M
      — RESOLVED 2026-07-17: custom domain now live on appreciart.ie (Cloudflare Pages config,
      outside repo). Confirmed by user.
- [x] [infra] Migrate API host to `api.appreciart.ie` (frontend side). — severity: high — effort: M
      — RESOLVED in `4332c49` (Fase 1: CSP transitional) + `1022df4` (Fase 2: 11 endpoints repointed)
      + `d70e862` (Fase 3: Railway host removed from CSP). Verified 2026-07-17: 0 Railway references
      remain, 12 files now target api.appreciart.ie, connect-src cleaned. NOTE: backend cookie-domain
      change (other repo) still pending for the same-site refresh cookie to take effect.
- [ ] [infra] Backend integration gaps from the June audit (other repo, tracked here for launch
      visibility): missing SSE emissions (payments webhook deposit_paid, admin guest approve/reject,
      consent submission), missing admin SSE handlers for `application_update`/`consent_update`,
      walk-in sessions invisible to admin, admin Studio section still placeholder. Re-verify in
      appreciart-internal before ship. — severity: high — effort: M

## Block 1 — Public site pages

- [ ] [public] gallery.html works are fully hardcoded (4 static cards, price IDs + Cloudinary URLs in
      HTML) — no backend/admin path to add or sell out works; acceptable short-term but every gallery
      change is a code deploy. — severity: low — effort: L
- [x] [public] bookings.js `fetchConfig()` is the only fetch in the repo without an
      `AbortSignal.timeout` — violates the project's own rule; a hanging config request stalls the
      wizard indefinitely. — severity: med — effort: S
      — RESOLVED in `08e1772`: added `{ signal: AbortSignal.timeout(10000) }` to the config fetch
      (same 10s pattern as `/artists`); existing generic catch covers the TimeoutError.
- [x] [public] bookings.html:141 uses inline `style="display:none"` on `#calendarLegend`; CSP
      `style-src 'self'` blocks inline style attributes, so the legend is visible before any artist is
      selected (JS only hides it via CSSOM once availability loads). — severity: med — effort: S
      — RESOLVED in `5df31a3`: removed the inline attribute; base rule `.calendar-legend` in
      css/bookings.css now defaults to `display:none`, JS reveals it via CSSOM (`.style.display`).

## Block 2 — Auth pages

- [x] [auth] login.html:22 inline `style="margin-top:8px;margin-bottom:6px"` on the Sign-in title is
      blocked by CSP — margins never apply; move to css/login.css. — severity: low — effort: S
      — RESOLVED in `5df31a3`: replaced with class `section-title--login`; margins moved to css/login.css.
- [x] [auth] Consistent error handling in login.js and onboarding flows — res.ok guards before
      .json() parsing, no silent failures, visible error banners. — severity: med — effort: S
      — RESOLVED in `ec1ad89`: login.js and dashboard.js onboarding (dashboard.js:1612, :2477)
      now follow res.ok-before-parse pattern with visible error states.
- [ ] [auth] Multi-tab refresh race: `refreshAccessToken()` in dashboard.js is single-flight only
      within one JS context (`_refreshPromise` is a module variable). Two dashboard tabs open at once
      can each fire `POST /api/auth/refresh` concurrently against the same httpOnly cookie; if the
      backend rotates refresh tokens per use, one tab may invalidate the other's session. Same-tab is
      safe (timer + visibilitychange share the promise). Fixing properly needs a cross-tab lock
      (BroadcastChannel or a localStorage mutex) — deferred 2026-07-21 as the effort outweighs the
      edge case. Backend rotation behaviour unverified (other repo). — severity: med — effort: M
- [ ] [auth] Logout logic duplicated: header.js `signOut()` (~120-132) and dashboard.js `dashLogout`
      (~2073-2086) implement the same POST-logout → clear `art_token`/`art_artist` → redirect
      sequence independently instead of sharing one helper. Also header.js still renders the full nav
      and binds its sign-out listener on dashboard.html even though the header is hidden there.
      Tech debt, not a bug — both paths currently work. — severity: low — effort: S
- [ ] [auth] Logout leaves per-artist UI state behind: neither logout path clears `art_active_tab`,
      `art_profile_live_seen`, or `art_calendar_filter_mine_{slug}`. Not sensitive (no PII/tokens),
      but on a shared device the next artist to sign in inherits the previous one's UI prefs — e.g.
      the "show only my sessions" filter already toggled on. — severity: low — effort: S

## Booking & Payment

- [ ] [booking] C1 — guard contre Stripe key em falta antes de montar Payment Element
      (artist.js). — severity: high — effort: S
- [ ] [booking] C2 — destroy()/remount do Payment Element ao reabrir modal (artist.js).
      — severity: med — effort: S
- [ ] [booking] A1 — erro de setup movido para nó visível (#bmSetupErr em artist.html;
      #setupError em bookings.html). — severity: med — effort: S
- [ ] [booking] A2 — €100 hardcoded trocado por placeholder "—"; reset do deposit ao trocar
      de artista. — severity: med — effort: S
- [ ] [booking] A3 — invalidação do clientSecret obsoleto ao editar passo 3
      (invalidateClientSecret). — severity: high — effort: S
      — PARTIALLY MITIGATED in `6155810`: softened false payment confirmation claim
      (h1/title/meta/body), but full A3 guard pending.
- [ ] [booking] A4 — diferenciação succeeded/processing/absent no redirect status +
      verificação real contra GET /api/public/bookings/:id antes de confirmar
      (bookings.js + artist.js). — severity: high — effort: M
- [ ] [booking] M1 — parseYMD() substitui parsing UTC por local em ambos os ficheiros
      (bookings.js e artist.js). — severity: med — effort: S

## Gallery & Purchase

- [x] [gallery] A1 — activeRequestId contra fetch obsoleto (gallery.js).
      — severity: high — effort: S
      — RESOLVED in `2bb0fa5`: stale-fetch guard via activeRequestId.
- [x] [gallery] A2 — res.ok antes de .json(), mensagens humanas de erro.
      — severity: high — effort: S
      — RESOLVED in `2bb0fa5`: safe JSON parsing + human error messages.
- [x] [gallery] A3 (mitigação) — texto de gallery-success.html suavizado (h1, title, meta,
      corpo) + cookie-banner.js adicionado (faltava).
      — severity: high — effort: S
      — RESOLVED in `6155810`: softened payment confirmation copy; `2bb0fa5` context confirms
      gallery flow complete.
- [x] [gallery] M1 — guarda do Escape só quando lightbox está aberto.
      — severity: low — effort: S
      — RESOLVED in `2bb0fa5`: Escape guard scoped to lightbox visibility.
- [x] [gallery] M2 — data-hide-on-error no #lightboxImg.
      — severity: low — effort: S
      — RESOLVED in `2bb0fa5`: image fallback on load error.
- [x] [gallery] M3 — placeholder com título da obra em vez de bloco cinzento mudo.
      — severity: low — effort: S
      — RESOLVED in `2bb0fa5`: placeholder with work title.
- [x] [gallery] M5 — tabindex/role="button"/keydown nos cards da galeria.
      — severity: low — effort: S
      — RESOLVED in `2bb0fa5`: keyboard accessibility on gallery cards.
- [x] [gallery] M6 — gestão de foco no lightbox (não é focus trap completo — nota isso
      explicitamente).
      — severity: low — effort: S
      — RESOLVED in `2bb0fa5`: focus management in lightbox (not full trap, acknowledged).

## Block 3 — Dashboard

- [ ] [dashboard] Enrich session cards: show time + type (booking/consultation) alongside the stage
      pill (cards currently show only client name, relative date, and one badge). From CLAUDE.md
      "What's Next", still true. — severity: med — effort: M
- [ ] [dashboard] Tab counts (e.g. "Sessions (3)", "Consent Forms (2)") — not implemented; tabs are
      plain labels. — severity: low — effort: S
- [ ] [dashboard] Tab fade transition — panels toggle `display:none/block` with no animation
      (calendar month transitions exist; tab switches don't). — severity: low — effort: S
- [ ] [dashboard] Carregamento do campo WhatsApp assume formato exacto "https://wa.me/{numero}"
      ao extrair dígitos (dashboard.js:1684) — se o backend mudar o formato de saída no futuro,
      o replace falha silenciosamente e a URL inteira vai parar ao campo de dígitos.
      Não é bug hoje. — severity: low — effort: S
- [x] [dashboard] dashboard.js:734 emits `style="min-width:0"` inside calendar-bar markup — blocked
      by CSP (style attribute), so it does nothing; either remove or move to the stylesheet.
      — severity: low — effort: S
      — RESOLVED in `5df31a3`: replaced with class `cal-bar--minw0`; rule added to css/dashboard.css.
- [ ] [dashboard] Consent Forms tab: code path is fixed (reads `consent_forms` / bare array, honest
      error state) and the endpoint auth-gates correctly, but end-to-end verification against real
      linked submissions still needs a manual pass with an artist login. — severity: med — effort: S

### Dashboard — Calendar & Sessions

- [x] [dashboard] A1 — res.ok before parse nos 5 loaders (sessions, availability, slots, photos,
      profile) + banners de erro visíveis.
      — severity: high — effort: S
      — RESOLVED in `4697d69`: check res.ok before parsing in all 5 loaders, show visible
      error states instead of silent empty.
- [ ] [dashboard] A2 — capacidade desconhecida tratada como bloqueio, não fabricada como 4/4;
      409 tratado em markAvailable. — severity: med — effort: S
- [ ] [dashboard] A3 — reset do backoff SSE só em onopen real, não no refresh do token.
      — severity: med — effort: S
- [ ] [dashboard] A4 — tokens de sequência em loadAvailability/loadBookings/loadPhotos;
      commit combinado availability+slotMap; invalidação nas escritas. — severity: med — effort: M
- [ ] [dashboard] M5 — guestSlotMap distingue null/undefined/objecto.
      — severity: low — effort: S
- [ ] [dashboard] M7 — guarda contra modal obsoleto em cliques rápidos no calendário.
      — severity: med — effort: S
- [ ] [dashboard] B1 — handlers de Esc nomeados ao nível do módulo (sem acumulação).
      — severity: low — effort: S
- [ ] [dashboard] B3 — helper localDay() para parsing de data local.
      — severity: low — effort: S
- [ ] [dashboard] B4 — filtro "only mine" aplicado antes do slice, não depois.
      — severity: low — effort: S
- [x] [dashboard] B6 — mensagens de erro do servidor mostradas nas escritas.
      — severity: med — effort: S
      — RESOLVED in `efd9096`: surface backend error messages in change-password and reapply flows.

## Profile & Photos

- [x] [profile] A1 — validação do tamanho de TODO o batch antes do upload.
      — severity: high — effort: S
      — RESOLVED in `382cc91`: validate entire batch size before upload.
- [x] [profile] A2 — reconciliação via loadPhotos(true) no finally, sem rollback manual.
      — severity: high — effort: S
      — RESOLVED in `382cc91`: reconcile via loadPhotos in finally, no manual optimistic rollback.
- [ ] [profile] A3 — _photoOpInFlight bloqueia operações concorrentes de foto.
      — severity: med — effort: S
- [ ] [profile] A4 — Set de deletados filtra resultados da Search API (eventual consistency).
      — severity: med — effort: S
- [ ] [profile] M1 — completeness label não afirma "is live" antes do servidor confirmar.
      — severity: low — effort: S
- [ ] [profile] M2 — parse seguro em syncVisibility.
      — severity: low — effort: S
- [ ] [security] whatsapp_url/booking_url aceitam qualquer host https sem restrição
      — decisão deliberada de 2026-07-31: contas são aprovadas manualmente pelo admin,
      artistas são considerados confiáveis, mitigação já existe via esse processo de
      aprovação. Reconsiderar apenas se o sistema deixar de exigir aprovação manual
      (ex: auto-registo de guests). — severity: info — effort: —

## Guest Lifecycle

- [x] [guest] Mensagens de erro do backend mostradas em change-password e reapply (antes
      genéricas).
      — severity: med — effort: S
      — RESOLVED in `efd9096`: surface backend error messages in change-password and reapply flows.
- [x] [guest] Modal de onboarding removido quando conta está frozen (evita convite
      contraditório).
      — severity: high — effort: S
      — RESOLVED in `efd9096`: remove onboarding modal when account is frozen.
- [x] [guest] Guarda isFrozen no topo de handleDayClick (fecha janela de corrida).
      — severity: high — effort: S
      — RESOLVED in `efd9096`: guard against calendar clicks during frozen-state race window.

## Block 5 — Calendar PWA

- [x] [pwa] Swipe gesture month navigation — audited as "confirmed absent, small effort to add".
      — severity: med — effort: S
      — RESOLVED in `0786cc6` (2026-07-20): `touchstart`/`touchend` handlers on `calGrid`
      (dashboard.js ~1364-1386), 50px threshold, ignores vertical-dominant swipes, delegates to the
      shared `changeMonth()` so it inherits the same transition as calPrev/calNext.
- [ ] [pwa] iOS session persistence — frontend dependency (api.appreciart.ie migration) now DONE
      as of 2026-07-17; remaining blocker is the backend cookie-domain change (other repo) so the
      refresh cookie becomes same-site. No frontend work left here. — severity: high — effort: M (backend dep)

## Calendar UX (queued from earlier full audit — none built)

- [ ] [calendar-ux] Colour fill vs outline encoding for artist availability (e.g. filled = booked,
      outlined = available) — today availability is a black 50%-opacity bar, visually close to
      consultations (artist colour at 45% opacity). — severity: med — effort: M
      — NOTE 2026-07-21: partial distinction already exists via border-left (solid vs dashed) and
      font-weight (700 vs 400) in `.cal-bar--available` / `--booked` / `--consultation`. However,
      `renderCalendar()` still applies opacity 0.5/0.45 via CSSOM on top of these, which visually
      flattens the distinction. Needs visual review (screenshot) before deciding if this counts as
      resolved or if the opacity should be reduced/removed.
- [ ] [calendar-ux] Tap-feedback improvements on day cells (current feedback is only the
      `cal-day--selected` outline; no active/pressed state, notable in the PWA). — severity: low — effort: S
- [ ] [calendar-ux] Copy cleanup across calendar modals — inconsistent verbs for the same actions:
      "Add to calendar" / "Mark available" / "Book client" / "Book a client" / "New session" /
      "Add client" (guest). Pick one vocabulary. — severity: low — effort: S

## Block 7 — PWA (audited 2026-07-31, pending implementation)

- [ ] [pwa] display-mode: minimal-ui derruba as 4 proteções de standalone; centralizar deteção
      em window.isStandalone() (utils.js), tratando minimal-ui como standalone e usando ?pwa=1
      como reforço. — severity: high — effort: S
      — PARTIAL: `ec1ad89` centralizes standalone detection (minimal-ui + ?pwa=1 fallback), but
      full audit sweep of all 4 protections pending.
- [x] [pwa] Footer público injectado no dashboard/login fora de standalone (fallback else do
      footer.js cola footer completo).
      — severity: med — effort: S
      — RESOLVED in `ec1ad89`: stop leaking public footer on dashboard/login.
- [x] [pwa] login.js não segue o padrão res.ok-antes-do-parse; dashboard.js:2477 e :1612 têm
      catch vazio no fluxo de onboarding.
      — severity: med — effort: S
      — RESOLVED in `ec1ad89`: consistent error handling (login.js, onboarding).
- [x] [pwa] Install hint: flag de dismissal permanente (nunca reaparece); beforeinstallprompt
      pode disparar antes do listener registar.
      — severity: med — effort: S
      — RESOLVED in `ec1ad89`: 30-day install hint snooze (permanent dismissal implemented).
- [x] [pwa] manifest.json incompleto: falta id, purpose:maskable, description, lang,
      orientation; background_color devia ser #0a0a0a para bater com theme_color.
      — severity: low — effort: S
      — RESOLVED in `ec1ad89`: manifest completeness (id, purpose:maskable, description, lang,
      orientation, background_color).
- [ ] [pwa] sw.js: sem fallback para navegações não cacheadas offline (forgot/reset-password
      não estão em SHELL_ASSETS). — severity: low — effort: S
      — NOTE in `ec1ad89`: offline nav fallback added; verify forgot/reset-password coverage.
- [ ] [pwa] cache.put guarda query string do start_url, duplicando entradas (ignoreSearch
      mitiga na leitura). — severity: low — effort: S
- [ ] [pwa] Listener do #bmSave continua ligado mesmo com hidden=true no modal read-only —
      defesa em profundidade mais fraca que .remove(). — severity: low — effort: S

## Blocks 6/8/10/11/13 — leftovers (audited 2026-07-31, low severity)

- [ ] [guest-artist] O formulário não é um `<form>`: `guest-artist.html:408` é um `<div
      id="gaFormInner">` com um `<button>` solto. Enter não submete, sem semântica de form para
      leitores de ecrã/autofill, e nenhum campo tem `name` (exceto o honeypot). Inconsistente com
      consent.js/login.js. — severity: low — effort: M
- [ ] [guest-artist] Sem scroll/focus para o primeiro erro em `js/guest-artist.js` (`if (!valid)
      return;`) — em mobile o Submit parece não fazer nada. consent.js faz `scrollIntoView`.
      — severity: low — effort: S
- [ ] [guest-artist] Imagens sem `data-hide-on-error`: 6 slides do carrossel do estúdio
      (`guest-artist.html:103-118`) e 13 avatares `.ga-review-avatar` — todos Cloudinary externo.
      — severity: low — effort: S
- [ ] [guest-artist] Código morto: `const maxScroll` em `js/guest-artist.js` nunca é usado.
      — severity: low — effort: S
- [ ] [consent] Nenhum input tem `maxlength`, incluindo as três `<textarea>` médicas — defesa
      depende inteiramente do backend. guest-artist.html tem maxlength em todos.
      — severity: low — effort: S
- [ ] [consent] Erro em cascata confuso: com nome/apelido vazios a validação de assinatura falha
      sempre e mostra "Signature must match your full name exactly", escondendo a causa real.
      — severity: low — effort: S
- [ ] [consent] DECISÃO PENDENTE: validação de idade 18+. `date_of_birth` é opcional
      ("recommended") mas a declaração assinada afirma "I am 18 years of age or older". Hoje uma
      data de 2015 passa sem aviso. Implicações legais — decisão do dono, não técnica.
      — severity: — effort: S
- [ ] [exhibitions] Lightbox sem gestão de foco: sem focus trap, sem devolver o foco ao elemento
      que abriu, e o handler de Escape corre mesmo com o lightbox fechado (repõe
      `document.body.style.overflow`). — severity: low — effort: S
- [ ] [exhibitions] Os `<iframe data-src>` inline em `exhibitions.html` ficam sem uso agora que o
      play abre só o lightbox — remover se não voltarem a ser usados. — severity: low — effort: S
- [ ] [index] Nota (sem risco real): `js/index.js:45` usa `esc()` em `ctaHref`, que é construído
      localmente com `encodeURIComponent` — correto, mas `isSafeUrl()` é o guard convencional para
      URLs. `profile_url` já usa `isSafeUrl` corretamente. — severity: low — effort: S
- [ ] [static] Open Graph incompleto: about/contact-us/faqs têm `og:title`/`og:url`/`og:type` mas
      sem `og:image` nem `og:description`; privacy-policy e terms-of-use não têm OG nenhum.
      — severity: low — effort: S
- [ ] [static] As 5 páginas estáticas carregam `js/utils.js` e `js/toast.js` sem nenhum consumidor
      (não têm script de página). Duas requisições desnecessárias por página; indentação dos
      `<script>` também inconsistente. — severity: low — effort: S
- [ ] [static] `faqs.html`: as `<h2 class="faq-question">` não têm `id`, logo não há deep-link para
      uma pergunta — e a página está no sitemap. — severity: low — effort: S

## Documentation

- [ ] [docs] CLAUDE.md drift: says 3 dashboard tabs (there are 4 — Consent Forms exists), `--black`
      as `#0a0a0a` (code says `#000000`), and omits i.ytimg.com in img-src, the PWA
      (manifest/sw/standalone), auth pages beyond login, and the frozen-guest flow. SPECIFY.md now
      supersedes those sections; update or slim CLAUDE.md when convenient. — severity: low — effort: S

## Video Collaboration (planeado, não implementado)

- [ ] [feature] Sistema de comissão de vídeo (Renan/Marina 5% configurável, Moreirart fixo/mês
      sem cálculo): checkbox "Film this session" no modal de booking, campo de valor condicional,
      ícone de câmara no calendário, secção admin "Video Revenue" com toggle pago/não pago, painel
      read-only na Profile tab do residente. Cross-repo: frontend (dashboard.js/css) + backend
      (schema, admin panel, outro repo). — severity: — effort: L
- [ ] [feature] Guest: toggle diária vs percentagem no admin (ideia relacionada, backend/admin
      panel — appreciart-internal, fora do escopo deste TASKS.md; registar só como referência
      cruzada). — severity: — effort: L
