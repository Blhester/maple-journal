(() => {
  'use strict';
  const preferenceKey = 'maple-journal-theme';
  const root = document.documentElement;
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  let preference;
  try { preference = localStorage.getItem(preferenceKey); } catch { /* Theme still works without storage. */ }
  if (!['light','dark'].includes(preference)) preference = null;
  function applyTheme(theme) {
    root.dataset.theme = theme;
    const toggle = document.getElementById('theme-toggle');
    if (toggle) toggle.checked = theme === 'dark';
    const color = document.querySelector('meta[name="theme-color"]');
    if (color) color.setAttribute('content', theme === 'dark' ? '#111b17' : '#f6f5ed');
  }
  applyTheme(preference || (systemTheme.matches ? 'dark' : 'light'));
  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('theme-toggle');
    toggle.checked = root.dataset.theme === 'dark';
    toggle.addEventListener('change', () => {
      preference = toggle.checked ? 'dark' : 'light';
      applyTheme(preference);
      try { localStorage.setItem(preferenceKey,preference); } catch { /* Keep the selected theme for this visit. */ }
    });
  });
  systemTheme.addEventListener('change', event => {
    if (!preference) applyTheme(event.matches ? 'dark' : 'light');
  });
})();
