/**
 * settings.ts - Preferências do jogador (tela de Configurações)
 *
 * Essas preferências são pessoais do dispositivo (não da partida) e por isso
 * são persistidas em localStorage e carregadas uma vez ao abrir o app - ver
 * SettingsContext.tsx.
 *
 * O QUE REALMENTE É APLICADO:
 * - highContrast: aplica uma classe CSS global que aumenta contraste de texto e bordas.
 * - animations / animationSpeed: controla se e quão rápido as animações de
 *   transição de fase, resultado de combate e partículas decorativas rodam.
 * - particleEffects: liga/desliga as partículas decorativas (RuneParticles).
 * - screenReader: adiciona reforços de acessibilidade (aria-live no log de
 *   ações, rótulos extras) além do que o HTML semântico já oferece.
 * - soundEffects / volume: controlam de verdade os efeitos sonoros (9 sons CC0
 *   da Kenney em src/assets/sfx/, ver LICENSE.txt na mesma pasta) tocados via
 *   um SoundManager central (lib/soundManager.ts).
 * - backgroundMusic: ainda não há nenhuma música de fundo no projeto (só
 *   efeitos sonoros pontuais) - a preferência é salva fielmente, mas
 *   SoundManager não tem nenhum playMusic() implementado ainda.
 */
export interface Settings {
  soundEffects: boolean;
  backgroundMusic: boolean;
  volume: number; // 0-100
  animations: boolean;
  particleEffects: boolean;
  animationSpeed: number; // 50-200, percentual da velocidade padrão
  highContrast: boolean;
  screenReader: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  soundEffects: true,
  backgroundMusic: false,
  volume: 70,
  animations: true,
  particleEffects: true,
  animationSpeed: 100,
  highContrast: false,
  screenReader: false,
};

const STORAGE_KEY = 'magispelll:settings';

export function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage pode falhar (modo privado, cota excedida etc.) - preferências
    // continuam funcionando nesta sessão, só não persistem entre recarregamentos.
  }
}

/** Multiplicador de duração para animações (framer-motion), derivado das preferências. */
export function getAnimationDurationScale(settings: Settings): number {
  if (!settings.animations) return 0; // efetivamente instantâneo
  return 100 / Math.max(50, Math.min(200, settings.animationSpeed));
}
