import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../lib/settings';
import { soundManager } from '../lib/soundManager';

interface SettingsContextValue {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  updateSetting: () => {},
});

/**
 * Provider único de preferências, montado uma vez em App.tsx.
 *
 * Toda alteração é aplicada imediatamente (contexto React) e persistida em
 * localStorage - não existe estado "não salvo": o botão "Salvar" na tela de
 * Configurações apenas confirma visualmente e volta ao menu, mas qualquer
 * alteração já está ativa e salva a partir do momento em que é feita.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  useEffect(() => {
    saveSettings(settings);
    soundManager.configure(settings);
  }, [settings]);

  useEffect(() => {
    document.documentElement.classList.toggle('high-contrast', settings.highContrast);
    document.documentElement.classList.toggle('reduced-motion', !settings.animations);
  }, [settings.highContrast, settings.animations]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      updateSetting: (key, val) => setSettings((prev) => ({ ...prev, [key]: val })),
    }),
    [settings]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
