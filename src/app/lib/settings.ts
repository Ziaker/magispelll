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
/**
 * FIX (pedido do usuário: "quero que adicione uma opção para só usar drag &
 * drop e uma para só usar cliques... deixe a cargo do jogador nas opções já
 * dentro do jogo") - controla APENAS o posicionamento de carta no campo
 * (principal ou horizontal) - o único par de interações "mesma ação, dois
 * jeitos de fazer" que o usuário reportou como tendo problema. Não afeta
 * fusão por arraste, transformar Ás por arraste, nem o atalho de arrastar
 * uma magia até o alvo (dragActivation.ts) - são recursos independentes,
 * cada um sem um equivalente por clique concorrente pra escolher entre si.
 * - 'both' (padrão): os dois jeitos funcionam, como sempre foi.
 * - 'dragOnly': só arrastar a carta até o slot funciona; clicar na carta
 *   não a seleciona mais para posicionamento (outros usos do clique -
 *   descarte, Fusão, Torres - continuam intactos).
 * - 'clickOnly': a carta para de ficar arrastável para posicionamento
 *   (cursor deixa de virar "mão fechada"); só o fluxo clique-na-carta →
 *   clique-no-slot → Posicionar/Horizontal funciona.
 */
export type HandInteractionMode = 'both' | 'dragOnly' | 'clickOnly';

export interface Settings {
  soundEffects: boolean;
  backgroundMusic: boolean;
  volume: number; // 0-100
  animations: boolean;
  particleEffects: boolean;
  animationSpeed: number; // 50-200, percentual da velocidade padrão
  highContrast: boolean;
  screenReader: boolean;
  handInteractionMode: HandInteractionMode;
  /**
   * FIX (pedido do usuário: "remover shaking", no menu de pausa) - controle
   * dedicado pro tremor de tela (golpe decisivo de combate, Magia Numeral -
   * ver `.animate-screen-shake`/`screenShake` em GameBoard.tsx), separado
   * de `animations`. Antes o tremor só respeitava `animations` (desligá-lo
   * já cortava o tremor, mas junto com TODA a transição/animação do jogo -
   * um martelo grande demais pra quem só quer parar de sacodir a tela).
   * Continua exigindo `animations` true pra disparar (nunca sacode com
   * animações totalmente desligadas) - este switch só afeta quem já tem
   * animações ligadas mas quer especificamente sem o tremor.
   */
  screenShakeEnabled: boolean;
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
  handInteractionMode: 'both',
  screenShakeEnabled: true,
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
