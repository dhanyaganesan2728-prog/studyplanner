// js/theme.js — single theme toggle, sidebar only
export const applyTheme = (theme) => {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ss-theme', theme);
  const dark = theme === 'dark';
  const el = document.getElementById('theme-icon');
  if (el) el.className = dark ? 'bi bi-moon-stars-fill' : 'bi bi-sun-fill';
  // topbar icon (mobile)
  const tel = document.getElementById('topbar-theme-icon');
  if (tel) tel.className = dark ? 'bi bi-moon-stars-fill' : 'bi bi-sun-fill';
  document.querySelectorAll('.btn-close').forEach(b => b.classList.toggle('btn-close-white', dark));
};

export const toggleTheme = () => {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
};

export const initTheme = () => applyTheme(localStorage.getItem('ss-theme') || 'dark');

window.toggleTheme = toggleTheme;
