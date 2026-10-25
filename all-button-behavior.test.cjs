'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

let nativeControlSource;
try {
  nativeControlSource = fs.readFileSync(path.join(__dirname, 'native-filter-control.fixture.js'), 'utf8');
} catch (error) {
  if (error.code === 'ENOENT') {
    throw new Error('Native compatibility fixture is missing. Run node prepare-native-filter-fixture.cjs, then rerun node --test all-button-behavior.test.cjs.');
  }
  throw error;
}
const userscriptSource = fs.readFileSync(path.join(__dirname, 'filter-markers_all-button-behavior.user.js'), 'utf8');

// The fixture runs the site's native handlers. This small DOM implements
// only the tree, classes, and event phases those handlers and the userscript use.
class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this.listeners = new Map();
    this.classes = new Set();
    this.ownText = '';
    this.classList = {
      add: (...names) => names.forEach(name => this.classes.add(name)),
      remove: (...names) => names.forEach(name => this.classes.delete(name)),
      contains: name => this.classes.has(name),
    };
  }

  get className() { return [...this.classes].join(' '); }
  set className(value) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
  get textContent() { return this.ownText + this.children.map(child => child.textContent).join(''); }
  set textContent(value) {
    this.children.forEach(child => { child.parentElement = null; });
    this.children = [];
    this.ownText = String(value);
  }
  get innerText() { return this.textContent; }
  set innerText(value) { this.textContent = value; }
  get innerHTML() { return this.textContent; }
  set innerHTML(value) { this.textContent = value; }

  appendChild(child) {
    if (child.parentElement) {
      const oldSiblings = child.parentElement.children;
      oldSiblings.splice(oldSiblings.indexOf(child), 1);
    }
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  matches(selector) {
    const match = /^(\w+)?((?:\.[\w-]+)*)$/.exec(selector);
    if (!match) throw new Error(`Unsupported fixture selector: ${selector}`);
    return (!match[1] || this.tagName === match[1].toUpperCase())
      && match[2].split('.').filter(Boolean).every(name => this.classes.has(name));
  }

  closest(selector) {
    for (let element = this; element; element = element.parentElement) {
      if (element.matches(selector)) return element;
    }
    return null;
  }

  querySelectorAll(selector) {
    const matches = [];
    for (const child of this.children) {
      if (child.matches(selector)) matches.push(child);
      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  getElementsByClassName(name) { return this.querySelectorAll(`.${name}`); }

  addEventListener(type, callback, options = false) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push({ callback, capture: options === true || Boolean(options?.capture) });
    this.listeners.set(type, listeners);
  }

  click() {
    const route = [];
    for (let element = this; element; element = element.parentElement) route.push(element);
    const event = {
      type: 'click', target: this, defaultPrevented: false, stopped: false, immediate: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.stopped = true; },
      stopImmediatePropagation() { this.stopped = true; this.immediate = true; },
    };
    const deliver = (element, capture) => {
      for (const listener of element.listeners.get('click') ?? []) {
        if (listener.capture === capture) listener.callback(event);
        if (event.immediate) break;
      }
    };
    for (const element of [...route].reverse()) {
      deliver(element, true);
      if (event.stopped) return event;
    }
    for (const element of route) {
      deliver(element, false);
      if (event.stopped) return event;
    }
    return event;
  }
}

const categoryDefinitions = [
  ['Well', 'Locations'],
  ['Cave', 'Locations'],
  ['Shrine of Light', 'Travel Gates'],
  ['Lightroot', 'Travel Gates'],
  ['Armor', 'Collectibles'],
];

