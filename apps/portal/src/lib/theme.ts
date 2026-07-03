import { useEffect, useState } from 'react';

const STORAGE_KEY = 'portal-theme';

type Mode = 'light' | 'dark';

function getStoredMode(): Mode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyMode(mode: Mode) {
  document.documentElement.classList.toggle('dark', mode === 'dark');
}

/** Apply the persisted theme before React renders (call once from main.tsx). */
export function initTheme() {
  applyMode(getStoredMode());
}

/** Small theme hook — no dependency, persists to localStorage + toggles `.dark`. */
export function useTheme() {
  const [mode, setMode] = useState<Mode>(() => getStoredMode());

  useEffect(() => {
    applyMode(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const toggle = () => setMode((m) => (m === 'dark' ? 'light' : 'dark'));

  return { mode, isDark: mode === 'dark', toggle };
}
