/* Explicit, in-place interface localization. Chemical records are never translated. */
(function (root) {
  'use strict';
  const supportedLocales = Object.freeze([
    { code: 'en', name: 'English', dir: 'ltr' },
    { code: 'es', name: 'Español', dir: 'ltr' },
    { code: 'fr', name: 'Français', dir: 'ltr' },
    { code: 'zh-Hans', name: '简体中文', dir: 'ltr' },
    { code: 'ar', name: 'العربية', dir: 'rtl' },
    { code: 'de', name: 'Deutsch', dir: 'ltr' }
  ].map(Object.freeze));
  let locale = 'en';
  // The document owns nodes; this registry never keeps a removed subtree alive.
  const bindings = new WeakMap();
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
  const resolve = value => typeof value === 'function' ? value() : value;
  function t(key, params = {}, fallback) {
    const catalogs = root.AtlasLocales || {};
    const pattern = own(catalogs[locale], key) ? catalogs[locale][key] : own(catalogs.en, key) ? catalogs.en[key] : fallback !== undefined ? fallback : key;
    const values = resolve(params) || {};
    return String(pattern).replace(/\{([\w.-]+)\}/g, (token, name) => own(values, name) ? String(resolve(values[name]) ?? '') : token);
  }
  function render(element, attribute, binding) {
    const value = t(binding.key, binding.params, binding.fallback);
    if (attribute === 'text') {
      if (element.textContent !== value) element.textContent = value;
    } else if (element.getAttribute?.(attribute) !== value) element.setAttribute?.(attribute, value);
  }
  function bind(element, attribute, key, params, fallback) {
    if (!element) return element;
    let record = bindings.get(element);
    if (!record) { record = new Map(); bindings.set(element, record); }
    const binding = { key, params, fallback };
    record.set(attribute, binding);
    element.setAttribute?.('data-atlas-i18n-bound', '');
    render(element, attribute, binding);
    return element;
  }
  function bindText(element, key, params = {}, fallback) { return bind(element, 'text', key, params, fallback); }
  function bindAttr(element, attribute, key, params = {}, fallback) { return bind(element, attribute, key, params, fallback); }
  function apply(rootNode = root.document) {
    if (!rootNode) return;
    // Inspect only explicit data-i18n annotations; never match or replace arbitrary text.
    const nodes = [rootNode, ...Array.from(rootNode.querySelectorAll?.('*') || [])];
    nodes.forEach(element => {
      if (!element || (element.nodeType !== undefined && element.nodeType !== 1)) return;
      const record = bindings.get(element);
      const annotations = Array.from(element.attributes || []).filter(a => a.name === 'data-i18n' || a.name.startsWith('data-i18n-'));
      annotations.forEach(a => {
        const attribute = a.name === 'data-i18n' ? 'text' : a.name.slice(10);
        if (!attribute || record?.has(attribute)) return;
        bind(element, attribute, a.value, {}, attribute === 'text' ? element.textContent : element.getAttribute?.(attribute));
      });
      bindings.get(element)?.forEach((binding, attribute) => render(element, attribute, binding));
    });
  }
  function setLocale(code) {
    const metadata = supportedLocales.find(item => item.code === code);
    if (!metadata) return locale;
    const changed = locale !== code;
    locale = code;
    if (root.document?.documentElement) {
      root.document.documentElement.lang = code;
      root.document.documentElement.dir = metadata.dir;
    }
    apply();
    if (changed && root.document?.dispatchEvent) {
      const EventClass = root.CustomEvent || (typeof CustomEvent !== 'undefined' && CustomEvent);
      if (EventClass) root.document.dispatchEvent(new EventClass('atlas:localechange', { detail: { locale: code, dir: metadata.dir } }));
    }
    return locale;
  }
  const api = Object.freeze({ t, bindText, bindAttr, apply, setLocale, get locale() { return locale; }, supportedLocales });
  root.AtlasI18n = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
