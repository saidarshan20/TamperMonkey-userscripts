// ==UserScript==
// @name         Auto Skip Intro/Recap/Credits (Netflix + Crunchyroll)
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Auto-clicks Skip Intro, Skip Recap, Skip Credits, and Next Episode buttons
// @author       You
// @match        https://www.netflix.com/*
// @match        https://www.crunchyroll.com/*
// @run-at       document-idle
// ==/UserScript==
// Updated version with per-button cooldowns and click scheduling to avoid rapid double-clicks on the same button. Also added a text-based fallback for Crunchyroll in case selectors miss.

(function () {
  'use strict';

  const CHECK_INTERVAL_MS = 1000;
  const SAME_BUTTON_COOLDOWN_MS = 3000;
  const CLICK_DELAY_MS = 0; // wait this long after spotting a button before clicking it (e.g. 1500 = 1.5s)

  // Per-button cooldown dictionary instead of one global timer.
  // Each button key tracks when it was last clicked independently.
  const lastClickedAt = {};
  const pendingClicks = {}; // tracks setTimeout ids per button key, so we don't double-schedule

  function canClick(key) {
    return Date.now() - (lastClickedAt[key] || 0) > SAME_BUTTON_COOLDOWN_MS;
  }

  function registerClick(key) {
    lastClickedAt[key] = Date.now();
  }

  // Schedules a click after CLICK_DELAY_MS, unless one's already scheduled
  // for this same key. Re-checks canClick() at fire-time too, in case the
  // cooldown window closes while the delay was waiting.
  function scheduleClick(key, btn, logLabel) {
    if (pendingClicks[key]) return; // already waiting to click this one
    if (!canClick(key)) return;

    pendingClicks[key] = setTimeout(() => {
      delete pendingClicks[key];
      if (canClick(key)) {
        console.log('[AutoSkip] clicking:', logLabel);
        btn.click();
        registerClick(key);
      }
    }, CLICK_DELAY_MS);
  }

  // ---------------------------------------------------------
  // NETFLIX
  // ---------------------------------------------------------
  const NETFLIX_SELECTORS = [
    '[data-uia="player-skip-intro"]',
    '[data-uia="player-skip-recap"]',
    '[data-uia="player-skip-credits"]',
    '[data-uia="next-episode-seamless-button"]',
    '[data-uia="player-skip-precondition"]',
  ];

  function clickIfFoundNetflix() {
    for (const sel of NETFLIX_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn) {
        scheduleClick(sel, btn, sel);
        return;
      }
    }
  }

  // ---------------------------------------------------------
  // CRUNCHYROLL
  // ---------------------------------------------------------
  const CRUNCHYROLL_SELECTORS = [
    '[data-testid="skip-button"]',
    '[data-t="skip-button"]',
    '.skip-button',
    '[class*="skip-credits"]',
    '[class*="skip-intro"]',
    '[class*="skip-preview"]',
    '[class*="upnext"] button',
    '[data-testid="play-next-episode-button"]',
  ];

  function clickIfFoundCrunchyroll() {
    for (const sel of CRUNCHYROLL_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn) {
        scheduleClick(sel, btn, sel);
        return;
      }
    }

    // Fallback: text content match
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = (btn.textContent || '').trim().toLowerCase();
      if (
        text.startsWith('skip intro') ||
        text.startsWith('skip recap') ||
        text.startsWith('skip credits') ||
        text.startsWith('skip preview') ||
        text === 'skip' ||
        text.startsWith('play next')
      ) {
        scheduleClick(text, btn, text);
        return;
      }
    }
  }

  // ---------------------------------------------------------
  // INIT
  // ---------------------------------------------------------
  const isNetflix = location.hostname.includes('netflix.com');
  const isCrunchyroll = location.hostname.includes('crunchyroll.com');

  if (isNetflix || isCrunchyroll) {
    setInterval(() => {
      if (isNetflix) clickIfFoundNetflix();
      if (isCrunchyroll) clickIfFoundCrunchyroll();
    }, CHECK_INTERVAL_MS);

    console.log('[AutoSkip] Running on', location.hostname);
  }
})();