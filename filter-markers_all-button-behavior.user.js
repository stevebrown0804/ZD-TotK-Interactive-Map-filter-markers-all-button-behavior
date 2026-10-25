// ==UserScript==
// @name         ZD TotK Interactive Map -- Filter Markers All Button Behavior
// @namespace    local.filter-markers-all-button-behavior
// @version      1.1.1
// @license      MIT
// @description  Make All select every individual marker filter on Zelda Dungeon's Tears of the Kingdom interactive map.
// @match        https://www.zeldadungeon.net/tears-of-the-kingdom-interactive-map*
// @match        https://zeldadungeon.net/tears-of-the-kingdom-interactive-map*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    const all = target?.closest('.zd-tab');
    if (!all || all.textContent.trim() !== 'All') return;

    const pane = all.closest('.zd-control__pane');
    if (pane?.querySelector('.zd-control__title')?.textContent.trim() !== 'Filter Markers') return;

    const tabs = all.closest('.zd-tabs');
    const none = [...(tabs?.querySelectorAll('.zd-tab') ?? [])]
      .find(tab => tab.textContent.trim() === 'None');
    const categories = [...pane.querySelectorAll('.zd-legend__category')];
    if (!none || categories.length === 0) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    // Leave the site's special All mode before selecting individual filters.
    // Native clicks update marker visibility, underlines, and saved settings together.
    if (all.classList.contains('selected')) none.click();
    for (const category of categories) {
      if (!category.classList.contains('selected')) category.click();
    }
  }, true);
})();
