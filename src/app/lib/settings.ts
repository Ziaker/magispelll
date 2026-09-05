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
 * - particleEffects: liga/desliga as partículas decorativas de fundo
 *   (RuneParticles, Home/Splash) E as nuvens de partículas via `party-js` dos
 *   bursts de combate (CardShatterBurst.tsx - Destruição de Reforço do Mago;
 *   FireShatterBurst.tsx - impacto da Bola de Fogo do Piromante, a fonte mais
 *   pesada real de uma partida já que Chama Repartida pode acionar até 3 de
 *   uma vez). FIX (pedido do usuário: "desconfio que a opção de reduzir
 *   efeitos e partículas não funciona como deveria") - antes só cobria as
 *   partículas de fundo, que nem aparecem durante uma partida de verdade
 *   (só no menu/splash) - por isso parecia não fazer nada quando ligado/
 *   desligado durante o jogo.
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
  /**
   * FIX (pedido do usuário: "desligar flashes de tela cheia", separado do
   * Tremor de Tela) - o flash cromático (ChromaticFlash.tsx) disparava no
   * MESMO estado (`screenShake`) que o tremor em GameBoard.tsx - os dois
   * agora têm seu próprio estado/gatilho independente, então desligar um
   * não precisa desligar o outro. Continua exigindo `animations` true.
   */
  screenFlashEnabled: boolean;
  /**
   * FIX (pedido do usuário: "mostrar/ocultar o Log de Ações por padrão") -
   * a coluna do Log (GameBoard.tsx) sempre ocupava 300px fixos; desligado,
   * ela some e a coluna central (mão + campo) ganha esse espaço de volta.
   */
  showActionLog: boolean;
  /**
   * FIX (pedido do usuário: "tamanho da carta / zoom da interface") -
   * substitui o `zoom: 0.85` hardcoded de GameBoard.tsx (aplicado à tela de
   * jogo INTEIRA - mão, campo, painéis) por um valor ajustável. 85 é o
   * valor de sempre (mesmo padrão visual de antes desta opção existir).
   */
  interfaceZoom: number; // 60-100, percentual
  /**
   * FIX (pedido do usuário: "confirmar antes de descartar") - desligado por
   * padrão (preserva o fluxo rápido de sempre); quando ligado, o botão
   * "Descartar" (PlayerZone.tsx) abre um diálogo de confirmação em vez de
   * descartar na hora, pra evitar descarte acidental por clique errado.
   */
  confirmBeforeDiscard: boolean;
  /**
   * FIX (pedido do usuário: "ocultar mão do oponente automaticamente" no
   * Hotseat) - fora do modo Hotseat isso nunca importa (contra a IA/
   * Espectador já escondem a mão automaticamente, ver isAiControlled em
   * PlayerZone.tsx). No Hotseat (os 2 lados são humanos, na mesma tela ao
   * mesmo tempo), liga um borrão (blur) sobre a mão de cada jogador por
   * padrão - um botão "Ver minha mão" por zona revela temporariamente (ver
   * PlayerZone.tsx). Desligado por padrão porque é uma mudança de fluxo
   * grande o bastante pra ser opt-in, não uma correção de bug.
   */
  hotseatPrivacyMode: boolean;
  /**
   * FIX (pedido do usuário: "ver as cartas da IA mesmo estando ocultas para
   * quem assiste no modo espectador") - só tem efeito com
   * `gameConfig.mode === 'spectator'` (ver `PlayerZone.forceRevealHand`,
   * calculado em GameBoard.tsx) - os dois lados sendo controlados pela IA,
   * ninguém está "competindo" de verdade, então mostrar as duas mãos pra
   * quem só está assistindo nunca dá vantagem injusta a ninguém. Nunca se
   * aplica no modo Contra a IA (revelaria a mão do oponente ao humano
   * jogando contra ela) nem no Hotseat (nenhum lado é controlado pela IA -
   * ver `hotseatPrivacyMode` acima para a preferência equivalente lá).
   * Desligado por padrão, mesmo padrão "opt-in" de `hotseatPrivacyMode`.
   */
  spectatorRevealHands: boolean;
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
  screenFlashEnabled: true,
  showActionLog: true,
  interfaceZoom: 85,
  confirmBeforeDiscard: false,
  hotseatPrivacyMode: false,
  spectatorRevealHands: false,
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
