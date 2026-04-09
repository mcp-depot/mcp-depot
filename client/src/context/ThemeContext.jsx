import { createContext, useState, useEffect, useContext } from 'react';
import themes from '../config/themes';
import api from '../services/api';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [themeName, setThemeName] = useState(() => {
    return localStorage.getItem('themeName') || 'dark';
  });
  const [customColors, setCustomColorsState] = useState({});
  const [previewColors, setPreviewColors] = useState(null);

  useEffect(() => {
    fetchCustomColors();
  }, []);

  const fetchCustomColors = async () => {
    try {
      const res = await api.get('/system/settings/theme-custom');
      if (res.data?.colors) {
        setCustomColorsState(res.data.colors);
      } else if (res.data?.value?.colors) {
        setCustomColorsState(res.data.value.colors);
      }
    } catch (e) {
      if (e.response?.status !== 404) {
        console.error('Failed to fetch custom colors:', e);
      }
    }
  };

  const saveCustomColors = async (colors) => {
    setCustomColorsState(colors);
    try {
      await api.put('/system/settings/theme-custom', { value: { colors } });
    } catch (e) {
      console.error('Failed to save custom colors:', e);
    }
  };

  const baseTheme = themes[themeName] || themes.dark;
  const effectiveColors = previewColors || { ...baseTheme, ...customColors };
  const theme = effectiveColors;

  useEffect(() => {
    localStorage.setItem('themeName', themeName);
    const root = document.documentElement;
    Object.entries(theme).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });
    root.setAttribute('data-theme', themeName);
  }, [themeName, theme]);

  return (
    <ThemeContext.Provider value={{ 
      themeName, 
      setThemeName, 
      theme, 
      themes: Object.keys(themes),
      customColors,
      previewColors,
      setPreviewColors: (colors) => setPreviewColors(colors),
      setCustomColors: saveCustomColors,
      confirmColors: async (colors) => {
        setPreviewColors(null);
        await saveCustomColors(colors);
      },
      resetPreview: () => setPreviewColors(null)
    }}>
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