function createHarness({ stored = {}, categories = categoryDefinitions, install = true } = {}) {
  const document = new FakeElement('document');
  document.body = document.appendChild(new FakeElement('body'));
  document.createElement = tagName => new FakeElement(tagName);
  const values = new Map(Object.entries(structuredClone(stored)));
  const writes = [];
  const settingsStore = {
    getItem(key) { return structuredClone(values.get(key)); },
    setItem(key, value) {
      writes.push(key);
      values.set(key, structuredClone(value));
    },
  };
  const mapLayers = ['Surface', 'Sky', 'Depths'].map(layerName => {
    const visible = new Map(categories.map(([name]) => [name, true]));
    return {
      layerName, visible, calls: [],
      setVisibility(name, state) { this.calls.push([name, state]); visible.set(name, state); },
      showCategory(name) { this.setVisibility(name, true); },
      hideCategory(name) { this.setVisibility(name, false); },
      resetCategoryVisibility(name) { this.setVisibility(name, true); },
      categoryStartsVisible(name) { visible.set(name, true); },
      categoryStartsHidden(name) { visible.set(name, false); },
    };
  });
  const g = {
    DomUtil: {
      create(tag, classes, parent) {
        const element = document.createElement(tag);
        element.className = classes;
        if (parent) parent.appendChild(element);
        return element;
      },
      addClass: (element, name) => element.classList.add(name),
      removeClass: (element, name) => element.classList.remove(name),
      hasClass: (element, name) => element.classList.contains(name),
    },
    DomEvent: { addListener: (element, type, handler) => element.addEventListener(type, handler) },
  };
  class Je {
    constructor() {
      this.container = g.DomUtil.create('div', 'zd-control__pane', document.body);
    }
  }
  const context = vm.createContext({
    document, Element: FakeElement, g, Je,
    T: (object, key, value) => { object[key] = value; },
  });
  vm.runInContext(`${nativeControlSource}\nglobalThis.NativeFilterControl = rl;`, context);
  const control = new context.NativeFilterControl(mapLayers, settingsStore);
  for (const [name, group] of categories) {
    control.addCategory({ name, iconUrl: `/${name}.png`, iconWidth: 35, iconHeight: 35 }, group);
  }
  if (install) vm.runInContext(userscriptSource, context);
  return {
    document, control, mapLayers, values, writes,
    install() { vm.runInContext(userscriptSource, context); },
    category(name) { return control.categories.find(entry => entry.category.name === name).li; },
    selected() {
      return control.categories.filter(entry => entry.li.classList.contains('selected'))
        .map(entry => entry.category.name).sort();
    },
  };
}

function assertSelection(harness, names) {
  const expected = [...names].sort();
  assert.deepEqual(Array.from(harness.selected()), expected, 'selected individual filters');
  for (const layer of harness.mapLayers) {
    assert.deepEqual([...layer.visible].filter(([, visible]) => visible).map(([name]) => name).sort(),
      expected, `visible categories on ${layer.layerName}`);
  }
}

const allNames = categoryDefinitions.map(([name]) => name);

test('native fixture reproduces All followed by Well showing only wells', () => {
  const harness = createHarness({ install: false });
  harness.control.all.click();
  assert.deepEqual(Array.from(harness.selected()), []);
  harness.category('Well').click();
  assertSelection(harness, ['Well']);
});

test('All leaves native special mode, selects each filter, and Well then excludes only wells', () => {
  const harness = createHarness();
  assert.equal(harness.control.all.classList.contains('selected'), true);
  harness.control.all.click();
  assertSelection(harness, allNames);
  assert.equal(harness.control.all.classList.contains('selected'), false);
  assert.equal(harness.control.none.classList.contains('selected'), false);
  assert.deepEqual(harness.values.get('Filter-Selected').slice().sort(), allNames.slice().sort());

  harness.category('Well').click();
  assertSelection(harness, allNames.filter(name => name !== 'Well'));
  assert.deepEqual(harness.values.get('Filter-Selected').slice().sort(),
    allNames.filter(name => name !== 'Well').sort());
  harness.category('Well').click();
  assertSelection(harness, allNames);
});

