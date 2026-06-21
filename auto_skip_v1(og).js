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
// Initial version with a single global cooldown timer to prevent rapid clicks. Uses known selectors for Netflix and Crunchyroll, but no fallback if they change.

(function () {
  'use strict';

  const CHECK_INTERVAL_MS = 1000;
  const CLICK_COOLDOWN_MS = 3000; // don't click anything again for 3s after a click

  let lastClickTime = 0;

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
    if (Date.now() - lastClickTime < CLICK_COOLDOWN_MS) return;
    for (const sel of NETFLIX_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn) {
        console.log('[AutoSkip] Netflix clicking:', sel);
        btn.click();
        lastClickTime = Date.now();
        return;
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
    '[class*="skip-preview"]',
    '[class*="upnext"] button',
    '[data-testid="play-next-episode-button"]',
  ];

  function clickIfFoundCrunchyroll() {
    if (Date.now() - lastClickTime < CLICK_COOLDOWN_MS) return;

    for (const sel of CRUNCHYROLL_SELECTORS) {
      const btn = document.querySelector(sel);
      if (btn) {
        console.log('[AutoSkip] Crunchyroll clicking (selector):', sel);
        btn.click();
        lastClickTime = Date.now();
        return;
      }
    }

    // Fallback: find any visible button whose text matches "skip" patterns
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
        console.log('[AutoSkip] Crunchyroll clicking (text match):', text);
        btn.click();
        lastClickTime = Date.now();
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
