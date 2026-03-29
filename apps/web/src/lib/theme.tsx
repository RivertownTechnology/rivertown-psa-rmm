import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

type Mode = 'light' | 'dark';
type ColorTheme = 'blue' | 'red' | 'green' | 'orange';

interface ThemeContextType {
  mode: Mode;
  color: ColorTheme;
  setMode: (mode: Mode) => void;
  setColor: (color: ColorTheme) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() => {
    const stored = localStorage.getItem('theme-mode') as Mode;
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [color, setColorState] = useState<ColorTheme>(() =>
    (localStorage.getItem('theme-color') as ColorTheme) || 'blue',
  );

  function setMode(m: Mode) {
    setModeState(m);
    localStorage.setItem('theme-mode', m);
  }

  function setColor(c: ColorTheme) {
    setColorState(c);
    localStorage.setItem('theme-color', c);
  }

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', mode === 'dark');
    root.setAttribute('data-theme', color);
  }, [mode, color]);

  return (
    <ThemeContext.Provider value={{ mode, color, setMode, setColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
