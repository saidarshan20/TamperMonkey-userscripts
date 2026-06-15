// ==UserScript==
// @name         Auto Skip Intro/Recap/Credits (Netflix + Crunchyroll)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Auto-clicks Skip Intro, Skip Recap, Skip Credits, and Next Episode buttons
// @author       You
// @match        https://www.netflix.com/*
// @match        https://www.crunchyroll.com/*
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const CHECK_INTERVAL_MS = 1000;

  // ---------------------------------------------------------
  // NETFLIX
  // ---------------------------------------------------------
  // Netflix exposes these via stable data-uia attributes.
  const NETFLIX_SELECTORS = [
    '[data-uia="player-skip-intro"]',
    '[data-uia="player-skip-recap"]',
    '[data-uia="player-skip-credits"]',
    '[data-uia="next-episode-seamless-button"]',
    '[data-uia="player-skip-precondition"]', // some "skip ad/preview" variants
  ];

  function clickIfFoundNetflix() {
    for (const sel of NETFLIX_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn) {
        console.log('[AutoSkip] Netflix clicking:', sel);
        btn.click();
      }
    }
  }

  // ---------------------------------------------------------
  // CRUNCHYROLL
  // ---------------------------------------------------------
  // Crunchyroll's skip button + "play next" overlay. Selectors can vary by
  // player version, so we try a few common patterns + a text-based fallback.
  const CRUNCHYROLL_SELECTORS = [
    '[data-testid="skip-button"]',
    '[data-t="skip-button"]',
    '.skip-button',
    '[class*="skip-credits"]',
    '[class*="skip-intro"]',
    '[class*="upnext"] button',
    '[data-testid="play-next-episode-button"]',
  ];

  function clickIfFoundCrunchyroll() {
    for (const sel of CRUNCHYROLL_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn) {
        console.log('[AutoSkip] Crunchyroll clicking (selector):', sel);
        btn.click();
        return;
      }
    }

    // Fallback: find any visible button whose text matches "skip" patterns
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      const text = (btn.textContent || '').trim().toLowerCase();
      if (
        text === 'skip intro' ||
        text === 'skip recap' ||
        text === 'skip credits' ||
        text === 'skip' ||
        text === 'play next'
      ) {
        console.log('[AutoSkip] Crunchyroll clicking (text match):', text);
        btn.click();
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