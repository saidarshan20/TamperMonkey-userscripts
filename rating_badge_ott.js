// ==UserScript==
// @name         Streaming Ratings Overlay (Netflix + Crunchyroll)
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Show IMDb/RT on Netflix detail modal, IMDb/MAL on Crunchyroll
// @author       You
// @match        https://www.netflix.com/*
// @match        https://www.crunchyroll.com/*
// @grant        GM_xmlhttpRequest
// @connect      www.omdbapi.com
// @connect      api.jikan.moe
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------
  // CONFIG
  // ---------------------------------------------------------
  const OMDB_API_KEY = 'YOUR_OMDB_KEY_HERE';
  const DEBOUNCE_MS = 600;
  const BADGE_ROW_CLASS = 'ratings-overlay-row';

  // ---------------------------------------------------------
  // CACHE
  // ---------------------------------------------------------
  // Sliding expiration: every time a title is accessed, its expiry
  // resets to SLIDING_TTL_DAYS from "now". Titles you keep revisiting
  // effectively never expire. Titles you never revisit get cleaned up
  // after SLIDING_TTL_DAYS of inactivity.
  const CACHE_KEY = 'ratings_overlay_cache_v5';
  const SLIDING_TTL_DAYS = 14;
  const SLIDING_TTL_MS = SLIDING_TTL_DAYS * 24 * 60 * 60 * 1000;

  const loadCache = () => {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
    } catch {
      return {};
    }
  };
  const saveCache = (c) => localStorage.setItem(CACHE_KEY, JSON.stringify(c));

  const getCached = (k) => {
    const c = loadCache();
    const e = c[k];
    if (!e) return null;

    if (Date.now() - e.lastAccessed > SLIDING_TTL_MS) {
      delete c[k];
      saveCache(c);
      console.log('[RatingsOverlay] Cache expired (inactive 14d+):', k);
      return null;
    }

    // touch: extend retention since it's being used again
    e.lastAccessed = Date.now();
    e.hits = (e.hits || 0) + 1;
    saveCache(c);
    return e.data;
  };

  const setCached = (k, data) => {
    const c = loadCache();
    c[k] = { ts: Date.now(), lastAccessed: Date.now(), hits: 1, data };
    saveCache(c);
  };

  // Periodic sweep: remove any entries idle for longer than SLIDING_TTL_MS.
  // Runs once per script load - cheap, and keeps localStorage from growing
  // unbounded with one-off titles you never revisit.
  const cleanupCache = () => {
    const c = loadCache();
    let removed = 0;
    for (const k of Object.keys(c)) {
      if (Date.now() - c[k].lastAccessed > SLIDING_TTL_MS) {
        delete c[k];
        removed++;
      }
    }
    if (removed > 0) {
      saveCache(c);
      console.log(`[RatingsOverlay] Cache cleanup: removed ${removed} stale entr${removed === 1 ? 'y' : 'ies'}`);
    }
  };
  cleanupCache();

  // ---------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------
  const sanitize = (s) => (s || '').trim().replace(/\s+/g, ' ');

  const gmGet = (url) =>
    new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        onload: (resp) => {
          try {
            resolve(JSON.parse(resp.responseText));
          } catch (e) {
            console.error('[RatingsOverlay] parse error', e, resp.responseText);
            resolve(null);
          }
        },
        onerror: (e) => {
          console.error('[RatingsOverlay] fetch error', url, e);
          resolve(null);
        },
      });
    });

  // OMDb: gives IMDb + Rotten Tomatoes (RT is sparse/legacy in OMDb - many
  // newer titles and most TV series simply have no RT entry there).
  async function fetchOMDb(title, type) {
    const directUrl = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}${
      type ? `&type=${type}` : ''
    }&apikey=${OMDB_API_KEY}`;
    console.log('[RatingsOverlay] OMDb direct fetch:', title);
    let data = await gmGet(directUrl);

    if (!data || data.Response === 'False') {
      console.log('[RatingsOverlay] OMDb direct miss, trying search fallback:', title, data);
      // Fallback: use the search endpoint and take the closest match
      const searchUrl = `https://www.omdbapi.com/?s=${encodeURIComponent(title)}${
        type ? `&type=${type}` : ''
      }&apikey=${OMDB_API_KEY}`;
      const searchData = await gmGet(searchUrl);
      const firstMatch = searchData?.Search?.[0];

      if (firstMatch?.imdbID) {
        const byIdUrl = `https://www.omdbapi.com/?i=${firstMatch.imdbID}&apikey=${OMDB_API_KEY}`;
        data = await gmGet(byIdUrl);
        console.log('[RatingsOverlay] OMDb search fallback matched:', firstMatch.Title);
      }
    }

    if (!data || data.Response === 'False') {
      console.log('[RatingsOverlay] OMDb: no entry found for', title, data);
      return null;
    }

    const imdb = data.imdbRating && data.imdbRating !== 'N/A' ? data.imdbRating : null;
    const rt = Array.isArray(data.Ratings)
      ? data.Ratings.find((r) => r.Source === 'Rotten Tomatoes')?.Value
      : null;

    if (!rt) {
      console.log('[RatingsOverlay] No RT score in OMDb for', data.Title || title, '- OMDb Ratings:', data.Ratings);
    }

    return { imdb, rt, title: data.Title };
  }

  // Jikan (MyAnimeList) - no key needed
  async function fetchMAL(title) {
    const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`;
    console.log('[RatingsOverlay] MAL fetch:', title);
    const data = await gmGet(url);
    const entry = data?.data?.[0];
    if (!entry) return null;
    return { score: entry.score, title: entry.title };
  }

  // ---------------------------------------------------------
  // BADGE UI - pill row
  // ---------------------------------------------------------
  function makePillRow(pills) {
    const row = document.createElement('div');
    row.className = BADGE_ROW_CLASS;
    row.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 10px 0;
      z-index: 9999;
    `;

    pills.forEach(({ icon, label, color, text }) => {
      const pill = document.createElement('div');
      pill.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: ${color};
        color: #111;
        font-weight: 700;
        font-size: 14px;
        padding: 6px 14px;
        border-radius: 999px;
        line-height: 1.2;
        white-space: nowrap;
      `;
      pill.textContent = `${icon} ${label} ${text}`;
      row.appendChild(pill);
    });

    if (!pills.length) {
      const pill = document.createElement('div');
      pill.style.cssText = `
        display: inline-flex; align-items: center;
        background: rgba(0,0,0,0.6); color: #fff;
        font-size: 13px; padding: 6px 14px; border-radius: 999px;
      `;
      pill.textContent = 'Ratings not found';
      row.appendChild(pill);
    }

    return row;
  }

  function buildPills({ imdb, rt, mal }) {
    const pills = [];
    if (imdb) pills.push({ icon: '⭐', label: 'IMDb', text: imdb, color: '#f5c518' });
    if (rt) pills.push({ icon: '🍅', label: 'RT', text: rt, color: '#ff9d8a' });
    if (mal) pills.push({ icon: '📺', label: 'MAL', text: mal, color: '#7ec1e8' });
    return pills;
  }

  // ---------------------------------------------------------
  // NETFLIX
  // ---------------------------------------------------------
  // Only act inside the FULL detail modal (the big popup with Resume/Play +
  // synopsis + cast), not the small hover-preview card on the browse grid.
  function getDetailModalScope() {
    return (
      document.querySelector('[class*="detail-modal"]') ||
      document.querySelector('.previewModal--container[class*="detail"]') ||
      null
    );
  }

  function findNetflixTitle(scope) {
    const selectors = [
      '[data-uia="video-title"]',
      '.previewModal--section-header strong',
      '.previewModal--title-and-meta-info h3',
      '.title-info h3',
    ];
    for (const sel of selectors) {
      const el = scope.querySelector(sel);
      const text = sanitize(el?.textContent);
      if (text) return text;
    }
    return null;
  }

  // Insert the pill row right below the Play / Resume action row
  function findNetflixInsertTarget(scope) {
    const selectors = [
      '.previewModal--actionsWrapper',
      '[data-uia="play-button"]',
      '[data-uia="action-button-resume"]',
    ];
    for (const sel of selectors) {
      const el = scope.querySelector(sel);
      if (!el) continue;
      return el.closest('.previewModal--actionsWrapper') || el.parentElement;
    }
    return null;
  }

  let nfLastTitle = '';
  let nfDebounce = null;

  async function processNetflix() {
    const scope = getDetailModalScope();
    if (!scope) return; // no detail modal open, do nothing

    const title = findNetflixTitle(scope);
    if (!title || title === nfLastTitle) return;
    nfLastTitle = title;

    const target = findNetflixInsertTarget(scope);
    if (!target) {
      console.log('[RatingsOverlay] Netflix: insert target not found yet');
      return;
    }

    document.querySelectorAll(`.${BADGE_ROW_CLASS}`).forEach((el) => el.remove());

    const cacheKey = `nf:${title.toLowerCase()}`;
    let cached = getCached(cacheKey);

    const loadingRow = makePillRow([]);
    loadingRow.firstChild.textContent = 'Loading ratings…';
    target.insertAdjacentElement('afterend', loadingRow);

    let result = cached;
    if (!result) {
      const omdb = await fetchOMDb(title);
      result = { imdb: omdb?.imdb, rt: omdb?.rt };
      setCached(cacheKey, result);
    }

    if (nfLastTitle === title) {
      loadingRow.replaceWith(makePillRow(buildPills(result)));
    }
  }

  function observeNetflix() {
    const observer = new MutationObserver(() => {
      clearTimeout(nfDebounce);
      nfDebounce = setTimeout(processNetflix, DEBOUNCE_MS);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ---------------------------------------------------------
  // CRUNCHYROLL
  // ---------------------------------------------------------
  function findCrunchyrollTitle() {
    const selectors = ['h1[class*="title"]', 'h1', '[data-t="series-title"]'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      const text = sanitize(el?.textContent);
      if (text && text.length > 1) return text;
    }
    const docTitle = document.title || '';
    const match = docTitle.split(' - Crunchyroll')[0].replace(/^Watch\s+/, '');
    const cleaned = sanitize(match.split(',')[0]);
    return cleaned || null;
  }

  let crLastTitle = '';
  let crDebounce = null;
  let crContainer = null;

  function ensureCrunchyrollContainer() {
    if (crContainer && document.body.contains(crContainer)) return crContainer;
    const div = document.createElement('div');
    div.style.cssText = `
      position: fixed;
      top: 70px;
      left: 16px;
      z-index: 99999;
    `;
    document.body.appendChild(div);
    crContainer = div;
    return div;
  }

  async function processCrunchyroll() {
    const title = findCrunchyrollTitle();
    if (!title || title === crLastTitle) return;
    crLastTitle = title;

    const container = ensureCrunchyrollContainer();
    container.innerHTML = '';
    const loadingRow = makePillRow([]);
    loadingRow.firstChild.textContent = 'Loading ratings…';
    container.appendChild(loadingRow);

    const cacheKey = `cr:${title.toLowerCase()}`;
    let cached = getCached(cacheKey);

    let result = cached;
    if (!result) {
      const [omdb, mal] = await Promise.all([
        fetchOMDb(title, 'series'),
        fetchMAL(title),
      ]);
      result = {
        imdb: omdb?.imdb,
        rt: omdb?.rt,
        mal: mal?.score,
      };
      setCached(cacheKey, result);
    }

    if (crLastTitle === title) {
      loadingRow.replaceWith(makePillRow(buildPills(result)));
    }
  }

  function observeCrunchyroll() {
    const observer = new MutationObserver(() => {
      clearTimeout(crDebounce);
      crDebounce = setTimeout(processCrunchyroll, DEBOUNCE_MS);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(processCrunchyroll, 1500);
  }

  // ---------------------------------------------------------
  // INIT
  // ---------------------------------------------------------
  if (location.hostname.includes('netflix.com')) {
    observeNetflix();
  } else if (location.hostname.includes('crunchyroll.com')) {
    observeCrunchyroll();
  }
})();