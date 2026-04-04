import { createContext, useState, useEffect, useContext } from 'react';
import themes from '../config/themes';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [themeName, setThemeName] = useState(() => {
    return localStorage.getItem('themeName') || 'dark';
  });

  const theme = themes[themeName] || themes.dark;

  useEffect(() => {
    localStorage.setItem('themeName', themeName);
    const root = document.documentElement;
    Object.entries(theme).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });
    root.setAttribute('data-theme', themeName);
  }, [themeName, theme]);

  return (
    <ThemeContext.Provider value={{ themeName, setThemeName, theme, themes: Object.keys(themes) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