test('All fills a partial selection and repeated All preserves every selection', () => {
  const harness = createHarness({ stored: { 'Filter-Selected': ['Cave', 'Armor'] } });
  harness.control.all.click();
  assertSelection(harness, allNames);
  assert.equal(harness.mapLayers[0].calls.some(([name, visible]) =>
    ['Cave', 'Armor'].includes(name) && !visible), false, 'existing selections are not toggled off');
  const writeCount = harness.writes.length;
  const callCounts = harness.mapLayers.map(layer => layer.calls.length);
  harness.control.all.click();
  assertSelection(harness, allNames);
  assert.equal(harness.writes.length, writeCount, 'repeated All needs no extra saved-state writes');
  assert.deepEqual(harness.mapLayers.map(layer => layer.calls.length), callCounts);
});

test('native None still clears all filters and Well then selects only wells', () => {
  const harness = createHarness();
  harness.control.all.click();
  harness.control.none.click();
  assertSelection(harness, []);
  assert.equal(harness.values.get('Filter-Selected'), 'None');
  harness.category('Well').click();
  assertSelection(harness, ['Well']);
  assert.deepEqual(harness.values.get('Filter-Selected'), ['Well']);
});

test('All includes filters in collapsed groups without expanding those groups', () => {
  const harness = createHarness({ stored: { 'Filter-Collapsed': ['Locations'] } });
  const title = harness.control.container.querySelectorAll('.zd-legend-group__title')
    .find(element => element.textContent === 'Locations');
  const body = title.closest('.zd-legend-group').querySelector('.zd-legend-group__body');
  assert.equal(body.classList.contains('visible'), false);
  harness.control.all.click();
  assertSelection(harness, allNames);
  assert.equal(body.classList.contains('visible'), false);
  assert.deepEqual(harness.values.get('Filter-Collapsed'), ['Locations']);
  assert.equal(harness.writes.includes('Filter-Collapsed'), false);
});

test('individual selections persist through a fresh native control', () => {
  const first = createHarness({ stored: { 'show-Completed': false, 'controls-on-left': true } });
  first.control.all.click();
  first.category('Well').click();
  assert.equal(first.values.get('show-Completed'), false);
  assert.equal(first.values.get('controls-on-left'), true);
  assert.equal(first.writes.every(key => key === 'Filter-Selected'), true);

  const restored = createHarness({ stored: Object.fromEntries(first.values) });
  assertSelection(restored, allNames.filter(name => name !== 'Well'));
  assert.equal(restored.writes.length, 0, 'installing the script does not normalize existing settings');
  restored.control.all.click();
  assertSelection(restored, allNames);
});

test('nested content in the All control still activates every filter', () => {
  const harness = createHarness();
  harness.control.all.textContent = '';
  const span = harness.control.all.appendChild(new FakeElement('span'));
  span.textContent = 'All';
  span.click();
  assertSelection(harness, allNames);
});

test('unrelated All tabs and an unpopulated filter pane retain native clicks', () => {
  const harness = createHarness();
  const pane = harness.document.body.appendChild(new FakeElement('div'));
  pane.className = 'zd-control__pane';
  const title = pane.appendChild(new FakeElement('h3'));
  title.className = 'zd-control__title';
  title.textContent = 'Other Controls';
  const tab = pane.appendChild(new FakeElement('li'));
  tab.className = 'zd-tab';
  tab.textContent = 'All';
  let nativeCalls = 0;
  tab.addEventListener('click', () => nativeCalls++);
  const event = tab.click();
  assert.equal(nativeCalls, 1);
  assert.equal(event.defaultPrevented, false);
  assert.equal(harness.writes.length, 0);

  const empty = createHarness({ categories: [], stored: { 'Filter-Selected': 'None' } });
  empty.control.all.click();
  assert.equal(empty.values.get('Filter-Selected'), 'All');
  assert.equal(empty.control.all.classList.contains('selected'), true);
});
