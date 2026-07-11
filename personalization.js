/* Predict2U v167 personalization — private, local-first preferences.
   Stores only interface preferences in this browser. No account is required. */
(function () {
  'use strict';

  const STORAGE_KEY = 'p2u-personalization-v167';
  const MAX_RECENT = 8;
  const DEFAULTS = {
    favoriteEngines: [],
    favoriteLeagues: [],
    hiddenLeagues: [],
    cardView: 'standard',
    boardScope: 'all',
    rememberFilters: true,
    startMyBoard: false,
    homeEngine: 'top',
    savedFilter: { engine: 'top', league: 'all', search: '' },
    recentMatches: []
  };

  let context = null;
  let engineMap = new Map();
  let prefs = load();
  let mounted = false;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function cleanArray(value) {
    return Array.isArray(value)
      ? [...new Set(value.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim()))]
      : [];
  }

  function sanitize(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const saved = source.savedFilter && typeof source.savedFilter === 'object' ? source.savedFilter : {};
    const recent = Array.isArray(source.recentMatches) ? source.recentMatches : [];
    return {
      favoriteEngines: cleanArray(source.favoriteEngines),
      favoriteLeagues: cleanArray(source.favoriteLeagues),
      hiddenLeagues: cleanArray(source.hiddenLeagues),
      cardView: ['compact', 'standard', 'detailed'].includes(source.cardView) ? source.cardView : 'standard',
      boardScope: source.boardScope === 'mine' ? 'mine' : 'all',
      rememberFilters: source.rememberFilters !== false,
      startMyBoard: source.startMyBoard === true,
      homeEngine: typeof source.homeEngine === 'string' && source.homeEngine ? source.homeEngine : 'top',
      savedFilter: {
        engine: typeof saved.engine === 'string' && saved.engine ? saved.engine : 'top',
        league: typeof saved.league === 'string' && saved.league ? saved.league : 'all',
        search: typeof saved.search === 'string' ? saved.search.slice(0, 120) : ''
      },
      recentMatches: recent
        .filter(item => item && typeof item === 'object' && item.key)
        .slice(0, MAX_RECENT)
        .map(item => ({
          key: String(item.key),
          home: String(item.home || ''),
          away: String(item.away || ''),
          league: String(item.league || ''),
          market: String(item.market || ''),
          proof: String(item.proof || 'proof.html'),
          viewedAt: Number(item.viewedAt) || Date.now()
        }))
    };
  }

  function load() {
    try {
      return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
    } catch (_) {
      return sanitize({});
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch (_) {
      // Preferences remain active for the current page if storage is unavailable.
    }
    applyView();
    updateBar();
  }

  function update(patch, refresh = true) {
    prefs = sanitize(Object.assign({}, prefs, patch));
    persist();
    if (refresh && context && typeof context.refresh === 'function') context.refresh();
    renderDrawer();
  }

  function configureEngines(engines) {
    engineMap = new Map((engines || []).map(engine => [engine.key, engine.name]));
  }

  function favoriteEngineNames() {
    return new Set(prefs.favoriteEngines.map(key => engineMap.get(key)).filter(Boolean));
  }

  function hasFavorites() {
    return prefs.favoriteEngines.length > 0 || prefs.favoriteLeagues.length > 0;
  }

  function getInitialBoardState(validEngineKeys) {
    const valid = new Set(['top', 'acca'].concat(validEngineKeys || []));
    let engine = 'top';
    let league = 'all';
    let search = '';

    if (prefs.rememberFilters) {
      engine = valid.has(prefs.savedFilter.engine) ? prefs.savedFilter.engine : 'top';
      league = prefs.savedFilter.league || 'all';
      search = prefs.savedFilter.search || '';
    } else if (valid.has(prefs.homeEngine)) {
      engine = prefs.homeEngine;
    }

    const initialScope = prefs.startMyBoard && hasFavorites() ? 'mine' : prefs.boardScope;
    if (initialScope !== prefs.boardScope) {
      prefs.boardScope = initialScope;
      persist();
    }
    return {
      engine,
      league,
      search,
      scope: initialScope,
      cardView: prefs.cardView
    };
  }

  function saveBoardState(state) {
    const next = {};
    if (typeof state.scope === 'string') next.boardScope = state.scope === 'mine' ? 'mine' : 'all';
    if (prefs.rememberFilters) {
      next.savedFilter = {
        engine: typeof state.engine === 'string' ? state.engine : prefs.savedFilter.engine,
        league: typeof state.league === 'string' ? state.league : prefs.savedFilter.league,
        search: typeof state.search === 'string' ? state.search.slice(0, 120) : prefs.savedFilter.search
      };
    }
    update(next, false);
  }

  function filterRows(rows) {
    const hidden = new Set(prefs.hiddenLeagues);
    let filtered = (rows || []).filter(row => !hidden.has(String(row && row.m && row.m.league || '')));

    if (prefs.boardScope !== 'mine' || !hasFavorites()) return filtered;

    const favoriteNames = favoriteEngineNames();
    const favoriteLeagues = new Set(prefs.favoriteLeagues);
    return filtered.filter(row => {
      const leagueMatch = favoriteLeagues.has(String(row && row.m && row.m.league || ''));
      const engineMatch = Array.isArray(row && row.engines) && row.engines.some(name => favoriteNames.has(name));
      return leagueMatch || engineMatch;
    });
  }

  function visibleLeagues(leagues) {
    const hidden = new Set(prefs.hiddenLeagues);
    return (leagues || []).filter(league => !hidden.has(league));
  }

  function decorateLeagueSelect(select) {
    if (!select) return;
    const favorites = new Set(prefs.favoriteLeagues);
    [...select.options].forEach(option => {
      if (option.value === 'all') return;
      const clean = option.dataset.p2uLabel || option.textContent.replace(/^★\s*/, '');
      option.dataset.p2uLabel = clean;
      option.textContent = favorites.has(option.value) ? `★ ${clean}` : clean;
    });
  }

  function decorateEnginePills(host) {
    if (!host) return;
    const favorites = new Set(prefs.favoriteEngines);
    host.querySelectorAll('[data-mode]').forEach(button => {
      button.classList.toggle('p2u-favorite-engine', favorites.has(button.dataset.mode));
      if (favorites.has(button.dataset.mode)) button.setAttribute('aria-label', `${button.textContent.trim()}, favorite engine`);
    });
  }

  function applyView() {
    if (!document.body) return;
    document.body.dataset.p2uCardView = prefs.cardView;
    document.documentElement.dataset.p2uCardView = prefs.cardView;
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function allLeagues() {
    if (!context || typeof context.getLeagues !== 'function') return [];
    return [...new Set((context.getLeagues() || []).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function summaryText() {
    const e = prefs.favoriteEngines.length;
    const l = prefs.favoriteLeagues.length;
    if (!e && !l) return 'Choose favorites';
    return `${e} engine${e === 1 ? '' : 's'} · ${l} league${l === 1 ? '' : 's'}`;
  }

  function updateBar() {
    const root = document.getElementById('p2u-personalization-bar');
    if (!root) return;
    const mine = root.querySelector('[data-p2u-scope]');
    const summary = root.querySelector('[data-p2u-summary]');
    if (mine) {
      mine.classList.toggle('is-active', prefs.boardScope === 'mine');
      mine.setAttribute('aria-pressed', String(prefs.boardScope === 'mine'));
      mine.innerHTML = `<i class="fa-solid fa-star"></i><span>${prefs.boardScope === 'mine' ? 'My Board' : 'My Board'}</span>`;
    }
    if (summary) summary.textContent = summaryText();
    root.querySelectorAll('[data-p2u-view]').forEach(button => {
      const active = button.dataset.p2uView === prefs.cardView;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function openDrawer() {
    const backdrop = document.getElementById('p2u-personalization-backdrop');
    if (!backdrop) return;
    renderDrawer();
    backdrop.hidden = false;
    document.body.classList.add('p2u-personalization-open');
    requestAnimationFrame(() => backdrop.classList.add('is-open'));
    const close = backdrop.querySelector('[data-p2u-close]');
    if (close) close.focus();
  }

  function closeDrawer() {
    const backdrop = document.getElementById('p2u-personalization-backdrop');
    if (!backdrop) return;
    backdrop.classList.remove('is-open');
    document.body.classList.remove('p2u-personalization-open');
    setTimeout(() => { backdrop.hidden = true; }, 180);
  }

  function toggleArray(name, value) {
    const current = new Set(prefs[name]);
    if (current.has(value)) current.delete(value); else current.add(value);
    const patch = {};
    patch[name] = [...current];

    if (name === 'hiddenLeagues' && current.has(value)) {
      patch.favoriteLeagues = prefs.favoriteLeagues.filter(league => league !== value);
      if (prefs.savedFilter.league === value) patch.savedFilter = Object.assign({}, prefs.savedFilter, { league: 'all' });
    }
    update(patch, true);
  }

  function renderDrawer() {
    const panel = document.getElementById('p2u-personalization-panel');
    if (!panel || !context) return;
    const engines = context.engines || [];
    const leagues = allLeagues();
    const favoriteEngines = new Set(prefs.favoriteEngines);
    const favoriteLeagues = new Set(prefs.favoriteLeagues);
    const hiddenLeagues = new Set(prefs.hiddenLeagues);

    panel.innerHTML = `
      <div class="p2u-personal-head">
        <div>
          <div class="p2u-personal-kicker">YOUR PREDICT2U</div>
          <h2>Personalize the board</h2>
          <p>Saved only on this device. No password or account required.</p>
        </div>
        <button type="button" class="p2u-personal-close" data-p2u-close aria-label="Close personalization"><i class="fa-solid fa-xmark"></i></button>
      </div>

      <section class="p2u-personal-section">
        <div class="p2u-personal-section-title"><span>Favorite engines</span><small>${favoriteEngines.size}/${engines.length}</small></div>
        <div class="p2u-personal-chip-grid">
          ${engines.map(engine => `<button type="button" class="p2u-choice${favoriteEngines.has(engine.key) ? ' is-selected' : ''}" data-p2u-fav-engine="${esc(engine.key)}" aria-pressed="${favoriteEngines.has(engine.key)}"><i class="fa-${favoriteEngines.has(engine.key) ? 'solid' : 'regular'} fa-star"></i><span>${esc(engine.name)}</span></button>`).join('')}
        </div>
      </section>

      <section class="p2u-personal-section">
        <div class="p2u-personal-section-title"><span>Favorite leagues</span><small>${favoriteLeagues.size} selected</small></div>
        ${leagues.length ? `<div class="p2u-league-list">${leagues.map(league => `
          <div class="p2u-league-row${hiddenLeagues.has(league) ? ' is-hidden' : ''}">
            <button type="button" class="p2u-league-favorite${favoriteLeagues.has(league) ? ' is-selected' : ''}" data-p2u-fav-league="${esc(league)}" ${hiddenLeagues.has(league) ? 'disabled' : ''} aria-pressed="${favoriteLeagues.has(league)}"><i class="fa-${favoriteLeagues.has(league) ? 'solid' : 'regular'} fa-star"></i><span>${esc(league)}</span></button>
            <button type="button" class="p2u-league-hide${hiddenLeagues.has(league) ? ' is-selected' : ''}" data-p2u-hide-league="${esc(league)}" aria-pressed="${hiddenLeagues.has(league)}" title="${hiddenLeagues.has(league) ? 'Show league' : 'Hide league'}"><i class="fa-solid fa-${hiddenLeagues.has(league) ? 'eye-slash' : 'eye'}"></i></button>
          </div>`).join('')}</div>` : '<div class="p2u-personal-empty">League choices appear after match data loads.</div>'}
      </section>

      <section class="p2u-personal-section p2u-personal-options">
        <div class="p2u-personal-section-title"><span>Board behavior</span></div>
        <label class="p2u-switch-row"><span><b>Remember my filters</b><small>Restore your engine, league and search next time.</small></span><input type="checkbox" data-p2u-remember ${prefs.rememberFilters ? 'checked' : ''}/><i></i></label>
        <label class="p2u-switch-row"><span><b>Start on My Board</b><small>Open with favorite engines and leagues selected.</small></span><input type="checkbox" data-p2u-start-mine ${prefs.startMyBoard ? 'checked' : ''}/><i></i></label>
        <label class="p2u-select-row"><span><b>Default engine</b><small>Used when filter memory is turned off.</small></span><select data-p2u-home-engine><option value="top">All Engines</option>${engines.map(engine => `<option value="${esc(engine.key)}" ${prefs.homeEngine === engine.key ? 'selected' : ''}>${esc(engine.name)}</option>`).join('')}</select></label>
      </section>

      <section class="p2u-personal-section">
        <div class="p2u-personal-section-title"><span>Recently viewed</span><button type="button" data-p2u-clear-recent ${prefs.recentMatches.length ? '' : 'disabled'}>Clear</button></div>
        ${prefs.recentMatches.length ? `<div class="p2u-recent-list">${prefs.recentMatches.map(item => `<a href="${esc(item.proof || 'proof.html')}" class="p2u-recent-item"><span><b>${esc(item.home)} vs ${esc(item.away)}</b><small>${esc(item.league)}${item.market ? ` · ${esc(item.market)}` : ''}</small></span><i class="fa-solid fa-arrow-up-right-from-square"></i></a>`).join('')}</div>` : '<div class="p2u-personal-empty">Matches you open will appear here.</div>'}
      </section>

      <div class="p2u-personal-footer">
        <button type="button" class="p2u-reset" data-p2u-reset>Reset personalization</button>
        <button type="button" class="p2u-done" data-p2u-close>Done</button>
      </div>`;
  }

  function mountBoard(options) {
    context = Object.assign({}, context || {}, options || {});
    configureEngines(context.engines || []);
    applyView();

    if (!document.getElementById('p2u-personalization-bar')) {
      const target = document.getElementById('engine-pills');
      if (target) {
        const bar = document.createElement('div');
        bar.id = 'p2u-personalization-bar';
        bar.className = 'p2u-personalization-bar';
        bar.innerHTML = `
          <div class="p2u-personal-left">
            <button type="button" class="p2u-my-board" data-p2u-scope aria-pressed="false"><i class="fa-solid fa-star"></i><span>My Board</span></button>
            <button type="button" class="p2u-personalize-button" data-p2u-open><i class="fa-solid fa-sliders"></i><span>Personalize</span></button>
            <span class="p2u-personal-summary" data-p2u-summary></span>
          </div>
          <div class="p2u-view-switch" aria-label="Card view">
            <span>View</span>
            <button type="button" data-p2u-view="compact" aria-label="Compact card view"><i class="fa-solid fa-list"></i></button>
            <button type="button" data-p2u-view="standard" aria-label="Standard card view"><i class="fa-solid fa-border-all"></i></button>
            <button type="button" data-p2u-view="detailed" aria-label="Detailed card view"><i class="fa-solid fa-table-list"></i></button>
          </div>`;
        target.insertAdjacentElement('afterend', bar);
      }
    }

    if (!document.getElementById('p2u-personalization-backdrop')) {
      const backdrop = document.createElement('div');
      backdrop.id = 'p2u-personalization-backdrop';
      backdrop.className = 'p2u-personalization-backdrop';
      backdrop.hidden = true;
      backdrop.innerHTML = '<aside id="p2u-personalization-panel" class="p2u-personalization-panel" role="dialog" aria-modal="true" aria-label="Personalize Predict2U"></aside>';
      document.body.appendChild(backdrop);
    }

    updateBar();
    renderDrawer();
    mounted = true;
    document.documentElement.dataset.p2uPersonalizationReady = 'true';
    window.dispatchEvent(new CustomEvent('p2u:personalization-ready', { detail: { version: VERSION } }));
  }



  function inferFallbackContext() {
    const engineButtons = [...document.querySelectorAll('#engine-pills [data-engine], #engine-pills button')];
    const engines = engineButtons.map((button, index) => ({
      key: String(button.dataset.engine || button.dataset.key || button.value || `engine-${index + 1}`),
      name: String(button.textContent || '').trim() || `Engine ${index + 1}`
    })).filter(engine => engine.key && engine.name);
    const leagueSelect = document.getElementById('f-league');
    const leagues = leagueSelect ? [...leagueSelect.options].map(option => option.value).filter(value => value && value !== 'all') : [];
    return {
      engines,
      leagues,
      refresh: () => {},
      onScopeChange: () => {},
      resetBoard: () => {}
    };
  }

  function ensureMounted() {
    if (mounted) return;
    if (!document.getElementById('engine-pills')) return;
    mountBoard(inferFallbackContext());
  }

  function scheduleFallbackMount() {
    const attempt = () => {
      ensureMounted();
      if (!mounted) setTimeout(attempt, 250);
    };
    setTimeout(attempt, 0);
  }

  function recordMatch(article) {
    if (!article || !article.dataset.p2uMatchKey) return;
    const item = {
      key: article.dataset.p2uMatchKey,
      home: article.dataset.p2uHome || '',
      away: article.dataset.p2uAway || '',
      league: article.dataset.p2uLeague || '',
      market: article.dataset.p2uMarket || '',
      proof: article.dataset.p2uProof || 'proof.html',
      viewedAt: Date.now()
    };
    const rest = prefs.recentMatches.filter(existing => existing.key !== item.key);
    update({ recentMatches: [item].concat(rest).slice(0, MAX_RECENT) }, false);
  }

  document.addEventListener('click', event => {
    const open = event.target.closest('[data-p2u-open]');
    if (open) { openDrawer(); return; }

    const close = event.target.closest('[data-p2u-close]');
    if (close) { closeDrawer(); return; }

    const backdrop = event.target.closest('#p2u-personalization-backdrop');
    if (backdrop && event.target === backdrop) { closeDrawer(); return; }

    const scope = event.target.closest('[data-p2u-scope]');
    if (scope) {
      if (!hasFavorites()) { openDrawer(); return; }
      update({ boardScope: prefs.boardScope === 'mine' ? 'all' : 'mine' }, true);
      if (context && typeof context.onScopeChange === 'function') context.onScopeChange(prefs.boardScope);
      return;
    }

    const view = event.target.closest('[data-p2u-view]');
    if (view) { update({ cardView: view.dataset.p2uView }, true); return; }

    const engine = event.target.closest('[data-p2u-fav-engine]');
    if (engine) { toggleArray('favoriteEngines', engine.dataset.p2uFavEngine); return; }

    const league = event.target.closest('[data-p2u-fav-league]');
    if (league) { toggleArray('favoriteLeagues', league.dataset.p2uFavLeague); return; }

    const hideLeague = event.target.closest('[data-p2u-hide-league]');
    if (hideLeague) { toggleArray('hiddenLeagues', hideLeague.dataset.p2uHideLeague); return; }

    const clear = event.target.closest('[data-p2u-clear-recent]');
    if (clear) { update({ recentMatches: [] }, false); return; }

    const reset = event.target.closest('[data-p2u-reset]');
    if (reset) {
      prefs = sanitize({});
      persist();
      renderDrawer();
      if (context && typeof context.resetBoard === 'function') context.resetBoard();
      else if (context && typeof context.refresh === 'function') context.refresh();
      return;
    }

    const detailOrProof = event.target.closest('.btn-det, .p2u-proof-button');
    if (detailOrProof) recordMatch(detailOrProof.closest('[data-p2u-match-key]'));
  });

  document.addEventListener('change', event => {
    if (event.target.matches('[data-p2u-remember]')) {
      update({ rememberFilters: event.target.checked }, false);
      return;
    }
    if (event.target.matches('[data-p2u-start-mine]')) {
      update({ startMyBoard: event.target.checked }, false);
      return;
    }
    if (event.target.matches('[data-p2u-home-engine]')) {
      update({ homeEngine: event.target.value }, false);
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('p2u-personalization-open')) closeDrawer();
  });

  applyView();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleFallbackMount, { once: true });
  else scheduleFallbackMount();

  window.P2UPersonalization = {
    configureEngines,
    getInitialBoardState,
    saveBoardState,
    filterRows,
    visibleLeagues,
    decorateLeagueSelect,
    decorateEnginePills,
    mountBoard,
    getPrefs: () => clone(prefs),
    isMounted: () => mounted,
    refreshUI: () => { updateBar(); renderDrawer(); applyView(); }
  };
})();
