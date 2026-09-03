/**
 * GameBoard.tsx - Tabuleiro Principal do Jogo
 *
 * Camada de UI fina sobre o motor de regras (lib/gameEngine.ts). Este
 * componente NUNCA calcula regras do jogo diretamente - ele apenas:
 * - despacha ações (dispatch) em resposta a cliques
 * - decide QUANDO mostrar popups/animações e agenda a próxima ação depois de
 *   um tempo (ex.: mostrar o resultado do combate por alguns segundos antes
 *   de despachar FINALIZE_COMBAT)
 * - guarda seleções transitórias que ainda não viraram uma ação de jogo
 *   (carta selecionada na mão, assistente de magia em andamento, etc.)
 * - renderiza o estado atual (gameState)
 *
 * Todo o restante (combate, magias, magia numeral, baralho, vidas, etc.)
 * vive em gameEngine.ts como um reducer puro. Ver o cabeçalho daquele
 * arquivo para a explicação completa da arquitetura e do bug de duplicação
 * de cartas que ela resolve.
 */

import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { MagicToast } from './MagicToast';
import { LogPanel } from './LogPanel';
import { getLogEffectInfo, getLogIcon } from '../lib/logFormat';
import { FlyingDiscardCard, type FlyingDiscardSpec } from './FlyingDiscardCard';
import confetti from 'canvas-confetti';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Slider } from './ui/slider';
import { Label } from './ui/label';
import { Pause, Play, ArrowLeft, Check, Clock, Heart, Skull, Layers3, Trophy, Box, Settings as SettingsIcon, Sparkles } from 'lucide-react';
import { PlayerZone } from './PlayerZone';
import { BattleField } from './BattleField';
import { CharacterMagicReference } from './CharacterMagicReference';
import { MonsterZone } from './MonsterZone';
import { PhaseTransition, getSpotlightCutsceneDurationMs } from './PhaseTransition';
import { CombatResult } from './CombatResult';
import { PlayingCard } from './PlayingCard';
import { CardDragLayer } from './CardDragLayer';
import { ArenaMagicBurst } from './ArenaMagicBurst';
import type { CombatValueRevealSpec } from './CombatValueReveal';
import { SpeedlinesBackground } from './SpeedlinesBackground';
import { SpotlightSidebar } from './SpotlightSidebar';
import { ReactionAlertBanner } from './ReactionAlertBanner';
import { ReactionNegatedBurst, type ReactionNegatedBurstSpec } from './ReactionNegatedBurst';
import { BulletImpactBurst, type BulletImpactSpec } from './BulletImpactBurst';
import { FireballProjectile, type FireballProjectileSpec } from './FireballProjectile';
import { ChromaticFlash } from './ChromaticFlash';
import { ROULETTE_DURATION_MS } from './AceTransformBurst';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { PhaseProgress } from './PhaseProgress';
import { Toaster } from './ui/sonner';
import { ScrollArea } from './ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { getDisplayValue, isNumeralCard, isPlainNumeralCard, isValidAceTransformTarget, getEffectiveCardValue, type Card } from '../lib/cardUtils';
import { isUntransformedAce } from '../lib/fusion';
import { getCharacterTheme } from '../lib/characterThemes';
import { getNumeralSpellInfo } from '../lib/numeralSpells';
import { ZoomContainerContext } from '../lib/zoomContainerContext';
import { getMagicCardInfo, canActivateMagic, type MagicCardType } from '../lib/magicCards';
import { getDragActivationRule } from '../lib/dragActivation';
import { getMonsterEffect } from '../lib/monsterCards';
import type { GameConfig } from '../lib/gameConfig';
import { useSettings } from '../context/SettingsContext';
import { getAnimationDurationScale } from '../lib/settings';
import { soundManager, magicSoundFor, monsterSoundFor, numeralSoundFor } from '../lib/soundManager';
import { motion } from 'motion/react';
import {
  gameReducer,
  createInitialState,
  playerKeyOf,
  opponentKeyOf,
  opponentOf,
  characterOf,
  isSlotProtected,
  getUnbattledHorizontalSlots,
  getUnrevealedFieldSlots,
  getFilledFieldSlots,
  canActivateMonsterEffect,
  canSelectCombatSlot,
  MAX_MONSTER_USES,
  getMagicActivationContext,
  canFormOrReinforceTower,
  isCoringaRawTrapCard,
  getFireballCap,
  canMagicTriggerReactionAnnouncement,
  isBrotoSlot,
  type CharacterId,
  type GameAction,
  type GameState,
  type MagicSelection,
  type PlayerNumber,
} from '../lib/gameEngine';
import { decideAiAction, decideReactionToMagic, decideCoringaQCopyTarget } from '../lib/aiPlayer';
import { simulateSteps, fuzzSteps } from '../lib/simulateGame';
import { enumerateLegalActions, checkActionDivergence } from '../lib/actionSpace';
import { checkInvariants, countAllCards } from '../lib/invariants';
import { setSeed, getSeed, clearSeed } from '../lib/rng';
import { decideHandCardSelection } from '../lib/handSelection';

/**
 * Props do componente GameBoard
 */
interface GameBoardProps {
  onBack: () => void;
  player1Character: CharacterId;
  player2Character: CharacterId;
  gameConfig: GameConfig;
}

/**
 * Overhaul da região Baralho/Cemitério (pedido do usuário) - referência pra
 * converter `deck.length` em "quantas camadas da pilha mostrar" (1 a 5,
 * calculado onde é usado). 54 = baralho Comum completo com Cartas Monstro
 * (o teto mais comum) - um baralho Temático (62-70+, ver generateDeck em
 * cardUtils.ts) só faz a pilha aparentar "cheia" (5 camadas) por mais tempo
 * no início, nunca estoura o teto visual nem quebra o cálculo.
 */
const DECK_STACK_REFERENCE = 54;

const phaseNames = {
  draw: 'Compra',
  strategy: 'Estratégia',
  combat: 'Combate',
};

/** Seleção em andamento no assistente de ativação de magia (estado só de UI) */
interface PendingMagic {
  playerNumber: 1 | 2;
  cardId: string;
  type: MagicCardType;
  character: CharacterId;
  selectedCards?: string[];
  selectedSlot?: number;
  selectedTargetPlayer?: 1 | 2;
  selectedTargetSlot?: number;
  /** Mosqueteiro - Rainha (Rajada Reveladora): ids das cartas do oponente escolhidas para revelar - ver MagicSelection em gameEngine.ts. */
  selectedRevealCardIds?: string[];
  /** Piromante - verdadeiro quando o jogador escolheu, no diálogo, lançar a Bola de Fogo já acumulada em vez do efeito próprio de alimentar (J/Q/K) - ver MagicSelection.fireballLaunch em gameEngine.ts. */
  fireballLaunch?: boolean;
  /** Druida - verdadeiro quando o jogador escolheu, no diálogo, aumentar o Broto em 2 em vez de reduzi-lo pela metade pra criar um marcador - ver MagicSelection.druidaGrowBroto em gameEngine.ts. */
  druidaGrowBroto?: boolean;
}

export function GameBoard({ onBack, player1Character, player2Character, gameConfig }: GameBoardProps) {
  const [gameState, rawDispatch] = useReducer(
    gameReducer,
    undefined,
    () => createInitialState(player1Character, player2Character, gameConfig)
  );
  // Item 5 do plano de melhoria do debug mode (window.__debug.checkInvariants/
  // fuzz) - quantas cartas "reais" esta partida específica começou com
  // (varia com a config: Modo Towers soma cartas extras ao baralho, ver
  // generateDeck em cardUtils.ts). Calculado UMA VEZ (nunca muda durante o
  // jogo - conservação de cartas é sempre contra esse mesmo número do início
  // ao fim, mesmo com Fusão ligada, ver o comentário de countAllCards em
  // invariants.ts) a partir de um estado inicial PRÓPRIO, não do `gameState`
  // ao vivo (senão mudaria a cada render).
  const initialCardTotal = useMemo(
    () => countAllCards(createInitialState(player1Character, player2Character, gameConfig)),
    [player1Character, player2Character, gameConfig]
  );

  const { settings, updateSetting } = useSettings();
  const animScale = getAnimationDurationScale(settings);
  // FIX (checagem extensa por bugs): `animScale || 0.35` tratava o `0`
  // devolvido de propósito por getAnimationDurationScale (settings.ts:
  // "efetivamente instantâneo" quando `settings.animations` está desligado)
  // como um valor "falsy" a ser substituído pelo fallback de 0.35 - ou seja,
  // desligar animações NUNCA deixava nada realmente instantâneo, só caía de
  // volta pra ~35% da duração normal em vez do mínimo de 150ms pretendido. O
  // fallback só deve valer para um valor de verdade ausente/inválido (NaN),
  // nunca para o zero legítimo.
  /** Duração de um popup/pausa em ms, respeitando a preferência de velocidade de animação. */
  const delay = (baseMs: number) => Math.max(150, Math.round(baseMs * (Number.isFinite(animScale) ? animScale : 0.35)));

  // ----- Estado de UI (nada aqui é fonte de verdade do jogo) -----
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ player: 1 | 2; slot: number } | null>(null);
  const [selectedForDiscard, setSelectedForDiscard] = useState<Set<string>>(new Set());
  // Modo Towers (pedido do usuário): seleção múltipla de cartas de mesmo
  // número na mão (Ctrl/Shift+clique - ver handleCardClick em
  // PlayerZone.tsx), separada de `selectedForDiscard` (fase de Compra) já
  // que esta vive na fase de Estratégia. Reaproveita `selectedSlot` (o mesmo
  // usado por Posicionar/Horizontal) para o jogador escolher o slot alvo.
  const [selectedForTower, setSelectedForTower] = useState<Set<string>>(new Set());
  const [showDiscardPile, setShowDiscardPile] = useState(false);
  const [showPhaseTransition, setShowPhaseTransition] = useState(false);
  /**
   * FIX (pedido do usuário: "só permita movimento de cartas ou efeitos após
   * o fim da notificação [de troca de fase], não durante") - o popup de
   * transição (PhaseTransition.tsx) é puramente visual (`pointer-events-none`),
   * então antes disso o jogador (ou a IA) podia jogar cartas/ativar magias
   * livremente por baixo dele durante os ~2s que ficava na tela. Em vez de
   * espalhar essa checagem por cada handler individual (são muitos: jogar
   * carta, ativar magia, Magia Numeral, Fusão, Transformar Ás, Zona Monstro,
   * seleção de combate...), um único ponto de estrangulamento: TODA mutação
   * de estado do jogo passa por `dispatch` (vindo do `useReducer` acima,
   * renomeado para `rawDispatch`), então basta interceptar aqui - cobre
   * automaticamente inclusive as ações da IA (mesmo `dispatch`, ver o
   * `useEffect` de polling da IA mais abaixo).
   */
  const dispatch = (action: GameAction) => {
    if (showPhaseTransition) return;
    rawDispatch(action);
  };
  /**
   * Modo de debug/playtest (pedido do usuário: "debug mode melhor pra você
   * testar as coisas mais rápido, leve tudo em consideração") - expõe o
   * estado ao vivo e formas de mexer nele direto pelo console do navegador,
   * sem precisar clicar/jogar manualmente até alcançar um cenário específico.
   * SÓ em dev (`import.meta.env.DEV`, estaticamente `false` num build de
   * produção - o Vite elimina este bloco inteiro do bundle final, nunca
   * chega a rodar em produção):
   *   window.__debug.state            -> GameState atual (sempre em dia)
   *   window.__debug.dispatch(action) -> despacha qualquer GameAction, MESMO
   *     caminho de uma ação real (respeita o guard de showPhaseTransition acima)
   *   window.__debug.forceState(state) -> substitui o estado INTEIRO na hora
   *     (via a ação 'DEBUG_FORCE_STATE', ver o topo de gameReducer em
   *     gameEngine.ts) - ignora até o guard de transição de fase, pra nunca
   *     ficar preso esperando um popup fechar. Ideal pra montar cenários
   *     exatos (cartas específicas na mão/campo, combate a 1 disputa de
   *     fechar etc.) sem depender de RNG - pegue `window.__debug.state`,
   *     edite os campos que precisar (imutável - construa um objeto novo) e
   *     chame `forceState` com o resultado.
   *   window.__debug.fastForward(maxSteps?, opts?) -> roda até `maxSteps`
   *     (padrão 200, teto de segurança 5000) decisões de IA PURAMENTE em
   *     memória (mesmo laço de scripts/sanity-test.ts/simulateAiVsAiGame,
   *     sem nenhum timer real nem efeito visual no meio do caminho) e só
   *     então aplica o resultado final via forceState de uma vez - pula
   *     turnos inteiros instantaneamente em vez de esperar o `delay()` de
   *     "pensando" de cada ação real. Usa decisão de IA pros DOIS lados,
   *     mesmo fora do Modo Espectador (é uma ferramenta de avançar o estado,
   *     não uma mudança de quem controla o quê). Devolve
   *     `{ steps, stuck, rejectedActions, gameOver }` - `rejectedActions.length
   *     > 0` sinaliza a MESMA situação que scripts/sanity-test.ts detecta (a
   *     IA propôs algo que o motor recusou em silêncio - útil pra achar
   *     regressões sem precisar do CLI). PAUSA a partida ao terminar por
   *     padrão (`opts.stayRunning: true` pra não pausar) - o Modo Espectador
   *     despacha ações reais em TEMPO REAL o tempo todo (ver o polling mais
   *     abaixo), então sem pausar, o resultado calculado aqui ficaria
   *     competindo com esse polling entre uma chamada e outra do console
   *     (2 chamadas de fastForward em sequência levam segundos reais de ida
   *     e volta - tempo de sobra pro polling normal já ter avançado mais
   *     coisa por baixo). Ver pause()/resume() abaixo pra controlar isso
   *     manualmente fora de fastForward também.
   *   window.__debug.pause() / .resume() -> força `paused` pro valor exato
   *     (não é um toggle - mais previsível que despachar TOGGLE_PAUSE às
   *     cegas sem saber o estado atual). Use antes de inspecionar o estado
   *     com calma sem o Modo Espectador mudando as coisas por baixo.
   *   window.__debug.restart() -> reembaralha uma partida NOVA (mesmos
   *     personagens/config desta) instantaneamente, sem passar pelo Menu
   *     Principal/DebugPanel de novo - útil pra tentar reproduzir um bug
   *     não-determinístico repetidas vezes (ver fastForward acima) sem sair
   *     da tela.
   *   window.__debug.setAnimationsEnabled(bool) -> atalho pro mesmo switch
   *     "Animações" de Configurações (settings.ts) - desligado, todo popup/
   *     transição vira efetivamente instantâneo (ver getAnimationDurationScale),
   *     o que também acelera bastante o "pensando..." de cada ação real da
   *     IA (não só o fastForward acima, que já ignora isso by design).
   *   window.__debug.characters -> { player1, player2 } desta partida
   *
   * Itens 1/2/6 do plano de melhoria do debug mode ("prever qualquer ação
   * possível" + reprodutibilidade + fuzzing) - ver src/app/lib/actionSpace.ts,
   * rng.ts, simulateGame.ts pro núcleo de cada um:
   *   window.__debug.enumerateActions(player?) -> lista TODA ação legal
   *     agora pro `player` (padrão 1) - reaproveita os predicados `canX` já
   *     existentes no motor (actionSpace.ts, modo "legal"). Não despacha
   *     nada, só lista.
   *   window.__debug.tryEveryAction(player?) -> roda o modo EXAUSTIVO
   *     (actionSpace.ts) contra uma cópia local do estado ATUAL - despacha
   *     toda ação sintaticamente plausível direto contra `gameReducer`
   *     (NUNCA via rawDispatch/dispatch, então NUNCA muda a partida ao
   *     vivo) e reporta só onde um predicado `canX` discorda do resultado
   *     real. Pode ser lento (potencialmente dezenas de milhares de
   *     chamadas a `gameReducer`) - comando manual de console, nunca chame
   *     isso num loop/useEffect.
   *   window.__debug.checkInvariants() -> roda a checagem de saúde
   *     (conservação de cartas + ids duplicados, invariants.ts) contra o
   *     estado atual. Lista de violações; vazio = saudável.
   *   window.__debug.fuzz(steps?, opts?) -> versão interativa do fuzzer
   *     (fuzzSteps, simulateGame.ts) - substitui a escolha da IA heurística
   *     por uma ação aleatória `opts.substituteProbability` (padrão 0.15)
   *     das vezes, verificando invariantes a cada passo. Para na primeira
   *     violação encontrada (devolve `violation` preenchido) ou depois de
   *     `steps` passos (padrão 200). Aplica o resultado e PAUSA, mesmo
   *     padrão de `fastForward`. Pra reproduzir uma falha achada aqui,
   *     anote `getSeed()` ANTES de chamar e use `setSeed` de novo com o
   *     mesmo número.
   *   window.__debug.setSeed(n) / getSeed() -> troca/lê a semente do RNG
   *     (rng.ts) - a MESMA semente reproduz a MESMA sequência de decisões
   *     aleatórias (incluindo a moeda de substituição do fuzz acima) daqui
   *     em diante. `clearSeed()` volta pro `Math.random()` cru normal.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const fastForward = (maxSteps = 200, options?: { stayRunning?: boolean }) => {
      // Laço de simulação em si vive em simulateGame.ts agora (item 3 do
      // plano de melhoria do debug mode) - compartilhado com
      // scripts/sanity-test.ts, pra uma correção nele valer pros dois
      // lugares automaticamente. Esta função só aplica o resultado (via
      // forceState + pausa), que é específico desta UI.
      const { state, steps, stuck, rejectedActions } = simulateSteps(gameState, { maxSteps });

      // FIX (corrida real encontrada testando isto ao vivo): o Modo
      // Espectador despacha ações de IA em TEMPO REAL (timers de "pensando",
      // ver o useEffect de polling logo abaixo) o tempo todo, mesmo enquanto
      // uma chamada a fastForward está em andamento no console - cada
      // chamada via javascript_tool leva segundos reais de ida e volta, e
      // nesse intervalo o polling normal continua rodando por baixo,
      // competindo com o resultado que acabamos de calcular aqui. Por
      // padrão, fastForward agora PAUSA a partida ao terminar (o polling já
      // respeita `gameState.paused`, ver o guard logo no início daquele
      // useEffect) - assim o estado fica parado, exatamente como calculado,
      // até uma chamada explícita a resume()/fastForward de novo. Passe
      // `{ stayRunning: true }` pra manter a partida rodando em tempo real
      // depois do salto (ex.: só quis pular o início do jogo e agora quer
      // assistir o resto acontecer sozinho).
      rawDispatch({ type: 'DEBUG_FORCE_STATE', state: options?.stayRunning ? state : { ...state, paused: true } });
      return { steps, stuck, rejectedActions, gameOver: state.gameOver };
    };

    const fuzz = (steps = 200, options?: { substituteProbability?: number; stayRunning?: boolean }) => {
      const result = fuzzSteps(gameState, {
        maxSteps: steps,
        substituteProbability: options?.substituteProbability,
        expectedCardTotal: initialCardTotal,
      });
      rawDispatch({ type: 'DEBUG_FORCE_STATE', state: options?.stayRunning ? result.state : { ...result.state, paused: true } });
      return { steps: result.steps, stuck: result.stuck, rejectedActions: result.rejectedActions, violation: result.violation, gameOver: result.state.gameOver };
    };

    (window as unknown as { __debug: unknown }).__debug = {
      state: gameState,
      dispatch,
      forceState: (state: GameState) => rawDispatch({ type: 'DEBUG_FORCE_STATE', state }),
      fastForward,
      // Pausa/retoma DIRETO pro valor pedido (não um toggle - mais previsível
      // que despachar TOGGLE_PAUSE às cegas do console sem saber o estado atual).
      pause: () => rawDispatch({ type: 'DEBUG_FORCE_STATE', state: { ...gameState, paused: true } }),
      resume: () => rawDispatch({ type: 'DEBUG_FORCE_STATE', state: { ...gameState, paused: false } }),
      restart: () => rawDispatch({ type: 'DEBUG_FORCE_STATE', state: createInitialState(player1Character, player2Character, gameConfig) }),
      setAnimationsEnabled: (enabled: boolean) => updateSetting('animations', enabled),
      // Itens 1/2/6 do plano de melhoria do debug mode - ver o comentário
      // completo acima desta função pra cada um.
      enumerateActions: (player: PlayerNumber = 1) => enumerateLegalActions(gameState, player),
      tryEveryAction: (player: PlayerNumber = 1) => checkActionDivergence(gameState, player),
      checkInvariants: () => checkInvariants(gameState, initialCardTotal),
      fuzz,
      setSeed,
      getSeed,
      clearSeed,
      characters: { player1: player1Character, player2: player2Character },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);
  const [showCombatResult, setShowCombatResult] = useState(false);
  /**
   * FIX (pedido do usuário: "remova todas alterações anteriores visuais das
   * disputas... só o número da carta selecionada aparecendo no meio do
   * campo") - reverte o overhaul anterior (cartas flutuando, disparando uma
   * na outra e colidindo no centro - CombatClashOverlay.tsx, removido).
   * Preenchido assim que `combatResolution` chega (ver useEffect de combate
   * abaixo) com os 2 valores já revelados, e limpo assim que o popup de
   * resultado (CombatResult.tsx) assume a cena - ver CombatValueReveal.tsx.
   */
  const [combatValueReveal, setCombatValueReveal] = useState<CombatValueRevealSpec | null>(null);
  /** FIX (pedido do usuário, item 4): true por ~0.5s quando uma disputa de combate é fechada (o perdedor perde 1 vida) - sacode a tela inteira (ver .animate-screen-shake em globals.css). */
  const [screenShake, setScreenShake] = useState(false);
  /** FIX (pedido do usuário: "desligar flashes de tela cheia" separado do Tremor de Tela) - antes ChromaticFlash usava o MESMO `screenShake` acima; agora tem seu próprio estado/gatilho, controlado por `settings.screenFlashEnabled` independente de `settings.screenShakeEnabled`. */
  const [screenFlash, setScreenFlash] = useState(false);
  /**
   * FIX (pedido do usuário: "atalho de Configurações direto no topo... um
   * ícone de engrenagem ao lado do pause abriria direto, sem passar pelo
   * 'Jogo Pausado'") - o mesmo Dialog de Pausa (mais abaixo) agora abre por
   * DOIS motivos independentes: `gameState.paused` (pausa de verdade,
   * bloqueia a partida) OU este estado local (só mostra os ajustes
   * rápidos, com a partida continuando rodando por trás). O conteúdo dos
   * ajustes é idêntico nos dois casos - só o cabeçalho/rodapé do Dialog
   * mudam (ver `open`/JSX do Dialog de Pausa).
   */
  const [showQuickSettings, setShowQuickSettings] = useState(false);
  /** FIX (pedido do usuário, item 10): jogador (1 ou 2) que acabou de fechar uma disputa (vencer 2 combates seguidos) - dispara um brilho extra na zona dele por alguns segundos (ver PlayerZone.tsx). */
  const [victoryGlowPlayer, setVictoryGlowPlayer] = useState<1 | 2 | null>(null);
  const [showVictory, setShowVictory] = useState(false);
  const [showRematchDialog, setShowRematchDialog] = useState(false);
  const [showNumeralSpellPopup, setShowNumeralSpellPopup] = useState(false);
  const [pendingMagic, setPendingMagic] = useState<PendingMagic | null>(null);
  const [pendingAceTransform, setPendingAceTransform] = useState<{ playerNumber: 1 | 2; aceCardId: string } | null>(null);
  // FIX (itens 4 e 7 da 3ª rodada): `targetSlotIndex` agora é o slot de
  // COMBATE (0-2) escolhido como alvo do efeito do Mago (Ilusão Arcana) -
  // antes `slotIndex` era o slot onde o próprio Coringa estava posicionado
  // (arquitetura antiga). Ver handleFieldSlotClick, que agora preenche isto
  // quando `pendingMonsterTarget` está ativo.
  const [pendingMonsterEffect, setPendingMonsterEffect] = useState<{ playerNumber: 1 | 2; targetSlotIndex: number } | null>(null);
  /**
   * FIX (itens 4 e 7): jogador clicou na própria zona do Monstro (já
   * posicionado, ainda não usado neste turno) e está escolhendo qual dos 3
   * slots de combate será o alvo do efeito - Besta/Anjo ativam direto ao
   * clicar num slot; Mago abre `pendingMonsterEffect` (precisa também da
   * carta-fonte). Ver handleMonsterZoneClick / handleFieldSlotClick.
   */
  const [pendingMonsterTarget, setPendingMonsterTarget] = useState<{ playerNumber: 1 | 2 } | null>(null);
  /**
   * FIX (pedido do usuário): a Fúria Selvagem da Besta agora dobra uma carta
   * ESPECÍFICA do slot escolhido (a principal ou uma horizontal), não mais
   * "a soma das horizontais do slot inteiro". Quando o slot escolhido em
   * `pendingMonsterTarget` tem mais de 1 carta (principal + horizontal(is)),
   * este estado abre um pequeno diálogo para escolher qual delas dobrar - se
   * o slot só tiver 1 carta, não há ambiguidade e o efeito ativa direto sem
   * precisar deste passo extra (ver handleFieldSlotClick).
   */
  const [pendingBestaMonsterTarget, setPendingBestaMonsterTarget] = useState<{ playerNumber: 1 | 2; targetSlotIndex: number } | null>(null);
  /**
   * Coringa (redesenho completo, pedido do usuário) - Rainha armadilha
   * revelada em Combate: "seu valor se torna o mesmo de uma carta revelada
   * do oponente (o jogador escolhe no momento que é revelada)". Quando
   * ambos os slots de combate já foram selecionados e um deles contém uma
   * Rainha armadilha (ver isCoringaRawTrapCard, gameEngine.ts), a resolução
   * PAUSA aqui - abre um diálogo pra escolher a carta-alvo antes de
   * despachar RESOLVE_COMBAT (que carrega a escolha junto, via
   * `coringaQCopyTargetId`) - ver o useEffect que detecta os dois slots
   * selecionados, mais abaixo.
   */
  const [pendingCoringaQChoice, setPendingCoringaQChoice] = useState<{ qOwner: 1 | 2 } | null>(null);

  // FIX (item 5 da 4ª rodada): "os efeitos de magia deviam ter efeitos
  // visuais no campo e na mão (caso sejam os alvos)". Estado efêmero (dura
  // ~1s, ver EFFECT_FLASH_DURATION_MS abaixo) só para acionar o burst visual
  // (ver MagicEffectBurst.tsx) exatamente sobre o(s) alvo(s) de uma magia ou
  // do efeito do Monstro - preenchido no momento do dispatch, quando o(s)
  // alvo(s) já são conhecidos (vêm da própria seleção feita no diálogo).
  const [effectFlashSlots, setEffectFlashSlots] = useState<Array<{ player: 1 | 2; slotIndex: number }>>([]);
  const [effectFlashCardIds, setEffectFlashCardIds] = useState<string[]>([]);
  // FIX (pedido do usuário: "mais efeitos visuais nas magias dos 3
  // personagens... especialmente efeitos que alteram cartas do oponente,
  // mostrando uma referência ou notificação visual de seus atos") - dois
  // estados novos, preenchidos SEMPRE junto com effectFlashSlots/CardIds (ou
  // com selfEffectFlashPlayer, ver flashSelfEffect abaixo):
  // `activeMagicCaster` é o personagem de QUEM ATIVOU a magia (não de quem
  // é dono do alvo!) - CharacterMagicBurst.tsx usa isso para colorir/formar
  // o efeito com a identidade de quem agiu, mesmo quando o alvo é um slot ou
  // carta do OPONENTE. `activeMagicLabel` é o nome por extenso da magia (via
  // getMagicCardInfo/getMonsterEffect), mostrado por MagicCalloutLabel.tsx
  // bem em cima do alvo, para não depender só do log de texto para saber "o
  // que" aconteceu.
  const [activeMagicCaster, setActiveMagicCaster] = useState<CharacterId | null>(null);
  const [activeMagicLabel, setActiveMagicLabel] = useState<string | null>(null);
  /**
   * FIX (pedido do usuário: "adicione um efeito de speedlines no fundo...
   * com as cores do personagem que ativou uma magia da vez, faça durar 5
   * segundos até outro jogador usar outra magia") - `activeMagicCaster`
   * acima já existe, mas some rápido (~1.8s, EFFECT_FLASH_DURATION_MS) -
   * curto demais pro efeito de fundo pedido. Este é um estado PRÓPRIO, mais
   * "grudento": guarda o personagem de QUALQUER ativação de magia (ver o
   * useEffect logo abaixo, que observa `activeMagicCaster`) por 5s inteiros,
   * e o timer REINICIA (não soma) a cada nova ativação dentro desses 5s -
   * assim o efeito sempre reflete a magia mais recente, "renovando" o tempo
   * em vez de precisar esperar acabar.
   */
  const [speedlinesCharacter, setSpeedlinesCharacter] = useState<CharacterId | null>(null);
  /**
   * FIX (pedido do usuário: "deixe o aviso para reação muito mais notável e
   * impactante... você não adicionou os efeitos de speedlines" - o efeito
   * JÁ existia, reaproveitado do ambiente de magia acima, mas essa versão
   * "ambiente" é sutil de propósito (opacidade baixa, atrás de tudo). Uma
   * janela de reação precisa de MUITO mais impacto - `intense` liga uma
   * versão bem mais forte/pulsante em SpeedlinesBackground.tsx só pra esse
   * caso, sem afetar a versão discreta usada em toda ativação de magia comum.
   */
  const [speedlinesIntense, setSpeedlinesIntense] = useState(false);
  const speedlinesTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (!activeMagicCaster) return;
    setSpeedlinesCharacter(activeMagicCaster);
    setSpeedlinesIntense(false);
    if (speedlinesTimeoutRef.current) clearTimeout(speedlinesTimeoutRef.current);
    speedlinesTimeoutRef.current = setTimeout(() => setSpeedlinesCharacter(null), delay(5000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMagicCaster]);
  /** FIX (pedido do usuário): id da carta Ás (na mão) que acabou de ser transformada - dispara AceTransformBurst.tsx nela, ver executeAceTransform. */
  const [aceTransformFlashCardId, setAceTransformFlashCardId] = useState<string | null>(null);
  /** FIX (pedido do usuário, item 5): slot que acabou de ser destruído pela Destruição de Reforço do Mago - dispara CardShatterBurst.tsx nele, ver executeMagicEffect. */
  const [shatteringSlot, setShatteringSlot] = useState<{ player: 1 | 2; slotIndex: number } | null>(null);
  /** Coringa (redesenho completo, "armadilhas"): slot que acabou de ter um Valete/Rei armadilha reagindo (dissipando em fumaça) - dispara CoringaSmokeBurst.tsx nele. Ver o useEffect de log logo abaixo (Estratégia) e o de combatResolution (Combate). */
  const [smokingSlot, setSmokingSlot] = useState<{ player: 1 | 2; slotIndex: number } | null>(null);
  /** Piromante (personagem novo, pedido explícito do usuário: "carta pegando fogo e se despedaçando") - slot(s) do oponente que acabaram de ser atingidos por um lançamento da Bola de Fogo - dispara FireShatterBurst.tsx neles. Ver applyMagicEffectPresentation. */
  const [burningSlots, setBurningSlots] = useState<Array<{ player: 1 | 2; slotIndex: number }>>([]);
  // FIX (item 8 da 6ª rodada): esticado de 1000ms para 1300ms junto com a
  // duração da própria animação em MagicEffectBurst.tsx (0.9s → 1.1s) - sem
  // isso, o estado `active` seria desligado ANTES do burst terminar de
  // animar, cortando a animação pela metade. FIX (pedido do usuário -
  // "efeitos ainda mais exagerados"): esticado de novo, 1300 → 1800ms,
  // depois que ArenaMagicBurst.tsx ganhou motivos em escala de tela cheia
  // (itens 4 e 6) com animações internas mais longas (até ~1.8s) - com
  // 1300ms elas eram cortadas no meio antes de terminar de se expandir.
  const EFFECT_FLASH_DURATION_MS = 1800;
  // FIX (encontrado investigando o relato de travamento nas magias): quando
  // duas ativações aconteciam dentro da mesma janela de ~1.8s (ex.: a IA
  // agindo rápido em sequência, ou dois cliques próximos), o `setTimeout` de
  // limpeza da ativação MAIS ANTIGA disparava DEPOIS que a ativação NOVA já
  // tinha sobrescrito `activeMagicCaster`/`activeMagicLabel` - e limpava
  // incondicionalmente para `null`, cortando a exibição da ativação nova no
  // meio (não causava o travamento em si, mas fazia efeitos "sumirem" cedo
  // demais de forma inconsistente). Um contador incrementado a cada chamada
  // garante que só a limpeza da ativação MAIS RECENTE realmente executa.
  const flashCallIdRef = useRef(0);
  const flashEffectTargets = (
    targets: { slots?: Array<{ player: 1 | 2; slotIndex: number }>; cardIds?: string[] },
    caster?: CharacterId,
    label?: string
  ) => {
    const callId = ++flashCallIdRef.current;
    if (targets.slots?.length) setEffectFlashSlots(targets.slots);
    if (targets.cardIds?.length) setEffectFlashCardIds(targets.cardIds);
    if (caster) setActiveMagicCaster(caster);
    if (label) setActiveMagicLabel(label);
    setTimeout(() => {
      if (flashCallIdRef.current !== callId) return; // uma ativação mais nova já assumiu - não interrompe ela
      if (targets.slots?.length) setEffectFlashSlots([]);
      if (targets.cardIds?.length) setEffectFlashCardIds([]);
      if (caster) setActiveMagicCaster(null);
      if (label) setActiveMagicLabel(null);
    }, delay(EFFECT_FLASH_DURATION_MS));
  };

  // FIX (item 3 da 6ª rodada): "caso o jogador tente colocar uma carta de
  // número no campo do monstro, faça a carta tremer e piscar em vermelho e
  // traga ela de volta para a mão". O reducer (handlePlaceMonsterCard em
  // gameEngine.ts) já rejeitava a tentativa em silêncio (a carta nunca saía
  // da mão de fato) - faltava só o feedback visual da rejeição. Mesmo padrão
  // efêmero de effectFlashCardIds acima, mas com sua própria duração (mais
  // curta, para o tremor não ficar "arrastado") e cor/animação de erro em
  // vez de efeito mágico - ver CardRejectFlash.tsx.
  const [rejectedCardIds, setRejectedCardIds] = useState<string[]>([]);
  const CARD_REJECT_FLASH_DURATION_MS = 500;
  const flashRejectedCard = (cardId: string) => {
    setRejectedCardIds([cardId]);
    setTimeout(() => setRejectedCardIds([]), delay(CARD_REJECT_FLASH_DURATION_MS));
  };

  // FIX (item 8 da 6ª rodada): Bênção Divina e Reforço Angelical do Anjo (J e
  // K) ativam sem diálogo (não exigem escolher nenhuma carta/slot alvo - ver
  // handleActivateMagicClick abaixo), então não existe nenhum id de
  // carta/slot conhecido de antemão para acionar o MagicEffectBurst normal
  // (effectFlashCardIds/effectFlashSlots). Em vez disso, um burst genérico
  // "algo aconteceu com este jogador" no ícone/retrato do próprio jogador
  // (ver PlayerZone.tsx) - continua deixando claro que a magia teve efeito,
  // sem precisar simular/adivinhar quais cartas especificamente mudaram.
  const [selfEffectFlashPlayer, setSelfEffectFlashPlayer] = useState<1 | 2 | null>(null);
  const flashSelfEffect = (playerNumber: 1 | 2, caster?: CharacterId, label?: string) => {
    const callId = ++flashCallIdRef.current;
    setSelfEffectFlashPlayer(playerNumber);
    if (caster) setActiveMagicCaster(caster);
    if (label) setActiveMagicLabel(label);
    setTimeout(() => {
      setSelfEffectFlashPlayer((prev) => (prev === playerNumber ? null : prev));
      if (flashCallIdRef.current !== callId) return; // uma ativação mais nova já assumiu - não interrompe ela
      if (caster) setActiveMagicCaster(null);
      if (label) setActiveMagicLabel(null);
    }, delay(EFFECT_FLASH_DURATION_MS));
  };

  /**
   * Coringa (redesenho completo, "armadilhas") - dispara CoringaSmokeBurst.tsx
   * num slot específico ("se dissipando em fumaça", pedido do usuário) -
   * mesmo padrão de `setShatteringSlot` (ver applyMagicEffectPresentation),
   * só que chamado de 2 lugares diferentes (o useEffect de log abaixo, pra
   * revelação na Estratégia, e o useEffect de combatResolution, pro Rei
   * explodindo em Combate), então vira uma função nomeada em vez de código
   * duplicado inline nos dois.
   */
  const triggerSmokeBurst = (target: { player: 1 | 2; slotIndex: number }) => {
    setSmokingSlot(target);
    setTimeout(() => setSmokingSlot((prev) => (prev === target ? null : prev)), delay(EFFECT_FLASH_DURATION_MS));
  };

  const p1Theme = getCharacterTheme(player1Character);
  const p2Theme = getCharacterTheme(player2Character);

  /**
   * Quais jogadores são controlados pela IA: nenhum no Hotseat, só o Jogador
   * 2 em "Contra a IA" (ver CharacterSelection.tsx, que já rotula a etapa 2
   * como "Escolha o Personagem da IA" quando gameConfig.mode === 'vsAI'), e
   * os DOIS no Modo Espectador (pedido do usuário: "modo espectador abaixo
   * do vs IA que é apenas IA vs IA") - array vazio fora desses modos, todo o
   * código de IA abaixo simplesmente não roda.
   *
   * `useMemo` com `gameConfig.mode` como única dependência (ele nunca muda
   * durante uma partida em andamento, só é definido na tela de configuração
   * antes do jogo começar) - importante porque este array entra na
   * dependência de useEffects abaixo (o de decisão da IA); um array literal
   * NOVO a cada render (sem useMemo) teria referência diferente toda vez,
   * fazendo esses efeitos rodarem de novo em TODO render por engano - mesma
   * classe de bug já documentada e corrigida noutros pontos deste arquivo.
   */
  const aiPlayers = useMemo<PlayerNumber[]>(() => {
    if (gameConfig.mode === 'vsAI') return [2];
    if (gameConfig.mode === 'spectator') return [1, 2];
    return [];
  }, [gameConfig.mode]);
  const isAi = (player: PlayerNumber) => aiPlayers.includes(player);

  // ----- Efeitos: traduzem transições de estado do motor em popups/timers -----

  // FIX (pedido do usuário: "quando o jogo inicia, ele não inicia com o
  // anuncio do inicio da fase... eu gostaria que corrigisse isso") - `turn
  // === 1 && phase === 'draw'` identifica tanto o mount real de uma partida
  // nova quanto uma REVANCHE (REMATCH zera `turn` de volta pra 1 - ver
  // createInitialState em gameEngine.ts), sem precisar de nenhum estado
  // dedicado só pra isso. Usado tanto pelo efeito abaixo (duração do popup)
  // quanto pelo JSX mais adiante (mãos escondidas + lista de modos ativos).
  const isGameStart = gameState.turn === 1 && gameState.phase === 'draw';

  // FIX (pedido do usuário, item 2.1: "deveria mostrar uma mensagem
  // mostrando quais modos de jogo estão ativos") - mesmos rótulos já usados
  // na tela de configuração (GameConfig.tsx), pra não inventar nomenclatura
  // nova. Spotlight fica de fora daqui de propósito - ele já ganha a própria
  // cutscene de roleta no mesmo popup (ver PhaseTransition.tsx), listar de
  // novo aqui duplicaria a informação. `discardLimit` também fica de fora -
  // não é um modo liga/desliga, é sempre ativo (só o número é ajustável).
  const activeModes: string[] = [
    ...(gameConfig.monsterCards ? ['Cartas Monstro'] : []),
    ...(gameConfig.fusion ? [`Fusão (até ${gameConfig.fusionLimit}x/turno)`] : []),
    ...(gameConfig.towersMode ? ['Towers'] : []),
    ...(gameConfig.reactionsMode ? [`Reações (até ${gameConfig.reactionsLimit}x/fase)`] : []),
    ...(gameConfig.drawLimitEnabled ? [`Limite de compra (${gameConfig.drawLimit}/turno)`] : []),
  ];

  // Transição de fase (popup "FASE DE X"), acompanha qualquer mudança de fase
  // (inclusive quando uma disputa fecha o turno ou uma Magia Numeral pula o combate).
  //
  // FIX (pedido do usuário): antes um guard `hasMounted` pulava de propósito
  // a primeira execução deste efeito, então o INÍCIO da partida (turno 1,
  // Fase de Compra) nunca disparava o popup - o jogo "simplesmente começava"
  // sem anúncio nenhum, nem a cutscene do Spotlight quando o modo está
  // ativo. Removido: nada mais dependia desse guard (uma REVANCHE já
  // disparava este efeito normalmente, via mudança real de fase - ela não
  // remonta o componente).
  useEffect(() => {
    setShowPhaseTransition(true);
    soundManager.play('phase-change');
    // FIX (pedido do usuário: "deixe a notificação de troca de fase mais
    // rápida") - de 2000ms para 900ms; ainda dá tempo de ler "FASE DE X",
    // mas sem travar o jogo (ver `dispatch` acima) por tanto tempo a cada
    // transição.
    //
    // Modo Spotlight (pedido do usuário: "devia ter uma 'cutscene' do
    // número rodando como um caça niquels") - só na entrada na Fase de
    // Compra com o modo ativo, o popup fica aberto mais tempo pra caber a
    // roleta inteira (ver getSpotlightCutsceneDurationMs/PhaseTransition.tsx);
    // qualquer outra transição de fase continua no mesmo 900ms de sempre.
    const spotlightNumberCount = gameState.phase === 'draw' ? gameState.spotlight?.numbers.length ?? 0 : 0;
    const basePopupDurationMs = Math.max(900, getSpotlightCutsceneDurationMs(spotlightNumberCount));
    // FIX (pedido do usuário, item 2/2.1): o anúncio de início precisa de
    // mais tempo na tela - além de "FASE DE COMPRA", agora também mostra a
    // lista de modos ativos e as mãos enchendo (ver JSX abaixo), e 900ms não
    // é suficiente pra ler tudo isso.
    const popupDurationMs = isGameStart ? Math.max(2200, basePopupDurationMs) : basePopupDurationMs;
    const t = setTimeout(() => setShowPhaseTransition(false), delay(popupDurationMs));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.phase]);

  // FIX (item 1 da 2ª rodada de correções): "não estou notando quando uma
  // magia é usada" - além do prefixo "✨" e nome oficial já adicionados ao
  // log (ver gameEngine.ts:appendLog), toda ativação de magia (própria ou da
  // IA/oponente) agora também dispara uma notificação (toast) na região do
  // topo da tela. Observa o LOG em vez de interceptar cada dispatch
  // individualmente, para pegar magias ativadas por qualquer jogador (humano
  // ou IA) de um único lugar, sem duplicar lógica em cada handler de clique.
  // FIX (item 8 da 2ª rodada): a Magia Numeral (🌟 no log) usa o mesmo
  // problema de visibilidade do item 1 - a mesma notificação avisa quando
  // ela é ativada por qualquer jogador.
  // FIX (item 2 da 4ª rodada): a habilidade da carta Monstro (🃏 no log,
  // ver gameEngine.ts) agora recebe a mesma notificação (toast) que as
  // magias (✨) e a Magia Numeral (🌟) já tinham - antes só essas duas eram
  // reconhecidas aqui, então ativar o efeito do Monstro nunca disparava nada
  // na região do topo da interface.
  // FIX (reformulação do log): antes o toast era disparado inspecionando
  // emoji/texto dentro do HTML cru da mensagem (`entry.html.includes('✨')`
  // etc.) - agora que o log é dado estruturado (ver gameEngine.ts), o
  // gatilho usa `entry.type` diretamente. A ativação da Magia Numeral (que
  // antes exigia checar o texto "ativou Magia Numeral" pra não disparar em
  // QUALQUER entrada 'numeral-spell', como "efeito terminou") agora é
  // identificada por um marcador estrutural (`cardValue` presente só nessa
  // entrada específica - ver comentário em handleActivateNumeralSpell).
  // BUG REAL ENCONTRADO (nunca reportado pelo usuário como tal, descoberto
  // investigando "o som do Coringa não ativa"): `appendLog` (gameEngine.ts)
  // corta o log em 30 entradas (`.slice(-30)`) - depois que uma partida passa
  // disso (rápido, poucos turnos), `gameState.log.length` PARA DE CRESCER
  // (entradas antigas saem, novas entram, tamanho fica travado em 30). Contra
  // esse teto, `gameState.log.length > prevLength` vira `30 > 30 = false`
  // PARA SEMPRE - o toast + TODOS os sons desta seção (qualquer magia, efeito
  // de Monstro, ativação de Magia Numeral, de QUALQUER personagem, não só o
  // Coringa) silenciosamente param de disparar assim que o teto é atingido,
  // sem nenhum erro no console. Corrigido comparando por `entry.id`
  // (monotonicamente crescente, `nextId = último id + 1`, imune ao corte por
  // tamanho - ver appendLog) em vez do tamanho do array.
  const lastSeenLogIdRef = useRef(gameState.log.length > 0 ? gameState.log[gameState.log.length - 1].id : -1);
  useEffect(() => {
    const lastSeenId = lastSeenLogIdRef.current;
    const newEntries = gameState.log.filter((e) => e.id > lastSeenId);
    lastSeenLogIdRef.current = gameState.log.length > 0 ? gameState.log[gameState.log.length - 1].id : lastSeenId;
    for (const entry of newEntries) {
      // Coringa (redesenho completo, "armadilhas") - J/Q/K/Monstro nunca
      // passam por applyMagicEffectPresentation/triggerAiActionEffects
      // (só cobrem quem DESPACHA a ação, e uma armadilha reage como efeito
      // COLATERAL da magia do OPONENTE, ou da resolução de combate - ver
      // applyCoringaTrapReaction/resolveCoringaFieldTraps/coringaKForcedTie
      // em gameEngine.ts) - sem som nenhum próprio nesses instantes. Como o
      // motor (reducer puro, sem efeitos colaterais) já sinaliza cada
      // reação com uma entrada de log de texto distintivo, este é o único
      // lugar que cobre TODOS os pontos de disparo (Visão Celestial do
      // Anjo, Rajada Reveladora do Mosqueteiro, Rei forçando empate em
      // Combate, Rainha copiando valor em Combate) sem duplicar a checagem
      // em cada dispatch. Same-signal reuse do diff de log já existente
      // acima para o toast - não precisa de outro useEffect.
      if (entry.type === 'magic' && entry.text.includes('Valete armadilha')) {
        soundManager.play(magicSoundFor('coringa', 'J'));
        if (entry.player && entry.slotIndex !== undefined) triggerSmokeBurst({ player: entry.player, slotIndex: entry.slotIndex });
      } else if (entry.type === 'magic' && entry.text.includes('Rainha armadilha')) {
        soundManager.play(magicSoundFor('coringa', 'Q'));
      } else if (entry.type === 'magic' && entry.text.includes('Rei armadilha')) {
        soundManager.play(magicSoundFor('coringa', 'K'));
        // FIX: só a revelação na ESTRATÉGIA (applyCoringaTrapReaction) grava
        // `slotIndex` no log - a explosão em COMBATE (coringaKForcedTie) não
        // precisa disso aqui, o useEffect de combatResolution abaixo já
        // dispara o burst usando p1SlotIndex/p2SlotIndex diretamente.
        if (entry.player && entry.slotIndex !== undefined) triggerSmokeBurst({ player: entry.player, slotIndex: entry.slotIndex });
      } else if (entry.type === 'magic' && entry.text.startsWith('O Monstro') && entry.text.includes('voltou oculto')) {
        soundManager.play(monsterSoundFor('coringa'));
      }

      const isNumeralSpellActivation = entry.type === 'numeral-spell' && entry.cardValue !== undefined;
      // FIX (pedido do usuário: "o valete do coringa pode ser posicionado
      // como horizontal... mesmo se o jogador já tiver posto uma ou mais
      // horizontais" - investigado a fundo, testando o motor diretamente:
      // o limite de 1 carta horizontal por turno JÁ era respeitado
      // corretamente para qualquer personagem, Coringa incluído - o
      // `PLAY_CARD` era REJEITADO de verdade (nenhuma mudança de estado).
      // O bug real era de FEEDBACK: entradas de log 'warning' (é aqui que
      // handlePlayCard registra a rejeição, ver gameEngine.ts) nunca
      // entravam em `shouldToast`, e handlePlayCard (GameBoard.tsx) toca o
      // som de "carta posicionada" incondicionalmente, sem checar se o
      // dispatch teve algum efeito de verdade - então uma jogada rejeitada
      // soava IGUAL a uma aceita, sem nenhum aviso visual, e a carta só
      // "sumia e voltava" pra mão sem explicação. Difícil de distinguir de
      // "o jogo deixou eu fazer isso e desfez sozinho depois". Adicionado
      // aqui pra qualquer rejeição (limite de horizontais, carta mágica
      // errada, etc.) também aparecer como um toast, agora bem visível.
      const isWarning = entry.type === 'warning';
      // FIX (pedido do usuário: "não é pra notificar quando o coringa
      // transforma suas cartas em outros valores através da magia numeral")
      // - handleTransformCoringaMagicCard (gameEngine.ts) registra cada
      // transformação individual (Mão de Ferro) com `type: 'magic'` - sem
      // esta exclusão, `entry.type === 'magic'` abaixo faria cada uma
      // aparecer como toast, igual a uma ativação de magia de verdade.
      // Texto único desta ação específica ("transformou X em uma carta de
      // número Y") - nenhuma outra entrada 'magic' do jogo usa essa frase,
      // então a exclusão não afeta nenhum outro personagem/efeito.
      const isCoringaCardTransform = entry.type === 'magic' && entry.text.includes('transformou') && entry.text.includes('em uma carta de número');
      const shouldToast = (entry.type === 'magic' || entry.type === 'monster' || isNumeralSpellActivation || isWarning) && !isCoringaCardTransform;
      if (!shouldToast) continue;
      const icon = getLogIcon(entry);
      const effectInfo = getLogEffectInfo(entry, (p) => (p === 1 ? player1Character : player2Character));
      const plainText = effectInfo ? `${effectInfo.name}: ${entry.text}` : entry.text;
      // FIX (pedido do usuário: "a notificação de uma habilidade... faça ser
      // mais chamativa visualmente") - cor do próprio jogador que agiu (a
      // mesma identidade visual usada em toda a interface) - MagicToast.tsx
      // troca o `toast(texto)` padrão (pequeno, sem cor) por um cartão bem
      // maior com essa cor, glow e entrada animada. Avisos de rejeição não
      // têm um `entry.player` confiável (a maioria dos `appendLog(...,
      // 'warning', ...)` não passa esse metadado) e, mesmo quando tem,
      // colorir como se fosse a cor do personagem passaria a falsa
      // impressão de sucesso - usa sempre um vermelho de alerta fixo (mesmo
      // tom de "perigo" já usado em CardShatterBurst.tsx).
      const color = isWarning ? '#D45D4A' : entry.player === 2 ? p2Theme.primary : p1Theme.primary;
      toast.custom(() => <MagicToast icon={icon} text={plainText} color={color} />, { duration: 4000 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.log]);

  // FIX (pedido do usuário: "quando uma carta fosse movida para o descarte,
  // pós combate ou pós utilização de algum efeito, uma animação visual dela
  // indo girando até o descarte") - existem mais de 15 pontos diferentes no
  // motor que podem mandar uma carta para o descarte (combate, descarte
  // manual, várias magias distintas - ver pushToDiscard em gameEngine.ts)
  // - em vez de instrumentar cada um deles individualmente, este sistema
  // observa a MUDANÇA no próprio estado (gameState.discardPile crescendo,
  // mesmo padrão já usado pelo toast de magia acima) e reconstrói o trajeto:
  //
  // 1) `cardPositionsRef` guarda a ÚLTIMA posição na tela conhecida de cada
  //    carta ainda visível (campo, mão, zona própria) - atualizado a cada
  //    render via os atributos `data-card-id` que essas cartas já carregam
  //    (ver FieldSlotView.tsx/HandCardView.tsx/MonsterZone.tsx). Nunca REMOVE
  //    uma entrada, só atualiza as que ainda existem - por isso, no exato
  //    render em que uma carta desaparece de onde estava, a posição salva
  //    aqui continua sendo a última posição real dela, pronta para servir de
  //    ponto de partida.
  // 2) Quando uma carta nova aparece em `discardPile`, essa última posição
  //    conhecida vira o ponto de partida de um FlyingDiscardCard.tsx, que
  //    anima girando até a posição real do painel "Pilha de Descarte"
  //    (`discardPileRef`).
  const cardPositionsRef = useRef(new Map<string, DOMRect>());
  const discardPileRef = useRef<HTMLDivElement>(null);
  const [flyingDiscards, setFlyingDiscards] = useState<FlyingDiscardSpec[]>([]);

  // ---------------------------------------------------------------------
  // Modo Reações (pedido do usuário) - ver gameEngine.ts (pendingReaction/
  // handleReactToMagic/handleResolvePendingReaction) para a mecânica
  // completa. Aqui só a coreografia visual + o timer real de 3s.
  // ---------------------------------------------------------------------
  /** Contagem cosmética (3, 2, 1) mostrada em ReactionAlertBanner.tsx - a resolução de verdade é o timer único abaixo, independente deste número. */
  const [reactionCountdown, setReactionCountdown] = useState(3);
  /** "Grande X" (pedido do usuário) sobre a última posição conhecida da carta anunciada, no instante em que alguém reage - ver ReactionNegatedBurst.tsx. */
  const [reactionNegatedBurst, setReactionNegatedBurst] = useState<ReactionNegatedBurstSpec | null>(null);
  /**
   * Mosqueteiro (pedido do usuário: "efeitos visuais de balas sendo
   * disparadas nas cartas que as magias do mosqueteiro utiliza") - um tiro
   * por carta-alvo de Valete/Rainha/Rei, montado em applyMagicEffectPresentation
   * a partir das posições de tela conhecidas (mesmo cardPositionsRef acima).
   */
  const [bulletImpacts, setBulletImpacts] = useState<BulletImpactSpec[]>([]);
  /**
   * Piromante (pedido explícito do usuário: "projéteis visualmente indo em
   * direção aos seus alvos") - uma bola de fogo por slot alvo, viajando da
   * própria FireballMeter.tsx do jogador que lançou até o slot no campo do
   * oponente (mesmas posições reais via cardPositionsRef acima, agora
   * incluindo os data-card-id sintéticos "piromante-fireball-pN"/"slot-pN-i"
   * - ver FireballMeter.tsx/FieldSlotView.tsx). O impacto de verdade
   * (FireShatterBurst.tsx, ver burningSlots) e o dispatch que aplica a
   * mudança no motor só acontecem DEPOIS dessa animação (ver
   * FIREBALL_TRAVEL_MS/dispatchMagicAction abaixo) - a bola precisa
   * visivelmente CHEGAR primeiro.
   */
  const [fireballProjectiles, setFireballProjectiles] = useState<FireballProjectileSpec[]>([]);
  /** Duração (s) do voo da Bola de Fogo - ver fireballProjectiles acima. */
  const FIREBALL_TRAVEL_MS = 550;

  /**
   * `player` usa `cardId` (uma carta mágica própria do mesmo valor da
   * anunciada) pra reagir - captura a última posição conhecida da carta
   * anunciada (mesmo `cardPositionsRef` que FlyingDiscardCard.tsx já usa
   * como origem do voo até o descarte) pro "grande X" (pedido do usuário:
   * "um grande X surgindo na carta do oponente"), toca um som dramático,
   * mostra uma notificação épica, e só DEPOIS despacha REACT_TO_MAGIC de
   * verdade - a mesma ordem já seguida por todo o resto do arquivo (calcular
   * com o estado ATUAL antes de aplicar a mudança).
   */
  const handleReactToMagic = (player: PlayerNumber, cardId: string) => {
    const pending = gameState.pendingReaction;
    if (!pending) return;
    const announcedRect = cardPositionsRef.current.get(pending.cardId);
    if (announcedRect) {
      const burstKey = `${pending.cardId}-negated-${gameState.turn}`;
      setReactionNegatedBurst({
        key: burstKey,
        rect: { left: announcedRect.left, top: announcedRect.top, width: announcedRect.width, height: announcedRect.height },
      });
      setTimeout(() => setReactionNegatedBurst((prev) => (prev?.key === burstKey ? null : prev)), 900);
    }
    soundManager.play('card-shatter');
    // FIX (pedido do usuário: "ao invés de falar jogador 1 e jogador 2,
    // troque para os respectivos nomes dos personagens em questão, em
    // todos os lugares no jogo") - `p1Theme`/`p2Theme` (calculados logo no
    // início do componente) já trazem `.name` do personagem de cada
    // jogador.
    toast(`⚔️ ${player === 1 ? p1Theme.name : p2Theme.name} REAGIU! A magia de ${pending.casterPlayer === 1 ? p1Theme.name : p2Theme.name} foi negada - ambas as cartas descartadas.`, { duration: 3500 });
    dispatch({ type: 'REACT_TO_MAGIC', player, cardId });
  };

  // A janela de 3s de verdade - timer único que resolve `pendingReaction`
  // (RESOLVE_PENDING_REACTION) se ninguém reagir a tempo, + a contagem
  // cosmética (3,2,1), + speedlines/som de alerta (pedido do usuário: "os
  // efeitos disso são umas speedlines no fundo... e um som simples de
  // alerta").
  useEffect(() => {
    if (!gameState.pendingReaction) return;
    setReactionCountdown(3);
    setSpeedlinesCharacter(gameState.pendingReaction.character);
    setSpeedlinesIntense(true);
    soundManager.play('reaction-alert');
    const tick = setInterval(() => setReactionCountdown((prev) => Math.max(0, prev - 1)), delay(1000));
    // FIX (pedido do usuário: "vários efeitos de magias... não tem seus
    // sons") - causa raiz encontrada: sem reação a tempo, este timer só
    // despachava RESOLVE_PENDING_REACTION (aplica o efeito de verdade no
    // motor) sem NUNCA chamar applyMagicEffectPresentation/
    // triggerAiActionEffects - toda magia resolvida por aqui (qualquer
    // ativação, do jogador OU da IA, sempre que o Modo Reações está ligado e
    // ninguém reage a tempo) tocava silenciosamente, sem nenhum som nem
    // flash. `originalAction` (guardado no instante do anúncio - ver
    // maybeDeferForReaction em gameEngine.ts) é a MESMA action original
    // (EXECUTE_MAGIC/ACTIVATE_SIMPLE_MAGIC/etc.) que já teria disparado a
    // apresentação normalmente se o Modo Reações estivesse desligado -
    // `triggerAiActionEffects` já lida com qualquer uma delas genericamente
    // (não é "só IA" apesar do nome - ver comentário na própria função).
    const pendingAction = gameState.pendingReaction.originalAction;
    const resolve = setTimeout(() => {
      triggerAiActionEffects(pendingAction);
      dispatch({ type: 'RESOLVE_PENDING_REACTION' });
    }, delay(3000));
    return () => {
      clearInterval(tick);
      clearTimeout(resolve);
      setSpeedlinesCharacter(null);
      setSpeedlinesIntense(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.pendingReaction]);

  // A IA (quando é ELA quem pode reagir) decide sozinha, com um "tempo de
  // pensar" aleatório dentro da janela de 3s - decideReactionToMagic
  // (aiPlayer.ts, "aleatório" por pedido do usuário) só devolve uma ação
  // quando decide reagir; quando não, simplesmente não faz nada e deixa o
  // timer acima expirar normalmente (RESOLVE_PENDING_REACTION aplica o
  // efeito, como se ninguém tivesse podido reagir).
  useEffect(() => {
    const pending = gameState.pendingReaction;
    if (!pending) return;
    const reactor = opponentOf(pending.casterPlayer);
    if (!isAi(reactor)) return;
    const reaction = decideReactionToMagic(gameState, reactor);
    if (!reaction) return;
    const t = setTimeout(() => handleReactToMagic(reactor, reaction.cardId), delay(800 + Math.random() * 1400));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.pendingReaction]);

  // FIX (pedido do usuário: "melhore o desempenho do jogo na utilização de
  // magias, tem vezes que quando uma magia é ativada, eu não consigo
  // posicionar uma carta") - este efeito rodava SEM array de dependências,
  // ou seja, em TODO render do GameBoard (inclusive os puramente de
  // animação: flashes de magia, hover, toasts...), varrendo o DOM inteiro
  // (`querySelectorAll`) e forçando um reflow síncrono por elemento
  // (`getBoundingClientRect`) a cada um. Com dezenas de cartas em jogo e as
  // várias re-renderizações rápidas que uma ativação de magia dispara em
  // sequência, isso engasgava a thread principal bem na hora em que o
  // jogador tentava arrastar/soltar uma carta - o clique/drop podia ser
  // perdido no meio do engasgo, dando a impressão de "não consigo
  // posicionar uma carta". Só precisamos de posições "recentes o bastante"
  // (o consumidor abaixo tolera alguns milissegundos de atraso), então basta
  // recapturar quando o ESTADO DO JOGO muda de verdade (cartas nascem, se
  // movem ou saem de cena) - exatamente os momentos em que a posição de uma
  // carta pode ter mudado - em vez de a cada render.
  useEffect(() => {
    document.querySelectorAll('[data-card-id]').forEach((el) => {
      const cardId = el.getAttribute('data-card-id');
      if (cardId) cardPositionsRef.current.set(cardId, el.getBoundingClientRect());
    });
  }, [gameState]);

  const prevDiscardIdsRef = useRef(new Set(gameState.discardPile.map((c) => c.id)));
  useEffect(() => {
    const prevIds = prevDiscardIdsRef.current;
    const newlyDiscarded = gameState.discardPile.filter((c) => !prevIds.has(c.id));
    prevDiscardIdsRef.current = new Set(gameState.discardPile.map((c) => c.id));
    if (newlyDiscarded.length === 0) return;

    const toRect = discardPileRef.current?.getBoundingClientRect();
    if (!toRect) return;

    const specs: FlyingDiscardSpec[] = [];
    for (const card of newlyDiscarded) {
      const fromRect = cardPositionsRef.current.get(card.id);
      if (!fromRect) continue; // carta nunca ficou visível nesta sessão (ex.: reembaralhada direto do descarte) - nada para animar
      specs.push({
        key: `${card.id}-${gameState.log.length}`,
        card,
        from: { left: fromRect.left, top: fromRect.top, width: fromRect.width, height: fromRect.height },
        to: { left: toRect.left, top: toRect.top, width: toRect.width, height: toRect.height },
      });
    }
    if (specs.length === 0) return;
    setFlyingDiscards((prev) => [...prev, ...specs]);
    // FIX (pedido do usuário: "a animação está lenta") - acompanha a duração
    // real da animação em FlyingDiscardCard.tsx (400ms, com o trajeto agora
    // curvo - ver comentário lá) + uma margem pequena - o card não pode ser
    // removido ANTES da animação acabar (cortaria ela pela metade), mas
    // também não deve ficar montado muito além do fim de verdade.
    const t = setTimeout(() => {
      setFlyingDiscards((prev) => prev.filter((s) => !specs.some((spec) => spec.key === s.key)));
    }, delay(480));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.discardPile]);

  // Ambos jogadores selecionaram um slot de combate -> resolve
  // automaticamente após uma pausa curta. FIX (pedido do usuário: "remova
  // todas alterações anteriores visuais das disputas... deixe as disputas
  // mais rápidas") - reverte o overhaul anterior (cartas flutuando por 1,5s
  // antes de se dispararem uma na outra - CombatClashOverlay.tsx, removido);
  // a pausa agora é só um respiro curto e FIXO antes de resolver, sem medir
  // posição de nenhuma carta em tela (o próprio slot já vira a carta face-up
  // sozinho via FlipCard/`isCombatSelected`, ver FieldSlotView.tsx - isso
  // nunca dependeu do overlay).
  useEffect(() => {
    const { player1: p1, player2: p2 } = gameState.combatSelection;
    if (p1 === undefined || p2 === undefined || gameState.combatResolution || pendingCoringaQChoice) return;

    // Coringa (redesenho completo) - Rainha armadilha revelada em Combate:
    // "seu valor se torna o mesmo de uma carta revelada do oponente (o
    // jogador escolhe no momento que é revelada)" - se um dos 2 slots
    // selecionados contém a Rainha (ainda não transformada em numeral pela
    // Magia Numeral), a resolução PAUSA aqui: pede a escolha ao jogador
    // (diálogo) ou decide sozinha se for a IA - RESOLVE_COMBAT só é
    // despachado DEPOIS, já carregando `coringaQCopyTargetId`.
    const p1Card = gameState.player1.field[p1].faceDownCard;
    const p2Card = gameState.player2.field[p2].faceDownCard;
    const p1IsRawQ = Boolean(p1Card && isCoringaRawTrapCard(gameState, 1, p1Card) && p1Card.value === 'Q');
    const p2IsRawQ = Boolean(p2Card && isCoringaRawTrapCard(gameState, 2, p2Card) && p2Card.value === 'Q');

    if (p1IsRawQ || p2IsRawQ) {
      const qOwner: 1 | 2 = p1IsRawQ ? 1 : 2;
      if (isAi(qOwner)) {
        const targetId = decideCoringaQCopyTarget(gameState, qOwner) ?? undefined;
        const t = setTimeout(() => dispatch({ type: 'RESOLVE_COMBAT', coringaQCopyTargetId: targetId }), delay(350));
        return () => clearTimeout(t);
      }
      setPendingCoringaQChoice({ qOwner });
      return;
    }

    const t = setTimeout(() => dispatch({ type: 'RESOLVE_COMBAT' }), delay(350));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.combatSelection.player1, gameState.combatSelection.player2, gameState.combatResolution, pendingCoringaQChoice]);

  // Coringa (redesenho completo) - confirma (ou pula) a escolha de cópia da
  // Rainha armadilha e finalmente despacha RESOLVE_COMBAT - `targetId`
  // undefined tanto pro "Não copiar" quanto pro caso sem nenhuma carta
  // revelada disponível (handleResolveCombat já trata a ausência de alvo
  // como valor 1, resposta do usuário confirmada).
  const executeCoringaQChoice = (targetId: string | undefined) => {
    if (!pendingCoringaQChoice) return;
    dispatch({ type: 'RESOLVE_COMBAT', coringaQCopyTargetId: targetId });
    setPendingCoringaQChoice(null);
  };

  // Resultado do combate revelado -> FIX (mesmo pedido acima): antes a pausa
  // (`revealBeat`) cobria o disparo rápido + flash de colisão do
  // CombatClashOverlay removido; agora os 2 valores aparecem GRANDES assim
  // que a resolução chega (`combatValueReveal`, renderizado por
  // BattleField.tsx ladeando o ícone de espadas do divisor central - FIX
  // (pedido do usuário: "quando eu disse querer que os números aparecessem
  // no meio, eu quis dizer do lado das duas espadas... não no literal meio
  // da tela"; antes CombatValueReveal.tsx desenhava isso como um overlay
  // fixo cobrindo a tela inteira, centralizado no VIEWPORT, não no divisor
  // do campo)) por um tempo curto de leitura, e só DEPOIS o popup de
  // vencedor (com som/confete) assume a cena - toda a sequência bem mais
  // curta que antes.
  useEffect(() => {
    if (!gameState.combatResolution) return;
    const resolution = gameState.combatResolution;
    setCombatValueReveal({
      p1Value: resolution.p1Value,
      p2Value: resolution.p2Value,
      p1Character: player1Character,
      p2Character: player2Character,
      winner: resolution.winner,
    });
    // Coringa (redesenho completo) - Rei armadilha explodindo em Combate:
    // dispara o burst de fumaça no PRÓPRIO slot do dono do Rei, no exato
    // instante da revelação (não espera o `revealBeat` abaixo, que só
    // controla a transição pro popup de vencedor). O SOM já é coberto pelo
    // useEffect de log acima (mesma entrada "Rei armadilha... explodiu" -
    // tocar de novo aqui duplicaria).
    if (resolution.coringaKForcedTie) {
      const koPlayer = resolution.coringaKForcedTie.koPlayer;
      triggerSmokeBurst({ player: koPlayer, slotIndex: koPlayer === 1 ? resolution.p1SlotIndex : resolution.p2SlotIndex });
    }
    const revealBeat = delay(650);
    const t1 = setTimeout(() => {
      setShowCombatResult(true);
      setCombatValueReveal(null);
      soundManager.play(resolution.winner === 'tie' ? 'combat-tie' : 'combat-win');
      // FIX (pedido do usuário, item 4): screen shake só no golpe DECISIVO -
      // quando esta vitória fecha a disputa e realmente custa 1 vida do
      // perdedor (`disputeWinner` preenchido), não em toda vitória de combate
      // comum (a 1ª de 2 necessárias), para o abalo ficar reservado ao
      // momento que de fato pesa na partida.
      if (resolution.disputeWinner && settings.animations) {
        if (settings.screenShakeEnabled) {
          setScreenShake(true);
          setTimeout(() => setScreenShake(false), delay(650));
        }
        if (settings.screenFlashEnabled) {
          setScreenFlash(true);
          setTimeout(() => setScreenFlash(false), delay(650));
        }
      }
      // FIX (pedido do usuário, item 10): "brilho extra ao vencer 2 combates
      // seguidos" - mesmo gatilho (`disputeWinner`) do screen shake acima,
      // mas de duração mais longa (a zona do vencedor continua brilhando
      // durante boa parte do popup de resultado, não só o instante do golpe).
      if (resolution.disputeWinner) {
        setVictoryGlowPlayer(resolution.disputeWinner);
        setTimeout(() => setVictoryGlowPlayer(null), delay(2500));
      }
    }, revealBeat);
    const t2 = setTimeout(() => {
      setShowCombatResult(false);
      dispatch({ type: 'FINALIZE_COMBAT' });
    }, revealBeat + delay(1400));
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.combatResolution]);

  // FIX (pedido do usuário: "faça a escolha ser automática e imediata quando
  // há apenas uma carta faltando para ser selecionada durante a fase de
  // combate") - com 0 ou 1 carta real restante em campo não existe nenhuma
  // decisão de verdade a tomar (0: qualquer slot vazio vale o mesmo "1 no
  // combate"; 1: é ela ou nada) - exigir um clique manual nesse caso só
  // atrasa o ritmo sem agregar nenhuma escolha real. A IA já pula esse mesmo
  // "não-escolha" instantaneamente (ver `myFilledSlots.length <= 1` em
  // decideCombatSlotSelection/aiPlayer.ts, ajustado junto); este efeito
  // espelha o mesmo comportamento para o lado humano - por isso só age sobre
  // jogadores `!isAi(player)` (a IA já se resolve sozinha pelo polling
  // próprio dela, mais abaixo).
  useEffect(() => {
    if (gameState.phase !== 'combat') return;
    if (gameState.paused || gameState.gameOver || gameState.combatResolution) return;
    if (showPhaseTransition) return;
    if (pendingMagic || pendingAceTransform || pendingMonsterEffect || pendingMonsterTarget || pendingBestaMonsterTarget || pendingCoringaQChoice) return;

    for (const player of [1, 2] as PlayerNumber[]) {
      if (isAi(player)) continue;
      const key = playerKeyOf(player);
      // FIX (checagem extensa por bugs - consolidação de regra duplicada):
      // usa `canSelectCombatSlot` (gameEngine.ts), a MESMA função que
      // handleSelectCombatSlot e decideCombatSlotSelection (aiPlayer.ts)
      // usam, em vez de recalcular a mesma expressão aqui pela 3ª vez.
      if (!canSelectCombatSlot(gameState, player)) continue;

      const filled = getFilledFieldSlots(gameState[key].field);
      if (filled.length >= 2) continue; // escolha de verdade entre 2+ cartas - deixa pro clique manual

      const slotIndex = filled.length === 1 ? filled[0] : gameState[key].field.findIndex((slot) => !slot.faceDownCard);
      if (slotIndex === -1) continue; // guarda de segurança - não deveria acontecer (campo sempre tem 3 slots)

      dispatch({ type: 'SELECT_COMBAT_SLOT', player, slotIndex });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, showPhaseTransition, pendingMagic, pendingAceTransform, pendingMonsterEffect, pendingMonsterTarget, pendingBestaMonsterTarget, pendingCoringaQChoice]);

  // Fim de jogo -> mostra vitória, depois oferece revanche.
  useEffect(() => {
    if (!gameState.gameOver) return;
    let innerTimer: ReturnType<typeof setTimeout> | undefined;
    const t = setTimeout(() => {
      setShowVictory(true);
      soundManager.play('victory');
      innerTimer = setTimeout(() => {
        setShowVictory(false);
        setShowRematchDialog(true);
      }, delay(3000));
    }, delay(2500));
    return () => {
      clearTimeout(t);
      if (innerTimer) clearTimeout(innerTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.gameOver]);

  // FIX (pedido do usuário: "quero que tenha mais efeitos"): confete
  // comemorativo quando o popup de VITÓRIA (fim da partida inteira, não só
  // de um combate - ver CombatResult.tsx para o confete menor de combate)
  // aparece - um jorro bem maior e repetido por alguns segundos, na cor do
  // personagem vencedor. Respeita `settings.particleEffects`.
  // FIX (pedido do usuário, item 8: "canhões de confete dos dois cantos da
  // tela + nome do vencedor gigante e animado"): antes disparava de dois
  // pontos no MEIO da tela (`y: 0.4`), mais perto de um "leque" central que
  // de "canhões de canto". Agora dispara dos dois cantos INFERIORES de
  // verdade (`origin.y: 1`), com `angle` mirando pro centro da tela (60°/
  // 120°) e velocidade bem maior, pra parecer canhões de confete de show/
  // vitória de verdade - e por mais rodadas, pra durar mais.
  useEffect(() => {
    if (!showVictory || !gameState.gameOver || !settings.particleEffects) return;
    const winnerTheme = gameState.gameOver.winner === 1 ? p1Theme : p2Theme;
    const colors = [winnerTheme.primary, '#EFE7D6', '#C59E4F'];
    let count = 0;
    const fire = () => {
      confetti({ particleCount: 160, angle: 60, spread: 70, startVelocity: 70, origin: { x: 0, y: 1 }, colors });
      confetti({ particleCount: 160, angle: 120, spread: 70, startVelocity: 70, origin: { x: 1, y: 1 }, colors });
      count += 1;
    };
    fire();
    const interval = window.setInterval(() => {
      if (count >= 5) {
        window.clearInterval(interval);
        return;
      }
      fire();
    }, 500);
    return () => window.clearInterval(interval);
    // FIX (checagem extensa por bugs): o guard já lia `gameState.gameOver` e
    // `settings.particleEffects`, mas nenhum dos dois estava nas dependências
    // (mesma classe do bug real já corrigido no efeito de polling da IA
    // acima) - se o usuário ligasse "Efeitos de partículas" nas Configurações
    // enquanto o popup de vitória ainda estivesse na tela (a janela de ~3s
    // antes do diálogo de revanche assumir), o confete nunca disparava pra
    // aquela vitória, mesmo com a opção já ativada, porque nada reexecutava
    // este efeito. Impacto puramente cosmético (sem confete), nunca um
    // travamento - mas a mesma classe de bug, corrigida do mesmo jeito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showVictory, gameState.gameOver, settings.particleEffects]);

  // Magia Numeral ativada -> mostra popup, depois finaliza (descarta cartas, pula combate).
  // FIX (pedido do usuário): "screen shake e efeitos por toda arena quando o
  // jogador ativa uma magia numeral" - antes só o popup (Dialog) aparecia;
  // agora também sacode a tela (mesmo `.animate-screen-shake` do golpe
  // decisivo de combate) e dispara um burst cobrindo a arena inteira (ver
  // ArenaMagicBurst.tsx), reforçando que uma Magia Numeral é um momento maior
  // que uma magia comum (que só tem o burst local em MagicEffectBurst.tsx).
  useEffect(() => {
    if (!gameState.numeralSpellPending) return;
    setShowNumeralSpellPopup(true);
    // FIX (pedido do usuário: "checkout em todos sons... adicione para tais
    // personagens") - antes tocava o 'magic-activate' genérico pras 3 Magias
    // Numerais (Visão Arcana/Fúria Sanguinária/Benção Eterna), sem distinção
    // por personagem, diferente das magias J/Q/K normais - ver numeralSoundFor.
    soundManager.play(numeralSoundFor(gameState.numeralSpellPending.character));
    if (settings.animations) {
      if (settings.screenShakeEnabled) {
        setScreenShake(true);
        setTimeout(() => setScreenShake(false), delay(650));
      }
      if (settings.screenFlashEnabled) {
        setScreenFlash(true);
        setTimeout(() => setScreenFlash(false), delay(650));
      }
    }
    const t = setTimeout(() => {
      setShowNumeralSpellPopup(false);
      dispatch({ type: 'FINALIZE_NUMERAL_SPELL' });
    }, delay(3000));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.numeralSpellPending]);

  // Ao trocar de fase, seleções de UI transitórias perdem o sentido.
  useEffect(() => {
    setSelectedCardId(null);
    setSelectedSlot(null);
    setSelectedForDiscard(new Set());
    setSelectedForTower(new Set());
    setPendingMonsterTarget(null);
    setPendingBestaMonsterTarget(null);
  }, [gameState.phase]);

  // Modo "Contra a IA" / Modo Espectador: a cada mudança de estado, pergunta
  // a lib/aiPlayer.ts qual seria a próxima ação de CADA jogador controlado
  // pela IA (`aiPlayers` - só um em "Contra a IA", os dois no Espectador) e
  // despacha depois de um pequeno atraso "pensando..." (reaproveita a mesma
  // escala de velocidade de animação das Configurações). O efeito refaz essa
  // pergunta de novo a cada dispatch - da própria IA, do jogador humano (se
  // houver), ou da OUTRA IA - então cada IA reage automaticamente assim que
  // for a vez dela agir de novo. Fica parado (sem decidir nada) enquanto
  // algum popup automático (resultado de combate, magia numeral, pausa, fim
  // de jogo) ou um assistente de magia do jogador humano estiver na tela,
  // para não competir por atenção com esses fluxos.
  //
  // FIX (pedido do usuário: "modo espectador... IA vs IA") - antes calculava
  // e agendava a decisão de UM ÚNICO `aiPlayer`; agora itera `aiPlayers` e
  // agenda um timer PRÓPRIO pra cada um, independente - decideAiAction já é
  // uma função pura parametrizada por `player` (nunca assumiu que o outro
  // lado fosse humano, ver lib/aiPlayer.ts), então chamá-la duas vezes aqui
  // (uma por IA) já basta; nenhuma mudança na lógica de decisão em si. Na
  // fase de Combate, a própria decideCombatPhase já respeita de quem é a vez
  // de virar primeiro (`firstToFlip`) - a IA que não é a vez simplesmente
  // decide 'wait', exatamente como já fazia contra um humano.
  useEffect(() => {
    if (aiPlayers.length === 0) return;
    if (gameState.paused || gameState.gameOver) return;
    if (gameState.combatResolution || gameState.numeralSpellPending) return;
    // Modo Reações: enquanto uma magia está anunciada, a decisão da IA (se
    // ela for quem pode reagir) já tem seu PRÓPRIO useEffect dedicado (ver
    // acima) - este loop geral de decideAiAction precisa ficar de fora
    // completamente, senão pediria uma decisão de FASE (draw/strategy/combat)
    // pra um estado que o motor está bloqueando por completo agora mesmo.
    if (gameState.pendingReaction) return;
    if (pendingMagic || pendingAceTransform || pendingMonsterEffect || pendingMonsterTarget || pendingBestaMonsterTarget || pendingCoringaQChoice) return;
    if (showPhaseTransition) return; // ver comentário do `dispatch` guardado acima

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const ai of aiPlayers) {
      const decision = decideAiAction(gameState, ai);
      if (decision.type === 'wait') continue;
      if (decision.type === 'ready' && gameState[playerKeyOf(ai)].readyForNextPhase) continue;

      const baseMs = decision.type === 'action' ? decision.thinkTimeMs ?? 700 + Math.random() * 500 : 450;
      const t = setTimeout(() => {
        if (decision.type === 'action') {
          // FIX (pedido do usuário: relato de que ativações da IA não tinham
          // nenhum efeito visual, só a notificação) - dispara a mesma
          // apresentação (flash/som/estilhaço/roleta) que o clique humano
          // equivalente dispararia, ANTES do dispatch (mesma ordem já usada
          // pelos handlers humanos: calcular alvo com o estado ATUAL, só
          // depois aplicar a mudança) - ver triggerAiActionEffects abaixo.
          // FIX (checagem extensa por bugs - burst fantasma/duplicado no
          // Modo Reações): mesma checagem usada nos handlers humanos (ver
          // canMagicTriggerReactionAnnouncement em gameEngine.ts) - se esta
          // ação da IA for só um ANÚNCIO, a apresentação NÃO toca aqui, só
          // depois via o timer de 3s (que já chama triggerAiActionEffects
          // de novo quando a reação se resolve).
          const isAnnouncement =
            (decision.action.type === 'EXECUTE_MAGIC' || decision.action.type === 'ACTIVATE_SIMPLE_MAGIC') &&
            canMagicTriggerReactionAnnouncement(gameState, decision.action.player, decision.action.cardId);
          if (!isAnnouncement) {
            triggerAiActionEffects(decision.action);
          }
          dispatchMagicAction(decision.action);
        } else {
          dispatch({ type: 'TOGGLE_READY', player: ai });
        }
      }, delay(baseMs));
      timers.push(t);
    }
    return () => timers.forEach(clearTimeout);
    // FIX (softlock real encontrado - relatado como "a IA trava na fase de
    // estratégia/combate no modo Espectador"): `showPhaseTransition` já era
    // CHECADO no início deste efeito (linha do guard acima), mas não estava
    // na lista de dependências - a intenção óbvia era "não agir enquanto o
    // popup de transição de fase estiver na tela", mas faltava o complemento
    // "e reavaliar assim que ele sair". Sem isso, o seguinte podia acontecer:
    // um timer de ação rápido da IA (ex.: SELECT_COMBAT_SLOT, ~700-1200ms)
    // disparava e despachava (`dispatch`) exatamente enquanto o popup de
    // ~900ms de outra transição de fase ainda estava ativo; o dispatch em si
    // FUNCIONAVA (o guard dentro de `dispatch` fecha sobre o valor de
    // `showPhaseTransition` do MOMENTO em que este efeito rodou pela última
    // vez, não o valor ao vivo), então o estado do jogo mudava normalmente e
    // este efeito rodava de novo (reagindo à mudança de `gameState`) - mas
    // JUSTO NESSA nova execução, `showPhaseTransition` já tinha virado `true`
    // (a popup da fase seguinte), e o guard early-return no topo interrompia
    // a função ANTES do loop (nenhum `scheduling`) e ANTES de registrar uma
    // nova função de limpeza (`return;` puro, não `return () => ...`). Sem
    // nenhum timer agendado e sem nenhuma dependência que mudasse depois (o
    // próprio `showPhaseTransition` voltando a `false` não reexecutava nada,
    // por não estar aqui), a IA ficava esperando pra sempre por uma ação que
    // nunca mais seria reavaliada - travamento confirmado ao vivo (ver
    // instrumentação de depuração usada para achar isso, removida depois).
    // Agora, ao voltar a `false`, este efeito roda de novo e agenda a próxima
    // decisão normalmente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, aiPlayers, pendingMagic, pendingAceTransform, pendingMonsterEffect, pendingMonsterTarget, pendingBestaMonsterTarget, pendingCoringaQChoice, showPhaseTransition]);

  // FIX (pedido do usuário: "ainda ocorre softlocks no espectador... adicione
  // um timer de 10 segundos pra IA rever o que está ou deveria fazer, caso
  // passe estes 10, a IA avisa prontidão para troca de fase imediatamente") -
  // rede de segurança GENÉRICA contra qualquer softlock da IA no Modo
  // Espectador, mesmo uma causa ainda não identificada/corrigida (2 causas
  // raiz reais já foram encontradas e corrigidas nesta rodada - ver FIX acima
  // e getUnbattledHorizontalSlots em lib/gameEngine.ts - mas esta rede não
  // depende de conhecer a causa: só garante que o jogo nunca fique parado pra
  // sempre). Reinicia a contagem de 10s (tempo REAL de parede, de propósito
  // SEM usar `delay()` acima - a escala de velocidade de animação das
  // Configurações não deve mudar quanto tempo o jogo espera antes de decidir
  // que travou) toda vez que `gameState` muda de verdade; o maior intervalo
  // LEGÍTIMO sem nenhuma mudança de estado (o popup de resultado de combate
  // mais lento possível, animação no mínimo/50%) fica em torno de 6.3s -
  // folga de sobra antes destes 10s. Se eles se esgotarem mesmo assim sem
  // nenhuma mudança, força TOGGLE_READY em qualquer IA que ainda não esteja
  // pronta - o mesmo efeito de um jogador clicar "Pronto" manualmente, que já
  // é seguro em qualquer fase (handleToggleReady em gameEngine.ts: em Combate
  // descarta o campo e avança o turno; nas outras fases só avança quando os 2
  // lados estiverem prontos - então mesmo travando só 1 IA, o outro lado (ou
  // já pronto, ou destravado por este mesmo watchdog) completa o par).
  //
  // Restrito a `aiPlayers.length === 2` (só o Modo Espectador, os 2 lados
  // sempre IA) DE PROPÓSITO: no modo "Contra a IA" o jogador humano pode
  // ficar mais de 10s parado só pensando (perfeitamente normal), e forçar a
  // prontidão da IA nesse caso seria um comportamento novo e indesejado -
  // atropelaria uma partida que não travou, só está esperando o humano.
  useEffect(() => {
    if (aiPlayers.length !== 2) return;
    if (gameState.paused || gameState.gameOver) return;

    const t = setTimeout(() => {
      for (const ai of aiPlayers) {
        if (!gameState[playerKeyOf(ai)].readyForNextPhase) {
          dispatch({ type: 'TOGGLE_READY', player: ai });
        }
      }
    }, 10000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, aiPlayers]);

  // ----- Handlers: traduzem interação do usuário em dispatch() -----

  const handleDrawCards = (playerNumber: 1 | 2, count: number) => {
    dispatch({ type: 'DRAW_CARDS', player: playerNumber, count });
  };

  const handleToggleDiscard = (playerNumber: 1 | 2, cardId: string) => {
    const player = gameState[playerKeyOf(playerNumber)];
    const card = player.hand.find((c) => c.id === cardId);
    if (!card) return;
    if (card.revealed) {
      // FIX (pedido do usuário: "permita que cartas reveladas pelo próprio
      // jogador (em caso de fusões ou transformações) de serem possíveis de
      // se fusionar também") - uma carta revelada nunca pode ser
      // DESCARTADA (regra mantida - ver o mesmo filtro em handleDiscardCards
      // em gameEngine.ts), mas esta seleção é compartilhada com a de Fusão
      // (ver PlayerZone.tsx) - uma carta revelada por uma fusão anterior ou
      // por transformar um Ás continua elegível para fundir por VALOR (ver
      // canFuseCards em fusion.ts, que nunca checou `.revealed`), então
      // deixamos ela entrar na seleção quando for esse o caso, em vez de
      // bloquear o clique por completo.
      const isFusable = isPlainNumeralCard(card) || (gameConfig.monsterCards && isUntransformedAce(card));
      if (!gameConfig.fusion || gameState.phase !== 'draw' || !isFusable) return;
    }

    // FIX (pedido do usuário: "opção do pré-jogo para decidir o limite de
    // cartas que podem serem descartadas por turno") - `gameConfig.discardLimit`
    // no lugar do antigo "4" fixo (mesmo limite que handleDiscardCards em
    // gameEngine.ts aplica de verdade - isso aqui só evita que a seleção
    // cresça além do que seria aceito, para a UI nunca prometer mais do que
    // o motor vai permitir).
    const discardLimit = gameConfig.discardLimit;
    setSelectedForDiscard((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(cardId)) {
        newSet.delete(cardId);
      } else if (newSet.size < discardLimit && player.discardsThisTurn + newSet.size < discardLimit) {
        newSet.add(cardId);
      }
      return newSet;
    });
  };

  const handleDiscardCards = (playerNumber: 1 | 2) => {
    if (selectedForDiscard.size === 0) return;
    dispatch({ type: 'DISCARD_CARDS', player: playerNumber, cardIds: Array.from(selectedForDiscard) });
    setSelectedForDiscard(new Set());
  };

  // Modo Towers (pedido do usuário: "era pra ser possível selecionar duas
  // cartas apenas clicando nelas, caso tenha mais do que uma carta igual a
  // ela na mão") - substitui `onCardSelect` como o handler de clique numa
  // carta da mão na fase de Estratégia. A decisão em si (juntar numa torre
  // ou seguir a seleção normal de carta única) é uma função PURA testada
  // isoladamente - ver decideHandCardSelection em lib/handSelection.ts para
  // a lógica completa e comentada caso a caso.
  const handleSelectCardForField = (playerNumber: 1 | 2, cardId: string) => {
    const player = gameState[playerKeyOf(playerNumber)];
    const next = decideHandCardSelection(
      player.hand,
      player.field,
      player.towerSlotThisTurn,
      { selectedCardId, selectedForTower },
      cardId,
      gameConfig.towersMode
    );
    setSelectedCardId(next.selectedCardId);
    setSelectedForTower(next.selectedForTower);
  };

  const handleFormTower = (playerNumber: 1 | 2, slotIndex: number) => {
    if (selectedForTower.size === 0) return;
    dispatch({ type: 'FORM_OR_REINFORCE_TOWER', player: playerNumber, slotIndex, cardIds: Array.from(selectedForTower) });
    setSelectedForTower(new Set());
    setSelectedSlot(null);
  };

  // FIX (pedido do usuário: variante "Fusão") - dispara um flash local
  // (CharacterMagicBurst na cor do PRÓPRIO jogador, via effectFlashCardIds -
  // sem ArenaMagicBurst de tela inteira, mais leve/adequado a um momento da
  // fase de Compra, não de combate/magia grande) sobre a carta NOVA assim
  // que ela nasce. O id é o mesmo determinístico que handleFuseCards em
  // gameEngine.ts calcula (`fused-<id1>-<id2>`) - calculado aqui de novo em
  // vez de lido do estado pós-dispatch porque dispatch() não devolve o novo
  // estado sincronamente (useReducer só aplica no próximo render).
  const handleFuseCards = (playerNumber: 1 | 2, cardId1: string, cardId2: string) => {
    if (!cardId1 || !cardId2 || cardId1 === cardId2) return;
    const fusedCardId = `fused-${cardId1}-${cardId2}`;
    setEffectFlashCardIds([fusedCardId]);
    setTimeout(() => setEffectFlashCardIds((prev) => (prev[0] === fusedCardId ? [] : prev)), delay(EFFECT_FLASH_DURATION_MS));
    dispatch({ type: 'FUSE_CARDS', player: playerNumber, cardId1, cardId2 });
    soundManager.play('magic-activate');
    setSelectedForDiscard(new Set());
  };

  const handlePlayCard = (playerNumber: 1 | 2, cardId: string, slotIndex: number, asHorizontal: boolean) => {
    dispatch({ type: 'PLAY_CARD', player: playerNumber, cardId, slotIndex, asHorizontal });
    soundManager.play('card-play');
    setSelectedCardId(null);
    setSelectedSlot(null);
  };

  const handleTransformAce = (playerNumber: 1 | 2, cardId: string) => {
    setPendingAceTransform({ playerNumber, aceCardId: cardId });
  };

  // FIX (item 9): antes não havia nenhuma forma de trocar uma carta já
  // posicionada em campo por outra da mão - a única opção era usar "Recolher"
  // (devolver para a mão) e depois posicionar a nova em duas ações separadas.
  // Agora um único botão "Troca" faz isso de uma vez (ver PlayerZone.tsx e o
  // handler SWAP_FIELD_CARD em gameEngine.ts).
  const handleSwapFieldCard = (playerNumber: 1 | 2, cardId: string, slotIndex: number) => {
    dispatch({ type: 'SWAP_FIELD_CARD', player: playerNumber, cardId, slotIndex });
    soundManager.play('card-play');
    setSelectedCardId(null);
    setSelectedSlot(null);
  };

  // Núcleo compartilhado do dispatch de TRANSFORM_ACE + efeitos visuais/som -
  // usado tanto pelo diálogo "Transformar Ás" (executeAceTransform, que já
  // sabe o Ás via pendingAceTransform) quanto pelo drag-and-drop rápido
  // (handleAceTransformDrop, pedido do usuário: "forma rápida com drag n
  // drop de transformar Ás... arrastando o Ás encima do número 2 a 10"), que
  // já chega com os dois ids prontos (arrastado + alvo), sem precisar abrir
  // diálogo nenhum.
  const runAceTransform = (playerNumber: 1 | 2, aceCardId: string, targetCardId: string) => {
    dispatch({ type: 'TRANSFORM_ACE', player: playerNumber, aceCardId, targetCardId });
    // FIX (pedido do usuário: "efeito visual chamativo para quando o Ás é
    // transformado") - dispara AceTransformBurst.tsx bem em cima da própria
    // carta (ainda na mão neste momento).
    setAceTransformFlashCardId(aceCardId);
    setTimeout(() => setAceTransformFlashCardId(null), delay(EFFECT_FLASH_DURATION_MS));
    // FIX (pedido do usuário: "som") - toca só quando a roleta de números
    // (item 7, ver AceTransformBurst.tsx) assenta no valor de verdade, não no
    // instante do dispatch - senão o som chegaria antes do número parar de
    // piscar, dessincronizado do que está na tela.
    setTimeout(() => soundManager.play('ace-transform'), delay(ROULETTE_DURATION_MS));
  };

  const executeAceTransform = (targetCardId: string) => {
    if (!pendingAceTransform) return;
    runAceTransform(pendingAceTransform.playerNumber, pendingAceTransform.aceCardId, targetCardId);
    setPendingAceTransform(null);
  };

  const handleAceTransformDrop = (playerNumber: 1 | 2, aceCardId: string, targetCardId: string) => {
    runAceTransform(playerNumber, aceCardId, targetCardId);
  };

  const handleActivateMagicClick = (playerNumber: 1 | 2, cardId: string) => {
    const player = gameState[playerKeyOf(playerNumber)];
    const card = player.hand.find((c) => c.id === cardId);
    if (!card || (card.value !== 'J' && card.value !== 'Q' && card.value !== 'K')) return;

    const character = characterOf(gameState, playerNumber);
    const magicType = card.value as MagicCardType;

    // Anjo J (Bênção Divina) e Anjo K (Reforço Angelical) não precisam de
    // assistente: não exigem escolher nenhum alvo, então ativam imediatamente.
    if (character === 'anjo' && (magicType === 'J' || magicType === 'K')) {
      // FIX (item 8 da 6ª rodada): estas duas eram exatamente as magias sem
      // NENHUM efeito visual (ver comentário de computeMagicEffectTargets
      // abaixo) - sem alvo único pra destacar, usa o burst genérico no
      // próprio jogador (ver flashSelfEffect acima).
      // FIX (checagem extensa por bugs - burst fantasma/duplicado no Modo
      // Reações): ver canMagicTriggerReactionAnnouncement em gameEngine.ts -
      // se esta ativação for na verdade só um ANÚNCIO (efeito represado em
      // pendingReaction), a apresentação some daqui e só toca depois, no
      // mesmo caminho que já trata a resolução da reação.
      if (!canMagicTriggerReactionAnnouncement(gameState, playerNumber, cardId)) {
        flashSelfEffect(playerNumber, character, getMagicCardInfo(character, magicType).name);
        soundManager.play(magicSoundFor(character, magicType));
      }
      dispatch({ type: 'ACTIVATE_SIMPLE_MAGIC', player: playerNumber, cardId });
      return;
    }

    // Coringa (redesenho completo) - o "botão de magia" só aparece nesta
    // carta durante a janela da Magia Numeral "Mão de Ferro" (ver
    // PlayerZone.tsx, canActivateMagicNow) - clicar transforma ela
    // PERMANENTEMENTE em carta de número 11/12/13, sem diálogo nenhum
    // (mesma ideia "sem assistente" do Anjo acima).
    if (character === 'coringa' && !card.coringaTransformedToNumeral) {
      flashSelfEffect(playerNumber, character, 'Mão de Ferro');
      dispatch({ type: 'TRANSFORM_CORINGA_MAGIC_CARD', player: playerNumber, cardId });
      soundManager.play(numeralSoundFor('coringa'));
      return;
    }

    // Piromante (pedido do usuário: lançar a Bola de Fogo é jogada de
    // Combate): fora da fase do efeito próprio da carta, a ÚNICA coisa que
    // essa ativação pode fazer é lançar - então o diálogo já abre com o
    // lançamento escolhido, em vez de abrir no efeito próprio (desabilitado)
    // e exigir um clique extra que, esquecido, viraria um Confirmar que o
    // motor recusa em silêncio.
    const opensAsFireballLaunch =
      character === 'piromante' && gameState.phase !== getMagicCardInfo('piromante', magicType).phase;
    setPendingMagic({
      playerNumber,
      cardId,
      type: magicType,
      character,
      selectedCards: [],
      ...(opensAsFireballLaunch ? { fireballLaunch: true } : {}),
    });
  };

  // FIX (item 5 da 4ª rodada, cobertura completada no item 8 da 6ª): calcula
  // quais slots do campo e/ou cartas da mão são o ALVO de uma magia, a
  // partir da própria seleção já feita no diálogo (pendingMagic) - é o único
  // lugar que já sabe isso com certeza para cada uma das 7 combinações
  // personagem+tipo que abrem diálogo (Mago J/Q/K, Besta J/Q/K, Anjo Q - ver
  // os ramos do próprio diálogo mais abaixo neste arquivo para os mesmos
  // campos). Anjo J/K não passam por aqui (ativam sem diálogo, sem alvo
  // único a destacar - usam flashSelfEffect em vez disso, ver
  // handleActivateMagicClick acima).
  const computeMagicEffectTargets = (pm: PendingMagic): { slots: Array<{ player: 1 | 2; slotIndex: number }>; cardIds: string[] } => {
    const opponentNumber = opponentOf(pm.playerNumber);
    const slots: Array<{ player: 1 | 2; slotIndex: number }> = [];
    const cardIds: string[] = [];

    if (pm.character === 'mago' && pm.type === 'J') {
      if (pm.selectedCards?.[0]) cardIds.push(pm.selectedCards[0]);
    } else if (pm.character === 'besta' && pm.type === 'J') {
      // FIX (item 8 da 6ª rodada): Recuperação Selvagem da Besta não tinha
      // NENHUM efeito visual - diferente da Revelação Forçada do Mago (J),
      // que é o mesmo tipo de magia (fase de Compra, "pegue carta(s)") mas
      // já estava coberta acima. `pm.selectedCards` já traz até 2 ids de
      // cartas do descarte escolhidas no diálogo (ver o passo "Selecione até
      // 2 cartas do descarte" mais abaixo neste arquivo) - essas mesmas
      // cartas acabam de voltar para a mão, então são o alvo natural do
      // burst.
      if (pm.selectedCards?.length) cardIds.push(...pm.selectedCards);
    } else if ((pm.character === 'mago' || pm.character === 'besta') && pm.type === 'Q') {
      if (pm.selectedSlot !== undefined && pm.selectedTargetPlayer !== undefined) {
        slots.push({ player: pm.selectedTargetPlayer, slotIndex: pm.selectedSlot });
      }
    } else if (pm.character === 'mago' && pm.type === 'K') {
      if (pm.selectedSlot !== undefined) slots.push({ player: opponentNumber, slotIndex: pm.selectedSlot });
    } else if (pm.character === 'besta' && pm.type === 'K') {
      if (pm.selectedSlot !== undefined) slots.push({ player: pm.playerNumber, slotIndex: pm.selectedSlot });
      if (pm.selectedTargetSlot !== undefined) slots.push({ player: opponentNumber, slotIndex: pm.selectedTargetSlot });
    } else if (pm.character === 'anjo' && pm.type === 'Q') {
      if (pm.selectedSlot !== undefined) slots.push({ player: opponentNumber, slotIndex: pm.selectedSlot });
      else if (pm.selectedCards?.[0]) cardIds.push(pm.selectedCards[0]);
    } else if (pm.character === 'mosqueteiro' && (pm.type === 'J' || pm.type === 'Q')) {
      // Tiro de Cobertura/Rajada Reveladora: flash nas cartas descartadas E
      // nas reveladas (Rajada Reveladora) - ambas já são ids concretos
      // (mão própria, do oponente, ou campo do oponente), então cardIds
      // funciona pros dois grupos sem distinção.
      if (pm.selectedCards?.length) cardIds.push(...pm.selectedCards);
      if (pm.selectedRevealCardIds?.length) cardIds.push(...pm.selectedRevealCardIds);
    } else if (pm.character === 'mosqueteiro' && pm.type === 'K') {
      if (pm.selectedCards?.[0]) cardIds.push(pm.selectedCards[0]);
    } else if (pm.character === 'piromante') {
      if (pm.fireballLaunch) {
        // Lançamento da Bola de Fogo: mira o slot único escolhido, ou os 3
        // slots do oponente de uma vez com "Chama Repartida" armada (ver
        // executeFireballLaunch em gameEngine.ts) - usado só para o flash
        // genérico (o burst de fogo de verdade é o FireShatterBurst, ver
        // applyMagicEffectPresentation abaixo).
        const spread = gameState[playerKeyOf(pm.playerNumber)].piromanteSpreadArmed;
        if (spread) {
          for (let i = 0; i < 3; i++) slots.push({ player: opponentNumber, slotIndex: i });
        } else if (pm.selectedTargetSlot !== undefined) {
          slots.push({ player: opponentNumber, slotIndex: pm.selectedTargetSlot });
        }
      } else if (pm.type === 'J') {
        // Combustão: junta TODAS as cartas <5 da própria mão automaticamente
        // (sem seleção manual) - calcula aqui a mesma regra de
        // handleExecuteMagic (gameEngine.ts) só pra saber quais destacar.
        const ownHand = gameState[playerKeyOf(pm.playerNumber)].hand;
        ownHand.forEach((c) => {
          if (c.id !== pm.cardId && isPlainNumeralCard(c) && getEffectiveCardValue(c) < 5) cardIds.push(c.id);
        });
      } else if (pm.selectedCards?.[0]) {
        cardIds.push(pm.selectedCards[0]);
      }
    }
    return { slots, cardIds };
  };

  // FIX (pedido do usuário: "veja se a IA utiliza magias corretamente" +
  // relato de que ativações da IA não tinham nenhum efeito visual) - extraído
  // de dentro de executeMagicEffect (que só cobria o clique humano) para que
  // o mesmo cálculo de alvos/flash/som/estilhaço possa ser reaproveitado
  // também para ações já decididas pela IA (ver triggerAiActionEffects mais
  // abaixo) - uma ÚNICA fonte de verdade para "o que deve acontecer na tela
  // quando ESTA combinação de personagem+magia é executada", não importa
  // quem a ativou.
  const applyMagicEffectPresentation = (pm: PendingMagic) => {
    const { character, type } = pm;
    const targets = computeMagicEffectTargets(pm);
    flashEffectTargets(targets, character, getMagicCardInfo(character, type).name);
    // FIX (pedido do usuário, item 5: "cartas destruídas se estilhaçando") -
    // só a Destruição de Reforço do Mago (K) realmente DESTRÓI uma carta (as
    // outras 8 combinações de J/Q/K revelam ou trocam, nunca destroem) -
    // dispara CardShatterBurst.tsx no lugar do burst normal nesse slot único.
    const isShatterEffect = character === 'mago' && type === 'K' && Boolean(targets.slots[0]);
    if (isShatterEffect) {
      const shatterTarget = targets.slots[0];
      setShatteringSlot(shatterTarget);
      setTimeout(() => setShatteringSlot((prev) => (prev === shatterTarget ? null : prev)), delay(EFFECT_FLASH_DURATION_MS));
    }
    // Piromante (pedido explícito do usuário: "projéteis visualmente indo em
    // direção aos seus alvos" + "carta pegando fogo e se despedaçando") - a
    // Bola de Fogo primeiro VIAJA de verdade (FireballProjectile.tsx, da
    // própria FireballMeter.tsx do jogador até cada slot mirado - inclui
    // slots protegidos/vazios também, o "tiro" é dado mesmo que erre) e SÓ
    // DEPOIS que ela chega (mesmo FIREBALL_TRAVEL_MS usado por
    // dispatchMagicAction abaixo pra atrasar a mudança de verdade no motor)
    // o impacto de verdade (FireShatterBurst.tsx) dispara - nunca em slots
    // protegidos pela Proteção Divina do Anjo (bloqueia por completo, ver
    // isSlotProtected/executeFireballLaunch em gameEngine.ts) nem em slots
    // já vazios (nada pra pegar fogo ali).
    if (character === 'piromante' && pm.fireballLaunch && targets.slots.length > 0) {
      // FIX: o mesmo valor JÁ escalado pela preferência de velocidade de
      // animação (`delay()`) precisa valer tanto pro `setTimeout` que agenda
      // o impacto/dispatch QUANTO pra duração de verdade da animação do
      // projétil (`durationS` abaixo) - senão, com animações mais lentas
      // (Configurações -> "Velocidade de animação"), a bola terminaria de
      // voar antes do impacto realmente disparar (ou o contrário).
      const scaledTravelMs = delay(FIREBALL_TRAVEL_MS);
      const originRect = cardPositionsRef.current.get(`piromante-fireball-p${pm.playerNumber}`);
      if (originRect) {
        const from = { left: originRect.left, top: originRect.top, width: originRect.width, height: originRect.height };
        // FIX (checagem extensa de desempenho): "Chama Repartida" mira os 3
        // slots de uma vez - 3 FireballProjectile.tsx simultâneos, cada um
        // com 8 animações em loop próprias. Reduz o rastro de brasas de
        // cada um (6 -> 3) só quando há mais de 1 alvo, compensando a
        // multiplicação sem reduzir nada no caso comum (lançamento único).
        const emberCount = targets.slots.length > 1 ? 3 : undefined;
        const projectileSpecs: FireballProjectileSpec[] = [];
        for (const t of targets.slots) {
          const targetRect = cardPositionsRef.current.get(`slot-p${t.player}-${t.slotIndex}`);
          if (!targetRect) continue;
          projectileSpecs.push({
            key: `${pm.cardId}-${t.player}-${t.slotIndex}-${gameState.turn}`,
            from,
            to: { left: targetRect.left, top: targetRect.top, width: targetRect.width, height: targetRect.height },
            durationS: scaledTravelMs / 1000,
            emberCount,
          });
        }
        if (projectileSpecs.length > 0) {
          setFireballProjectiles(projectileSpecs);
          setTimeout(() => setFireballProjectiles((prev) => (prev === projectileSpecs ? [] : prev)), scaledTravelMs);
        }
      }

      setTimeout(() => {
        const hitSlots = targets.slots.filter((t) => {
          if (isSlotProtectedFor(t.player, t.slotIndex)) return false;
          const slot = gameState[playerKeyOf(t.player)].field[t.slotIndex];
          return Boolean(slot.faceDownCard) || slot.horizontalCards.length > 0 || (slot.towerReserve?.length ?? 0) > 0;
        });
        if (hitSlots.length > 0) {
          setBurningSlots(hitSlots);
          setTimeout(() => setBurningSlots((prev) => (prev === hitSlots ? [] : prev)), delay(EFFECT_FLASH_DURATION_MS));
        }
      }, scaledTravelMs);
    }
    // FIX (pedido do usuário: "som") - a Destruição de Reforço toca um som de
    // vidro quebrando (card-shatter) em vez do zap genérico de magia, pra
    // combinar com o CardShatterBurst.tsx visual. FIX (pedido do usuário: "o
    // áudio [deve ser] diferente para cada magia e para cada magia de
    // personagem") - as outras 8 combinações tocam o som próprio de
    // personagem+tipo (ver magicSoundFor em soundManager.ts).
    soundManager.play(isShatterEffect ? 'card-shatter' : magicSoundFor(character, type));

    // Mosqueteiro (pedido do usuário: "efeitos visuais de balas sendo
    // disparadas nas cartas que as magias do mosqueteiro utiliza") - um
    // tiro (BulletImpactBurst.tsx) por carta-alvo, além do flash genérico
    // acima - `targets.cardIds` já cobre Valete/Rainha/Rei do Mosqueteiro
    // (ver computeMagicEffectTargets), e cada posição de tela vem do mesmo
    // `cardPositionsRef` que FlyingDiscardCard.tsx/ReactionNegatedBurst.tsx
    // já usam. Com mais de 1 alvo de uma vez (Rajada Reveladora pode acertar
    // até 3), os tiros disparam escalonados, como uma rajada de verdade.
    if (character === 'mosqueteiro' && targets.cardIds.length > 0) {
      const burstId = `${pm.cardId}-${Date.now()}`;
      // Pedido explícito do usuário: "projéteis visualmente indo em direção
      // aos seus alvos para o... mosqueteiro" - a própria carta mágica que
      // ele acabou de ativar (ainda na mão neste instante, ver
      // cardPositionsRef) é a origem real do tiro, em vez de nascer do nada
      // na borda da tela.
      const casterRect = cardPositionsRef.current.get(pm.cardId);
      const fromRect = casterRect ? { left: casterRect.left, top: casterRect.top, width: casterRect.width, height: casterRect.height } : undefined;
      const rawSpecs: (BulletImpactSpec | null)[] = targets.cardIds.map((cardId, idx) => {
        const rect = cardPositionsRef.current.get(cardId);
        if (!rect) return null;
        return {
          key: `${burstId}-${cardId}`,
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          delay: idx * 0.12,
          from: fromRect,
        };
      });
      const specs: BulletImpactSpec[] = rawSpecs.filter((s): s is BulletImpactSpec => s !== null);
      if (specs.length > 0) {
        setBulletImpacts(specs);
        setTimeout(() => setBulletImpacts((prev) => (prev === specs ? [] : prev)), delay(900 + specs.length * 120));
      }
    }
  };

  /**
   * Piromante (personagem novo, pedido do usuário: "as magias do piromante
   * mal tem efeitos visuais, especialmente quanto a cartas queimar") - as 3
   * magias de efeito próprio (Combustão/Roubo Flamejante/Queima do Reforço)
   * QUEIMAM uma carta e a removem de campo/mão no MESMO dispatch que
   * dispara o flash (CharacterMagicBurst, ver applyMagicEffectPresentation).
   * Como React já teria re-renderizado com a carta REMOVIDA do array (mão
   * ou horizontalCards) antes do burst ter qualquer chance de aparecer, o
   * elemento que hospedaria o CharacterMagicBurst nunca chega a montar com
   * `active=true` - o fogo "queima uma carta que já não existe mais". Só as
   * outras 3 magias do jogo que DESTROEM uma carta em vez de revelar/trocar
   * (Destruição de Reforço do Mago) evitam esse problema porque miram um
   * SLOT inteiro (container estável, sempre existe, só troca de conteúdo) -
   * as 3 do Piromante miram uma CARTA específica (mão ou horizontal), cujo
   * próprio container de fato desaparece. Por isso, só para essas 3 magias,
   * o dispatch que aplica a mudança de verdade (removendo a carta) espera o
   * tempo do próprio burst passar primeiro - a carta fica visível "pegando
   * fogo" por um instante antes de sumir de vez. Lançamentos da Bola de Fogo
   * (fireballLaunch) continuam imediatos - miram um slot (FireShatterBurst),
   * sem esse problema.
   */
  const dispatchMagicAction = (action: GameAction) => {
    const isPiromante = action.type === 'EXECUTE_MAGIC' && action.character === 'piromante';
    if (isPiromante && !action.selection.fireballLaunch) {
      // Combustão/Roubo Flamejante/Queima do Reforço: ver o comentário
      // completo acima da definição desta função (a carta queimada some do
      // estado no MESMO dispatch que dispara o flash - sem este atraso, o
      // burst nunca teria um quadro pra aparecer antes da carta sumir).
      setTimeout(() => dispatch(action), delay(450));
    } else if (isPiromante && action.selection.fireballLaunch) {
      // Lançamento da Bola de Fogo: pedido explícito do usuário ("projéteis
      // visualmente indo em direção aos seus alvos") - a mudança de verdade
      // no motor (obliterar/reduzir o slot) só acontece depois que a bola
      // visivelmente CHEGA no alvo (FireballProjectile.tsx, mesmo
      // FIREBALL_TRAVEL_MS usado lá em applyMagicEffectPresentation).
      setTimeout(() => dispatch(action), delay(FIREBALL_TRAVEL_MS));
    } else {
      dispatch(action);
    }
  };

  /**
   * FIX (pedido do usuário: "arraste sua magia até o campo do alvo... pra
   * ativar mais rápido") - `override` deixa o atalho de arrastar-e-soltar
   * (`handleMagicCardDrop` abaixo) montar a `PendingMagic` inteira direto do
   * slot largado e reaproveitar TODA a apresentação/dispatch existente
   * (flash/som/estilhaço/projétil, e o mesmo respeito ao Modo Reações) sem
   * duplicar nada - só pula o diálogo em si. Sem `override` (o fluxo normal
   * de clique-clique-confirmar), continua lendo do estado `pendingMagic` e
   * fechando o diálogo no final, exatamente como antes.
   */
  const executeMagicEffect = (override?: PendingMagic) => {
    const pm = override ?? pendingMagic;
    if (!pm) return;
    const { playerNumber, cardId, type, character, selectedCards, selectedSlot: pSlot, selectedTargetPlayer, selectedTargetSlot, selectedRevealCardIds, fireballLaunch, druidaGrowBroto } = pm;
    const selection: MagicSelection = { selectedCards, selectedSlot: pSlot, selectedTargetPlayer, selectedTargetSlot, selectedRevealCardIds, fireballLaunch, druidaGrowBroto };
    // FIX (checagem extensa por bugs - burst fantasma/duplicado no Modo
    // Reações): ver canMagicTriggerReactionAnnouncement em gameEngine.ts -
    // se esta ativação for na verdade só um ANÚNCIO (efeito represado em
    // pendingReaction, oponente ainda pode negar), a apresentação NÃO toca
    // aqui - só depois, no mesmo caminho que já trata a resolução da reação
    // (negada -> nenhum burst, correto; expira sem reação -> o timer de 3s
    // em GameBoard.tsx já dispara a apresentação exatamente uma vez).
    if (!canMagicTriggerReactionAnnouncement(gameState, playerNumber, cardId)) {
      applyMagicEffectPresentation(pm);
    }
    dispatchMagicAction({ type: 'EXECUTE_MAGIC', player: playerNumber, cardId, character, magicType: type, selection });
    if (!override) setPendingMagic(null);
  };

  /**
   * FIX (pedido do usuário: "arraste sua magia até o campo do alvo para
   * ativar ela... isso é pra ser uma feature pra outros personagens também
   * que possuem alvos escolhíveis") - atalho genérico de arrastar-e-soltar:
   * consulta `dragActivation.ts` (a ÚNICA fonte de verdade de quais
   * personagem+magia têm alvo simples o bastante - "só 1 slot de campo" -
   * pra isso) em vez de qualquer lógica hardcoded aqui. `slotIndex`/
   * `dropPlayerNumber` são o slot ONDE a carta foi largada (pode ser o
   * campo do próprio jogador OU do oponente, dependendo da regra) - nunca
   * confia que o drop já é válido: refaz a MESMA checagem de
   * `isValidSlotTarget` usada pra decidir se o slot aceitava o drop (ver
   * FieldSlotView.tsx/isMagicDropTarget), porque o estado pode ter mudado
   * entre o "pode soltar aqui" visual e o instante real da soltura.
   */
  /**
   * Verdade quando `card` (arrastada de ALGUMA mão - descobre de qual
   * procurando nas duas) pode ser ativada agora largando-a no slot
   * `slotPlayerNumber`/`slotIndex` - a MESMA checagem usada tanto pra
   * decidir se este slot aceita o drop (destaque visual em FieldSlotView,
   * chamada a cada frame do arraste) quanto pra validar de verdade no
   * instante da soltura (handleMagicCardDrop abaixo) - nunca duas cópias da
   * mesma regra podendo divergir.
   */
  const isMagicDropTarget = (slotPlayerNumber: 1 | 2, slotIndex: number, card: Card): boolean => {
    if (card.value !== 'J' && card.value !== 'Q' && card.value !== 'K') return false;
    const ownerPlayerNumber: 1 | 2 = gameState.player1.hand.some((c) => c.id === card.id) ? 1 : 2;
    if (isAi(ownerPlayerNumber)) return false;
    const character = characterOf(gameState, ownerPlayerNumber);
    const magicType = card.value as MagicCardType;
    const rule = getDragActivationRule(character, magicType);
    if (!rule) return false;
    const expectedDropSide: 1 | 2 = rule.side === 'own' ? ownerPlayerNumber : opponentOf(ownerPlayerNumber);
    if (slotPlayerNumber !== expectedDropSide) return false;
    if (!canActivateMagic(gameState.phase, character, magicType, getMagicActivationContext(gameState, ownerPlayerNumber))) return false;
    return rule.isValidSlotTarget(gameState, ownerPlayerNumber, slotIndex);
  };

  /**
   * FIX (pedido do usuário: "arraste sua magia até o campo do alvo para
   * ativar ela") - `PlayerZone.tsx` (a mão) decide SE mostra a carta como
   * arrastável olhando só pra ela mesma (fase, personagem, se é magia) - não
   * tem acesso ao campo do OPONENTE, que é onde a maioria das regras de
   * `dragActivation.ts` mira. Esta função fecha essa lacuna: verdade quando
   * `card` tem uma `DragActivationRule` aplicável agora E existe PELO MENOS
   * 1 slot válido do lado que a regra espera (own/opponent) - se não houver
   * nenhum alvo possível (ex.: fireball do Piromante fora da fase de
   * combate, ou nenhum slot inimigo elegível agora), a carta continua
   * arrastável pelo fluxo normal de clique (se aplicável), só não pelo
   * atalho de arrastar-e-soltar.
   */
  const isMagicCardDraggable = (ownerPlayerNumber: 1 | 2, card: Card): boolean => {
    if (card.value !== 'J' && card.value !== 'Q' && card.value !== 'K') return false;
    if (isAi(ownerPlayerNumber)) return false;
    const character = characterOf(gameState, ownerPlayerNumber);
    const magicType = card.value as MagicCardType;
    const rule = getDragActivationRule(character, magicType);
    if (!rule) return false;
    if (!canActivateMagic(gameState.phase, character, magicType, getMagicActivationContext(gameState, ownerPlayerNumber))) return false;
    const targetSide: 1 | 2 = rule.side === 'own' ? ownerPlayerNumber : opponentOf(ownerPlayerNumber);
    const fieldLength = gameState[playerKeyOf(targetSide)].field.length;
    for (let i = 0; i < fieldLength; i += 1) {
      if (rule.isValidSlotTarget(gameState, ownerPlayerNumber, i)) return true;
    }
    return false;
  };

  /**
   * FIX (pedido do usuário: "arraste sua magia até o campo do alvo para
   * ativar ela... isso é pra ser uma feature pra outros personagens também
   * que possuem alvos escolhíveis") - atalho genérico de arrastar-e-soltar:
   * consulta `dragActivation.ts` (a ÚNICA fonte de verdade de quais
   * personagem+magia têm alvo simples o bastante - "só 1 slot de campo" -
   * pra isso) em vez de qualquer lógica hardcoded aqui. Nunca confia que o
   * drop já era válido no momento em que o destaque visual apareceu -
   * `isMagicDropTarget` acima é chamada de novo aqui, contra o estado ATUAL
   * (pode ter mudado entre o início do arraste e a soltura de verdade).
   */
  const handleMagicCardDrop = (dropPlayerNumber: 1 | 2, slotIndex: number, cardId: string) => {
    const ownerPlayerNumber: 1 | 2 = gameState.player1.hand.some((c) => c.id === cardId) ? 1 : 2;
    const card = gameState[playerKeyOf(ownerPlayerNumber)].hand.find((c) => c.id === cardId);
    if (!card || !isMagicDropTarget(dropPlayerNumber, slotIndex, card)) return;
    const character = characterOf(gameState, ownerPlayerNumber);
    const magicType = card.value as MagicCardType;
    const rule = getDragActivationRule(character, magicType)!;

    const selection = rule.buildSelection(gameState, ownerPlayerNumber, slotIndex);
    executeMagicEffect({
      playerNumber: ownerPlayerNumber,
      cardId,
      type: magicType,
      character,
      selectedCards: selection.selectedCards,
      selectedSlot: selection.selectedSlot,
      selectedTargetPlayer: selection.selectedTargetPlayer,
      selectedTargetSlot: selection.selectedTargetSlot,
      selectedRevealCardIds: selection.selectedRevealCardIds,
      fireballLaunch: selection.fireballLaunch,
    });
  };

  /**
   * FIX (pedido do usuário: relato de que a IA ativando magias não
   * reproduzia nenhum efeito visual, só a notificação/toast) - a IA nunca
   * passa pelos handlers de clique acima (handleActivateMagicClick,
   * executeMagicEffect, executeMonsterEffect etc.), que são quem de fato
   * dispara flashEffectTargets/flashSelfEffect/som/CardShatterBurst/roleta
   * do Ás - ela despacha a `GameAction` já pronta direto no reducer (ver o
   * useEffect da IA acima). A notificação (toast) continuava aparecendo
   * porque ela observa o LOG do estado (gameState.log, preenchido pelo
   * PRÓPRIO reducer independente de quem despachou), não o dispatch em si -
   * daí só ela sobreviver para ações da IA. Esta função replica, a partir da
   * ação já decidida (chamada ANTES do dispatch, com o estado ATUAL - mesma
   * ordem que os handlers humanos já usavam), a apresentação equivalente -
   * cobre exatamente os mesmos 5 tipos de ação que os handlers humanos já
   * tratavam (as demais, como DRAW_CARDS/PLAY_CARD/SELECT_COMBAT_SLOT, nunca
   * tiveram efeito visual próprio nem para cliques humanos).
   */
  const triggerAiActionEffects = (action: GameAction) => {
    if (action.type === 'EXECUTE_MAGIC') {
      applyMagicEffectPresentation({
        playerNumber: action.player,
        cardId: action.cardId,
        type: action.magicType,
        character: action.character,
        selectedCards: action.selection.selectedCards,
        selectedSlot: action.selection.selectedSlot,
        selectedTargetPlayer: action.selection.selectedTargetPlayer,
        selectedTargetSlot: action.selection.selectedTargetSlot,
        selectedRevealCardIds: action.selection.selectedRevealCardIds,
        fireballLaunch: action.selection.fireballLaunch,
        druidaGrowBroto: action.selection.druidaGrowBroto,
      });
    } else if (action.type === 'ACTIVATE_SIMPLE_MAGIC') {
      // Só usada pelo Anjo J (Bênção Divina) e K (Reforço Angelical) - as
      // únicas 2 magias sem alvo (ver handleActivateMagicClick) - mesmo
      // burst genérico "autolançado" no próprio jogador.
      const character = characterOf(gameState, action.player);
      const card = gameState[playerKeyOf(action.player)].hand.find((c) => c.id === action.cardId);
      if (card && (card.value === 'J' || card.value === 'K')) {
        flashSelfEffect(action.player, character, getMagicCardInfo(character, card.value).name);
        soundManager.play(magicSoundFor(character, card.value));
      } else {
        soundManager.play('magic-activate');
      }
    } else if (action.type === 'ACTIVATE_MONSTER_EFFECT_SIMPLE') {
      const character = characterOf(gameState, action.player);
      const slots =
        action.targetSlotIndex !== undefined
          ? [{ player: action.player, slotIndex: action.targetSlotIndex }]
          : [0, 1, 2].map((slotIndex) => ({ player: action.player, slotIndex })); // Proteção Divina do Anjo: campo inteiro, sem slot único.
      flashEffectTargets({ slots }, character, getMonsterEffect(character).name);
      soundManager.play(monsterSoundFor(character));
    } else if (action.type === 'EXECUTE_MAGO_MONSTER_EFFECT') {
      flashEffectTargets(
        { slots: [{ player: action.player, slotIndex: action.targetSlotIndex }] },
        'mago',
        getMonsterEffect('mago').name
      );
      soundManager.play(monsterSoundFor('mago'));
    } else if (action.type === 'TRANSFORM_CORINGA_MAGIC_CARD') {
      const character = characterOf(gameState, action.player);
      flashSelfEffect(action.player, character, 'Mão de Ferro');
      soundManager.play(numeralSoundFor('coringa'));
    } else if (action.type === 'TRANSFORM_ACE') {
      setAceTransformFlashCardId(action.aceCardId);
      setTimeout(() => setAceTransformFlashCardId(null), delay(EFFECT_FLASH_DURATION_MS));
      setTimeout(() => soundManager.play('ace-transform'), delay(ROULETTE_DURATION_MS));
    }
  };

  // FIX (itens 4 e 7 da 3ª rodada): o Monstro deixou de ocupar um dos 3 slots
  // de combate (por isso não há mais um "slotIndex" próprio para clicar em
  // cima) - agora ele vive na zona própria (ver BattleField.tsx) e ativar seu
  // efeito é um fluxo de 2 cliques: 1) clicar na zona (aqui) inicia a escolha
  // do slot de combate alvo; 2) clicar num dos 3 slots do PRÓPRIO campo (ver
  // handleFieldSlotClick abaixo, ramo `pendingMonsterTarget`) confirma o alvo
  // e ativa o efeito (Besta/Anjo direto; Mago abre o diálogo de Ilusão
  // Arcana, que também precisa da carta-fonte).
  const handleMonsterZoneClick = (playerNumber: 1 | 2) => {
    if (isAi(playerNumber)) return; // a IA cuida da própria zona sozinha
    const playerState = gameState[playerKeyOf(playerNumber)];

    // Zona já tem um Monstro pronto (ainda não usado neste turno): começa a
    // escolha do slot alvo (ou cancela, se já estava escolhendo).
    // FIX (checagem extensa por bugs - consolidação de regra duplicada): usa
    // `canActivateMonsterEffect` (gameEngine.ts), a MESMA função que os 2
    // handlers do motor usam - antes este clique só conferia `!monsterUsed`,
    // sem o `monsterUseCount >= MAX_MONSTER_USES` (seguro hoje pela mesma
    // garantia indireta de handlePlaceMonsterCard/resolveMonsterCardAtTurnEnd,
    // mas duplicada e frouxa aqui).
    if (canActivateMonsterEffect(gameState, playerNumber)) {
      if (gameState.phase !== 'strategy' && gameState.phase !== 'combat') return;

      // FIX (pedido do usuário): a Proteção Divina do Anjo passou a proteger
      // o campo INTEIRO de uma vez (ver isSlotProtected em gameEngine.ts) -
      // não faz mais sentido pedir pra escolher um slot alvo, então ativa
      // direto num único clique na própria zona, sem entrar no fluxo de
      // pendingMonsterTarget (que continua existindo só para Mago/Besta).
      const character = characterOf(gameState, playerNumber);
      if (character === 'anjo') {
        flashEffectTargets(
          { slots: [0, 1, 2].map((slotIndex) => ({ player: playerNumber, slotIndex })) },
          character,
          getMonsterEffect(character).name
        );
        dispatch({ type: 'ACTIVATE_MONSTER_EFFECT_SIMPLE', player: playerNumber });
        soundManager.play(monsterSoundFor(character));
        setPendingMonsterTarget(null);
        return;
      }

      // FIX (bug real relatado pelo usuário: "a carta monstro do piromante
      // nunca ativa quando clica, ela pede pra clicar no campo mas quando
      // clica nada acontece") - Brasa (Piromante) TAMBÉM ativa direto, sem
      // escolher slot nenhum (só soma 5 na própria Bola de Fogo - ver
      // handleActivateMonsterEffectSimple/gameEngine.ts) - mas nunca tinha
      // sido adicionada aqui, então o clique caía no fluxo padrão
      // (pendingMonsterTarget), que só sabe tratar Mago/Besta em
      // handleFieldSlotClick - um clique no campo depois disso não batia em
      // nenhum `if` ali e só limpava o estado pendente em silêncio, sem
      // nunca despachar a ativação. Mesmo padrão do Anjo acima: sem alvo de
      // campo pra destacar, usa flashSelfEffect (mesmo burst "algo
      // aconteceu com este jogador" que J/K do Anjo já usam).
      if (character === 'piromante') {
        flashSelfEffect(playerNumber, character, getMonsterEffect(character).name);
        dispatch({ type: 'ACTIVATE_MONSTER_EFFECT_SIMPLE', player: playerNumber });
        soundManager.play(monsterSoundFor(character));
        setPendingMonsterTarget(null);
        return;
      }

      // Coringa (redesenho completo) nunca chega aqui - sua carta Monstro
      // nunca ocupa a Zona Monstro (ver handlePlaceMonsterCard,
      // gameEngine.ts), então `canActivateMonsterEffect` nunca é true pra
      // ele.
      setSelectedCardId(null);
      setSelectedSlot(null);
      setPendingMonsterTarget((prev) => (prev?.playerNumber === playerNumber ? null : { playerNumber }));
      return;
    }

    // Zona vazia: se uma carta Monstro da mão estiver selecionada, posiciona-a ali.
    if (!playerState.monsterCard && gameState.phase === 'strategy' && selectedCardId) {
      const card = playerState.hand.find((c) => c.id === selectedCardId);
      // FIX (checagem extensa por bugs): um Coringa que já esgotou
      // MAX_MONSTER_USES (monsterUseCount nunca reseta, mas pode voltar a
      // circular via descarte/reembaralhamento) é rejeitado por
      // handlePlaceMonsterCard (gameEngine.ts) - sem esta checagem aqui, o
      // clique parecia funcionar (carta some da mão? não, mas nada
      // acontecia e nenhum feedback explicava o motivo).
      // Coringa (redesenho completo, pedido do usuário) - a carta Monstro
      // dele nunca vai pra Zona Monstro (ver handlePlaceMonsterCard,
      // gameEngine.ts) - é tratada como uma carta de número 15, posicionada
      // no campo normal (PLAY_CARD/SWAP_FIELD_CARD). Clicar/soltar na Zona
      // Monstro com ela selecionada é sempre rejeitado, com o mesmo feedback
      // visual de "carta errada pra este lugar" já usado abaixo.
      const isCoringaMonster = card?.isMonster && characterOf(gameState, playerNumber) === 'coringa';
      if (card?.isMonster && !isCoringaMonster && (card.monsterUseCount ?? 0) < MAX_MONSTER_USES) {
        dispatch({ type: 'PLACE_MONSTER_CARD', player: playerNumber, cardId: selectedCardId });
        soundManager.play('card-play');
        setSelectedCardId(null);
      } else {
        // FIX (item 3 da 6ª rodada): tentou posicionar uma carta de número
        // (não Monstro) na Zona Monstro clicando nela já selecionada -
        // rejeita com tremor + flash vermelho na própria carta na mão, e
        // desmarca a seleção (ela nunca chegou a sair da mão de verdade).
        flashRejectedCard(selectedCardId);
        setSelectedCardId(null);
      }
    }
  };

  // FIX (item 2): permite soltar (drag-and-drop) uma carta Monstro arrastada
  // da mão diretamente sobre a zona própria, além do fluxo por clique.
  const handleMonsterCardDrop = (playerNumber: 1 | 2, cardId: string) => {
    if (isAi(playerNumber)) return;
    const card = gameState[playerKeyOf(playerNumber)].hand.find((c) => c.id === cardId);
    // FIX (checagem extensa por bugs): mesma guarda do fluxo por clique
    // acima - uma carta já esgotada (monsterUseCount >= MAX_MONSTER_USES) é
    // rejeitada aqui, com o mesmo feedback visual de rejeição. Coringa
    // (redesenho completo) também é sempre rejeitado aqui - sua carta
    // Monstro nunca vai pra Zona Monstro.
    if (!card?.isMonster || characterOf(gameState, playerNumber) === 'coringa' || (card.monsterUseCount ?? 0) >= MAX_MONSTER_USES) {
      // FIX (item 3 da 6ª rodada): mesma rejeição visual do fluxo por
      // clique acima, agora para quando a carta de número é ARRASTADA até a
      // Zona Monstro.
      flashRejectedCard(cardId);
      return;
    }
    dispatch({ type: 'PLACE_MONSTER_CARD', player: playerNumber, cardId });
    soundManager.play('card-play');
    setSelectedCardId(null);
  };

  const executeMonsterEffect = (targetCardId: string) => {
    if (!pendingMonsterEffect) return;
    // FIX (item 5 da 4ª rodada): mesmo efeito visual das magias, aplicado ao
    // slot que recebeu o valor copiado pela Ilusão Arcana do Mago.
    const character = characterOf(gameState, pendingMonsterEffect.playerNumber);
    flashEffectTargets(
      { slots: [{ player: pendingMonsterEffect.playerNumber, slotIndex: pendingMonsterEffect.targetSlotIndex }] },
      character,
      getMonsterEffect(character).name
    );
    dispatch({
      type: 'EXECUTE_MAGO_MONSTER_EFFECT',
      player: pendingMonsterEffect.playerNumber,
      targetSlotIndex: pendingMonsterEffect.targetSlotIndex,
      targetCardId,
    });
    soundManager.play(monsterSoundFor(character));
    setPendingMonsterEffect(null);
  };

  // FIX (pedido do usuário): Besta - Fúria Selvagem, quando o slot alvo tem
  // mais de 1 carta (principal + horizontal(is)) e por isso precisa de um
  // passo extra para escolher qual delas dobrar (ver pendingBestaMonsterTarget).
  const executeBestaMonsterEffect = (targetCardId: string) => {
    if (!pendingBestaMonsterTarget) return;
    const character = characterOf(gameState, pendingBestaMonsterTarget.playerNumber);
    flashEffectTargets(
      { slots: [{ player: pendingBestaMonsterTarget.playerNumber, slotIndex: pendingBestaMonsterTarget.targetSlotIndex }] },
      character,
      getMonsterEffect(character).name
    );
    dispatch({
      type: 'ACTIVATE_MONSTER_EFFECT_SIMPLE',
      player: pendingBestaMonsterTarget.playerNumber,
      targetSlotIndex: pendingBestaMonsterTarget.targetSlotIndex,
      targetCardId,
    });
    soundManager.play(monsterSoundFor(character));
    setPendingBestaMonsterTarget(null);
  };

  // FIX (item 8 da 6ª rodada): "os efeitos de magia mal são perceptíveis...
  // as que não possuem, adicione" - as 3 Magias Numerais (Mago/Besta/Anjo)
  // não tinham NENHUM efeito visual ao ativar. O próprio mecanismo (ver
  // handleActivateNumeralSpell em gameEngine.ts) já garante que o campo do
  // jogador está vazio antes de ativar (é um dos requisitos) e sempre
  // posiciona as 3 cartas usadas nos slots 0, 1 e 2 do PRÓPRIO campo -
  // então, ao contrário das magias comuns, o alvo aqui é conhecido de
  // antemão sem precisar de nenhuma seleção prévia: são sempre esses 3 slots
  // de quem está ativando.
  // FIX (pedido do usuário: "o efeito visual da magia numeral está dando
  // lag quando ativa") - antes chamava flashEffectTargets com os 3 slots do
  // PRÓPRIO campo de uma vez, o que montava 3 CharacterMagicBurst +
  // 3 MagicCalloutLabel simultâneos - MAIS caro que qualquer magia comum
  // (no máximo 2 alvos) - ao mesmo tempo que o ArenaMagicBurst.tsx (tela
  // inteira, já é o "grande momento" da Magia Numeral), o Diálogo de popup
  // (showNumeralSpellPopup) e o screen shake/ChromaticFlash (ver o useEffect
  // que observa numeralSpellPending) - tudo isso de uma vez é o combo mais
  // pesado do jogo. As 3 cartas usadas somem (vão para o descarte) segundos
  // depois de qualquer forma, então um burst local em cada uma tinha valor
  // baixo. Agora usa flashSelfEffect (mesmo burst único e "barato" já usado
  // pelas magias sem alvo do Anjo) - mantém ArenaMagicBurst.tsx como o
  // efeito principal, só sem triplicar o custo local.
  const handleActivateNumeralSpell = (playerNumber: 1 | 2) => {
    const character = characterOf(gameState, playerNumber);
    flashSelfEffect(playerNumber, character, getNumeralSpellInfo(character).name);
    dispatch({ type: 'ACTIVATE_NUMERAL_SPELL', player: playerNumber });
  };

  const handleFieldSlotClick = (playerNumber: 1 | 2, slotIndex: number) => {
    if (isAi(playerNumber)) return; // o campo da IA só é controlado por ela mesma

    // FIX (itens 4 e 7): enquanto o jogador está escolhendo o slot alvo para
    // ativar o efeito do Monstro (ver handleMonsterZoneClick), um clique num
    // slot do PRÓPRIO campo escolhe esse alvo em vez de repetir o fluxo
    // normal de posicionar carta / selecionar slot de combate.
    if (pendingMonsterTarget && pendingMonsterTarget.playerNumber === playerNumber) {
      const character = characterOf(gameState, playerNumber);
      if (character === 'mago') {
        // FIX (checagem extensa por bugs): handleExecuteMagoMonsterEffect
        // (gameEngine.ts) só aceita um slot alvo com carta numeral comum
        // (`isPlainNumeralCard` - exclui vazio, Ás, magia, Monstro), mas este
        // clique abria o diálogo de escolha de carta-fonte pra QUALQUER slot,
        // mesmo um inválido - o jogador escolhia uma carta, via o flash/som
        // de "sucesso" (executeMonsterEffect dispara isso ANTES do dispatch),
        // e só depois descobria que nada mudou de verdade (rejeição
        // silenciosa do motor). Agora valida aqui primeiro, com a mesma
        // rejeição visual (`flashRejectedCard`) já usada no fluxo de arrastar
        // uma carta Monstro pro lugar errado, alguns FIX acima.
        const targetSlot = gameState[playerKeyOf(playerNumber)].field[slotIndex];
        const targetCard = targetSlot.faceDownCard;
        if (!targetCard || !isPlainNumeralCard(targetCard)) {
          if (targetCard) flashRejectedCard(targetCard.id);
        } else {
          setPendingMonsterEffect({ playerNumber, targetSlotIndex: slotIndex });
        }
      } else if (character === 'besta') {
        // FIX (pedido do usuário): a Fúria Selvagem agora dobra uma carta
        // ESPECÍFICA do slot (a principal ou uma horizontal), não mais "a
        // soma das horizontais do slot". Com só 1 carta no slot, não há
        // ambiguidade - ativa direto. Com mais de 1, abre um diálogo curto
        // para escolher qual delas dobrar (ver pendingBestaMonsterTarget).
        const slot = gameState[playerKeyOf(playerNumber)].field[slotIndex];
        const candidates = [slot.faceDownCard, ...slot.horizontalCards].filter((c): c is Card => Boolean(c));
        if (candidates.length === 1) {
          flashEffectTargets({ slots: [{ player: playerNumber, slotIndex }] }, character, getMonsterEffect(character).name);
          dispatch({ type: 'ACTIVATE_MONSTER_EFFECT_SIMPLE', player: playerNumber, targetSlotIndex: slotIndex, targetCardId: candidates[0].id });
          soundManager.play(monsterSoundFor(character));
        } else if (candidates.length > 1) {
          setPendingBestaMonsterTarget({ playerNumber, targetSlotIndex: slotIndex });
        }
        // slot vazio (candidates.length === 0): nada pra dobrar, ignora o clique.
      }
      // Anjo nunca chega aqui: sua Proteção Divina ativa direto no clique da
      // Zona Monstro (ver handleMonsterZoneClick), sem passar por
      // pendingMonsterTarget - protege o campo inteiro, então não há slot
      // pra escolher.
      setPendingMonsterTarget(null);
      return;
    }

    if (gameState.phase === 'strategy' && selectedCardId) {
      // FIX (item 7): uma carta Monstro selecionada nunca é posicionada num
      // slot de combate normal (só na zona própria - ver
      // handleMonsterZoneClick) - clicar num slot com ela selecionada não faz
      // nada, em vez de abrir um menu "Posicionar" que o motor só recusaria.
      const selected = gameState[playerKeyOf(playerNumber)].hand.find((c) => c.id === selectedCardId);
      if (selected?.isMonster) return;
      setSelectedSlot({ player: playerNumber, slot: slotIndex });
    } else if (gameState.phase === 'strategy' && selectedForTower.size > 0) {
      // Modo Towers: sem carta única selecionada, mas com 1+ cartas
      // marcadas pra torre (Ctrl/Shift+clique) - o clique no slot escolhe o
      // alvo, e o botão "Towers" (que aparece na mesma área de
      // Posicionar/Horizontal) confirma de fato.
      setSelectedSlot({ player: playerNumber, slot: slotIndex });
    } else if (gameState.phase === 'combat') {
      dispatch({ type: 'SELECT_COMBAT_SLOT', player: playerNumber, slotIndex });
    }
  };

  const handleFieldSlotDoubleClick = (playerNumber: 1 | 2, slotIndex: number) => {
    if (isAi(playerNumber)) return;
    if (gameState.phase === 'strategy') {
      dispatch({ type: 'RETURN_CARD_TO_HAND', player: playerNumber, slotIndex });
    }
  };

  // FIX (item 2): solta (drop) uma carta arrastada da mão diretamente sobre
  // um slot do campo - despacha a mesma ação PLAY_CARD que o fluxo por
  // clique já usa, então passa pelas mesmas validações do motor de regras.
  const handleCardDrop = (playerNumber: 1 | 2, slotIndex: number, cardId: string, asHorizontal: boolean) => {
    if (isAi(playerNumber)) return;
    handlePlayCard(playerNumber, cardId, slotIndex, asHorizontal);
  };

  // FIX (item 9 da 6ª rodada): "adicione a opção de remover a carta
  // horizontal de cima de outra carta, clicando onde normalmente sua
  // indicação visual é posicionada" - ver RETURN_HORIZONTAL_CARD_TO_HAND em
  // gameEngine.ts (remove só essa carta, mantém a principal e a outra
  // horizontal se houver 2) e o onClick na própria sobreposição em
  // BattleField.tsx.
  const handleRemoveHorizontalCard = (playerNumber: 1 | 2, slotIndex: number, cardId: string) => {
    if (isAi(playerNumber)) return;
    dispatch({ type: 'RETURN_HORIZONTAL_CARD_TO_HAND', player: playerNumber, slotIndex, cardId });
    soundManager.play('card-play');
  };

  const handleToggleReady = (playerNumber: 1 | 2) => {
    dispatch({ type: 'TOGGLE_READY', player: playerNumber });
  };

  const handleRematch = () => {
    dispatch({ type: 'REMATCH' });
    setShowRematchDialog(false);
    setSelectedCardId(null);
    setSelectedSlot(null);
    setSelectedForDiscard(new Set());
    setShowDiscardPile(false);
  };

  const isSlotProtectedFor = (playerNumber: 1 | 2, slotIndex: number) => isSlotProtected(gameState, playerNumber, slotIndex);

  const [zoomContainerEl, setZoomContainerEl] = useState<HTMLDivElement | null>(null);
  // FIX (pedido do usuário: "tamanho da carta / zoom da interface") - ver o
  // comentário completo no `style` do wrapper mais abaixo.
  const interfaceZoomFactor = settings.interfaceZoom / 100;
  // FIX (pedido do usuário: "ocultar mão do oponente automaticamente" no
  // Hotseat) - ver o comentário completo em `hotseatPrivacyActive`,
  // PlayerZone.tsx.
  const hotseatPrivacyActive = gameConfig.mode === 'hotseat' && settings.hotseatPrivacyMode;

  const winnerVictoryColor = gameState.gameOver
    ? (gameState.gameOver.winner === 1 ? p1Theme.primary : p2Theme.primary)
    : '#C59E4F';

  // FIX (pedido do usuário: "separar sempre visível de condicional" na
  // barra superior) - junta Vira Primeiro/Spotlight/Magia Numeral Ativa
  // (cada um só existe às vezes) numa lista só, consumida pelo Popover
  // "N efeitos ativos" logo abaixo - o CONTEÚDO de cada item é o mesmo
  // de antes (só sem o hover-tooltip, que fazia menos sentido dentro de
  // um Popover já aberto por clique).
  const activeHeaderEffects: { key: string; node: ReactNode }[] = [];
  if (gameState.phase === 'combat') {
    activeHeaderEffects.push({
      key: 'first-to-flip',
      node: (
        <p key="first-to-flip" className="text-[11px] text-[#EFE7D6]">
          <span className="text-[#C59E4F] font-semibold">Vira primeiro:</span>{' '}
          {gameState.firstToFlip === 1 ? p1Theme.name : p2Theme.name}
        </p>
      ),
    });
  }
  if (gameState.spotlight) {
    activeHeaderEffects.push({
      key: 'spotlight',
      node: (
        <div key="spotlight" className="space-y-1">
          <p className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: '#C59E4F' }}>
            <Box className="w-3 h-3" /> Spotlight deste turno
          </p>
          <ul className="text-[11px] text-[#EFE7D6] space-y-0.5 pl-1">
            {gameState.spotlight.numbers.map((n) => (
              <li key={n.value}>
                <span style={{ color: n.polarity === 'positive' ? '#F2C94C' : '#8A5A5A' }}>
                  {n.value}
                  {n.polarity === 'positive' ? '↑' : '↓'}
                </span>{' '}
                — {n.polarity === 'positive' ? 'vale 3x mais' : 'valor fixo em 1'} (combate, Magia Numeral, Torres)
              </li>
            ))}
          </ul>
        </div>
      ),
    });
  }
  ([1, 2] as const).forEach((p) => {
    const entry = gameState.activeNumeralSpells[p];
    if (!entry) return;
    const info = getNumeralSpellInfo(entry.character);
    activeHeaderEffects.push({
      key: `numeral-${p}`,
      node: (
        <div key={`numeral-${p}`} className="space-y-0.5">
          <p className="text-[11px] font-semibold" style={{ color: '#C59E4F' }}>
            🌟 {info.name} (P{p})
          </p>
          <p className="text-[11px] text-[#BFB6A6]">{info.description}</p>
        </div>
      ),
    });
  });

  return (
    <>
    <div
      // FIX (checagem extensa por bugs - "vários efeitos... mal
      // posicionados" sob o zoom atual): guarda o próprio nó desta div (a
      // que carrega o `zoom: 0.85` logo abaixo) em estado, pra publicar via
      // ZoomContainerContext (ver zoomContainerContext.tsx) - componentes
      // Radix portalizados (Tooltip, etc.) dentro desta árvore usam isso
      // pra nascer AQUI DENTRO em vez de escaparem pro `document.body` e
      // ignorarem o zoom.
      ref={setZoomContainerEl}
      className={`relative flex flex-col bg-[#0F1113] overflow-hidden ${screenShake ? 'animate-screen-shake' : ''}`}
      // FIX (pedido do usuário: "de mais dois zoom out no jogo") - `zoom`
      // (não padrão, mas suportado pelo Chromium/Edge do WebView2 que
      // empacota este jogo - já usado com segurança no modo compacto da mão,
      // ver PlayerZone.tsx) encolhe a tela de jogo INTEIRA (mão, campo,
      // painéis) ~15%.
      //
      // FIX (bug encontrado testando o zoom acima): `h-screen` (100vh) NUM
      // elemento que já tem `zoom` aplicado encolhe JUNTO com o resto -
      // `100vh` continua valendo 100% da altura REAL da janela, então depois
      // do zoom de 0.85 o elemento passava a ocupar só 85% da tela de
      // verdade, sobrando uma faixa em branco embaixo (o fundo por trás dele,
      // não coberto por nada). `calc(100vh / 0.85)` compensa exatamente o
      // fator do zoom, então o resultado FINAL na tela volta a ser 100vh de
      // verdade, sem sobra. A largura não precisa do mesmo ajuste porque este
      // div nunca teve `w-screen`/`100vw` - a largura sempre veio do próprio
      // fluxo do layout (100% do pai), que já escala corretamente com o zoom.
      //
      // FIX (pedido do usuário: "tamanho da carta / zoom da interface") -
      // `0.85` virou `settings.interfaceZoom / 100` (85 é o valor padrão,
      // idêntico ao de antes desta opção existir - ver DEFAULT_SETTINGS em
      // settings.ts) - ajustável no menu de Pausa/Configurações.
      style={{ zoom: interfaceZoomFactor, height: `calc(100vh / ${interfaceZoomFactor})` }}
    >
    <ZoomContainerContext.Provider value={zoomContainerEl}>
      {/* FIX (checagem extensa por bugs - "vários efeitos... mal
          posicionados" sob o zoom atual): movido de App.tsx pra AQUI, DENTRO
          do wrapper zoomado - ver o comentário completo em App.tsx. Única
          tela que chama `toast()` neste app é esta (GameBoard.tsx via
          MagicToast.tsx), então mover o Toaster pra cá não afeta nenhuma
          outra tela. */}
      <Toaster position="top-center" />
      {/* FIX (pedido do usuário: "speedlines no fundo... com as cores do
          personagem que ativou uma magia da vez") - fica ATRÁS de tudo (por
          isso vem primeiro no DOM, antes até do ArenaMagicBurst.tsx) - é só
          o fundo, nunca deve cobrir cartas/UI. */}
      <SpeedlinesBackground active={Boolean(speedlinesCharacter)} character={speedlinesCharacter} intense={speedlinesIntense} />
      {/* FIX (pedido do usuário, itens 4 e 6): antes só ligado à Magia
          Numeral (`showNumeralSpellPopup`) - agora ligado a
          `activeMagicCaster`, o MESMO estado preenchido por QUALQUER efeito
          de magia (J/Q/K, Monstro e Numeral, ver flashEffectTargets/
          flashSelfEffect acima), então o burst de tela cheia acompanha toda
          magia, não só a Numeral. `character` (em vez de `color`) deixa
          ArenaMagicBurst.tsx escolher o motivo certo (portal/garras/luz) por
          personagem, não só recolorir um burst genérico. */}
      <ArenaMagicBurst active={Boolean(activeMagicCaster)} character={activeMagicCaster} />
      {/* FIX (pedido do usuário, itens 1 e 2): zoom de câmera (embutido no
          próprio keyframe de .animate-screen-shake, ver globals.css) +
          flash cromático na tela inteira, nos mesmos momentos que o screen
          shake já disparava (golpe decisivo de combate / Magia Numeral). */}
      <ChromaticFlash active={screenFlash} />
      {/* Modo Reações (pedido do usuário) - banner não-bloqueante com o
          contador de 3s (a mão continua 100% visível/clicável embaixo dele -
          ver ReactionAlertBanner.tsx) + o "grande X" no instante em que
          alguém reage (ReactionNegatedBurst.tsx). */}
      <ReactionAlertBanner
        show={Boolean(gameState.pendingReaction)}
        casterCharacter={gameState.pendingReaction ? gameState.pendingReaction.character : null}
        magicType={gameState.pendingReaction ? gameState.pendingReaction.cardValue : null}
        reactingCharacter={gameState.pendingReaction ? characterOf(gameState, opponentOf(gameState.pendingReaction.casterPlayer)) : null}
        secondsLeft={reactionCountdown}
      />
      <ReactionNegatedBurst spec={reactionNegatedBurst} />
      <PhaseTransition
        phase={gameState.phase}
        show={showPhaseTransition}
        spotlight={gameState.spotlight}
        loneTower={Boolean(gameState.combatLoneTower)}
        isGameStart={isGameStart}
        activeModes={activeModes}
      />
      <CombatResult
        show={showCombatResult}
        winner={gameState.combatResolution?.winner ?? null}
        player1Character={player1Character}
        player2Character={player2Character}
        player1Value={gameState.combatResolution?.p1Value}
        player2Value={gameState.combatResolution?.p2Value}
        disputeWinner={gameState.combatResolution?.disputeWinner ?? null}
        winnerCombatWins={
          gameState.combatResolution?.winner === 1
            ? gameState.player1.combatWins
            : gameState.combatResolution?.winner === 2
            ? gameState.player2.combatWins
            : undefined
        }
      />

      {/* Barra Superior - FIX (pedido do usuário: "overhaul da interface
          superior") - antes era uma fileira única `flex` sem hierarquia,
          crescendo sem controle: Turno/Fase (sempre visíveis) tinham o
          MESMO peso que até 4 badges condicionais (Vira Primeiro, Spotlight,
          2x Magia Numeral) - quando várias coincidiam, a barra apertava ou
          cortava em telas mais estreitas (sem `flex-wrap`). Reorganizada em
          3 blocos: sempre-visível (Turno + PhaseProgress + placar de vidas)
          à esquerda/centro, condicionais agrupados num Popover só quando há
          algo pra mostrar, e ações (Pronto x2, Configurações, Pausa) à
          direita - `flex-wrap` no container garante que nunca corta, só
          quebra linha se precisar. */}
      <div className="bg-[#1E1A16] border-b border-[#C59E4F]/30 p-4 flex-shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap max-w-[1800px] mx-auto">
          <div className="flex items-center gap-4 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="text-[#C59E4F] hover:text-[#8F6A30]"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <Badge className="bg-[#C59E4F] text-[#0F1113]">
              Turno {gameState.turn}
            </Badge>
            <PhaseProgress phase={gameState.phase} />
            {/* FIX (pedido do usuário: "placar de vidas no topo") - antes só
                dava pra ver quantos corações cada um tem olhando pro painel
                de cada jogador lá embaixo (PlayerZone.tsx); resumo rápido
                aqui, na cor de cada personagem, sem precisar procurar. Não
                SUBSTITUI os corações de PlayerZone.tsx (que têm a animação
                de quebrar ao perder 1 vida) - só complementa com uma visão
                de placar sempre visível. */}
            <div className="flex items-center gap-1.5 text-[11px]">
              <span style={{ color: p1Theme.primary }} className="font-semibold">{p1Theme.name}</span>
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Heart key={i} className={`w-3 h-3 ${i < gameState.player1.lives ? 'fill-current' : 'opacity-20'}`} style={{ color: p1Theme.primary }} />
                ))}
              </div>
              <span className="text-[#8F6A30]">×</span>
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Heart key={i} className={`w-3 h-3 ${i < gameState.player2.lives ? 'fill-current' : 'opacity-20'}`} style={{ color: p2Theme.primary }} />
                ))}
              </div>
              <span style={{ color: p2Theme.primary }} className="font-semibold">{p2Theme.name}</span>
            </div>
            {/* FIX (pedido do usuário: "separar sempre visível de
                condicional") - Vira Primeiro/Spotlight/Magia Numeral Ativa
                saíram da fileira principal pra dentro deste Popover, que só
                existe quando `activeHeaderEffects` tem pelo menos 1 item -
                a barra nunca mais cresce à toa quando nada disso está
                acontecendo (a maior parte do jogo). */}
            {activeHeaderEffects.length > 0 && (
              <Popover>
                {/* FIX (bug real encontrado testando ao vivo): `PopoverTrigger
                    asChild` envolvendo um `<Badge>` quebrava o clique
                    inteiro - Badge é um function component comum, sem
                    `forwardRef` (ver ui/badge.tsx), e o mecanismo `asChild`
                    do Radix (Slot/SlotClone) PRECISA anexar um ref no
                    elemento filho pra posicionar o popover; sem conseguir,
                    o React só avisava no console ("Function components
                    cannot be given refs") e o popover nunca abria - nenhum
                    erro visível pro jogador, só um botão morto. Estiliza o
                    PRÓPRIO PopoverTrigger (que já é um `<button>` nativo,
                    aceita ref igual qualquer elemento DOM) parecido com um
                    Badge, em vez de aninhar os dois. */}
                <PopoverTrigger className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium border-[#C59E4F] text-[#C59E4F] cursor-pointer animate-pulse">
                  <Sparkles className="w-3 h-3" />
                  {activeHeaderEffects.length} efeito{activeHeaderEffects.length > 1 ? 's' : ''} ativo{activeHeaderEffects.length > 1 ? 's' : ''}
                </PopoverTrigger>
                <PopoverContent className="bg-[#1E1A16] border-[#C59E4F] w-72 space-y-3">
                  {activeHeaderEffects.map((effect) => effect.node)}
                </PopoverContent>
              </Popover>
            )}
          </div>

          <div className="flex items-center gap-4">
            {/* Indicadores de Pronto */}
            <div className="flex items-center gap-2">
              <div className={`flex items-center gap-1 px-2 py-1 rounded border ${
                gameState.player1.readyForNextPhase
                  ? 'bg-[#6CC47A]/20 border-[#6CC47A] text-[#6CC47A]'
                  : 'bg-[#BFB6A6]/10 border-[#BFB6A6]/30 text-[#BFB6A6]'
              }`}>
                {gameState.player1.readyForNextPhase ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                <span className="text-[10px]">{isAi(1) ? 'IA 🤖' : 'P1'}</span>
              </div>
              <div className={`flex items-center gap-1 px-2 py-1 rounded border ${
                gameState.player2.readyForNextPhase
                  ? 'bg-[#6CC47A]/20 border-[#6CC47A] text-[#6CC47A]'
                  : 'bg-[#BFB6A6]/10 border-[#BFB6A6]/30 text-[#BFB6A6]'
              }`}>
                {gameState.player2.readyForNextPhase ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                <span className="text-[10px]">{isAi(2) ? 'IA 🤖' : 'P2'}</span>
              </div>
            </div>

            {/* FIX (pedido do usuário: "atalho de Configurações direto no
                topo... sem passar pelo 'Jogo Pausado'") - abre o MESMO
                Dialog do botão de pausa ao lado, mas sem pausar a partida
                (ver `showQuickSettings` acima e o `open`/JSX do Dialog mais
                abaixo). */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowQuickSettings(true)}
              className="text-[#C59E4F]"
              title="Configurações rápidas"
            >
              <SettingsIcon className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => dispatch({ type: 'TOGGLE_PAUSE' })}
              className="text-[#C59E4F]"
            >
              {gameState.paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Tabuleiro Principal */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-[1800px] mx-auto p-6">
          {/* FIX (pedido do usuário: "a mão... força a página a criar um
              scroll") - a coluna central era `1fr`, que por padrão do CSS
              Grid tem largura MÍNIMA automática igual ao maior min-content
              de qualquer descendente (nunca encolhe abaixo disso). A mão
              (ver PlayerZone.tsx) reserva `min-width: 69rem` pra não "pular"
              de tamanho conforme cartas entram/saem - com uma mão grande
              (Anjo com bônus permanente empilhado, por exemplo), esse
              min-width forçava a COLUNA inteira (e com ela a página, via o
              `overflow-auto` do container pai) a crescer além de 1800px, em
              vez de a rolagem horizontal da própria mão (`overflow-x-auto`)
              entrar em ação como deveria. `minmax(0, 1fr)` zera esse piso
              automático, deixando a coluna central genuinamente encolher até
              o espaço disponível - a partir daí, é a mão que rola dentro de
              si mesma, contida, como já era a intenção original. */}
          {/* FIX (pedido do usuário: "agora as mãos estão muito pequenas") -
              causa raiz: as colunas laterais fixas (Log e Zona
              Monstro/Referência/Pontuação) reservavam 400px CADA (800px no
              total) - nenhuma das duas realmente precisa disso (são só texto
              e uma carta de Monstro, nenhum min-width próprio), mas antes do
              FIX anterior (minmax(0,1fr) + rolagem contida na própria mão) a
              coluna central "roubava" espaço extra da página via overflow
              para compensar. Depois de conter a rolagem corretamente, a
              coluna central ficou de fato limitada a só o que sobrava dos
              800px fixos - numa tela comum (~1280-1440px), isso deixava só
              uns 350-450px pra mão inteira, cabendo 3 cartas por vez antes de
              precisar rolar (cartas em si continuam 112x160px, mas a área
              visível delas ficou bem menor que antes). Reduzido para 300px
              cada - ainda confortável pro log de texto e pro card do
              Monstro/referência de magias, e libera 200px a mais pra coluna
              central (mão + campo de batalha). */}
          {/* FIX (pedido do usuário: "mostrar/ocultar o Log de Ações por
              padrão") - com `showActionLog` desligado, a coluna do Log some
              inteira (grid de 2 colunas em vez de 3) e a coluna central
              (mão + campo) ganha esse espaço de volta, em vez de sobrar um
              vão vazio. */}
          <div className={`grid gap-6 h-full ${settings.showActionLog ? 'grid-cols-[300px_minmax(0,1fr)_300px]' : 'grid-cols-[minmax(0,1fr)_300px]'}`}>
            {/* Esquerda - Log de Ações */}
            {settings.showActionLog && (
              <div className="space-y-6">
                <LogPanel
                  log={gameState.log}
                  player1Character={player1Character}
                  player2Character={player2Character}
                  screenReaderMode={settings.screenReader}
                />
              </div>
            )}

            {/* Centro - Área de Jogo */}
            <div className="space-y-6">
              <PlayerZone
                playerNumber={2}
                character={player2Character}
                phase={gameState.phase}
                // FIX (pedido do usuário: "ambos jogadores começando com as
                // mãos vazias e comprando todas cartas") - override só de
                // EXIBIÇÃO (o estado real já vem com a mão cheia desde
                // createInitialState, ver comentário completo em
                // `isGameStart` acima) - enquanto o anúncio de início está
                // na tela, finge mão vazia; ao fechar, a mão real aparece de
                // uma vez, e o mecanismo já existente de "carta nova"
                // (newCardIds/animate-new-card-glow) pulsa cada uma como se
                // tivesse acabado de ser comprada. Seguro porque nenhuma
                // ação real (IA ou clique) pode acontecer enquanto
                // showPhaseTransition é true (ver guards mais abaixo).
                playerState={showPhaseTransition && isGameStart ? { ...gameState.player2, hand: [] } : gameState.player2}
                selectedCardId={selectedCardId}
                onCardSelect={setSelectedCardId}
                onPlayCard={(cardId, slotIndex, asHorizontal) => handlePlayCard(2, cardId, slotIndex, asHorizontal)}
                selectedSlot={selectedSlot}
                onToggleReady={() => handleToggleReady(2)}
                selectedForDiscard={selectedForDiscard}
                onToggleDiscard={(cardId) => handleToggleDiscard(2, cardId)}
                onDiscardCards={() => handleDiscardCards(2)}
                towersMode={gameConfig.towersMode}
                spotlight={gameState.spotlight}
                pendingReaction={gameState.pendingReaction}
                onReactToMagic={(cardId) => handleReactToMagic(2, cardId)}
                selectedForTower={selectedForTower}
                onSelectCardForField={(cardId) => handleSelectCardForField(2, cardId)}
                fusionEnabled={gameConfig.fusion}
                fusionLimit={gameConfig.fusionLimit}
                discardLimit={gameConfig.discardLimit}
                drawLimitEnabled={gameConfig.drawLimitEnabled}
                drawLimit={gameConfig.drawLimit}
                monsterCardsEnabled={gameConfig.monsterCards}
                onFuseCards={(cardId1, cardId2) => handleFuseCards(2, cardId1, cardId2)}
                onDrawCards={(count) => handleDrawCards(2, count)}
                onTransformAce={(cardId) => handleTransformAce(2, cardId)}
                onAceTransformDrop={(aceCardId, targetCardId) => handleAceTransformDrop(2, aceCardId, targetCardId)}
                onActivateMagic={(cardId) => handleActivateMagicClick(2, cardId)}
                onSwapFieldCard={(cardId, slotIndex) => handleSwapFieldCard(2, cardId, slotIndex)}
                deckSize={gameState.deck.length}
                discardPileSize={gameState.discardPile.length}
                deck={gameState.deck}
                magicContext={getMagicActivationContext(gameState, 2)}
                isMagicCardDraggable={(card) => isMagicCardDraggable(2, card)}
                onActivateNumeralSpell={() => handleActivateNumeralSpell(2)}
                // FIX (item 8 da 2ª rodada): ver gameEngine.ts (handleActivateNumeralSpell)
                // - o bloqueio de "já tem uma ativa" precisa ser por jogador, não global,
                // senão a Magia Numeral do Mago (a única que fica "pendurada" durante o
                // turno do oponente) impedia o OPONENTE de ativar a magia numeral DELE
                // próprio, mesmo sendo um efeito completamente independente.
                hasActiveNumeralSpell={gameState.activeNumeralSpells[2] !== undefined}
                isAiControlled={isAi(2)}
                hotseatPrivacyActive={hotseatPrivacyActive}
                effectFlashCardIds={effectFlashCardIds}
                rejectedCardIds={rejectedCardIds}
                selfEffectFlash={selfEffectFlashPlayer === 2}
                isVictoryGlow={victoryGlowPlayer === 2}
                isFirstPicker={gameState.phase === 'combat' && canSelectCombatSlot(gameState, 2)}
                activeMagicCaster={activeMagicCaster}
                activeMagicLabel={activeMagicLabel}
                aceTransformFlashCardId={aceTransformFlashCardId}
              />

              {/* Modo Spotlight (pedido do usuário: "deixe mais claro uma
                  referência visual posicionada na direita dos dois campos,
                  por fora, o número destacado") - o indicador do cabeçalho
                  (perto de "Turno N") era discreto demais; esta faixa fica
                  colada por FORA da própria caixa do campo, grande e sempre
                  visível - ver SpotlightSidebar.tsx. */}
              <div className="flex gap-3 items-stretch">
                <div className="flex-1 min-w-0">
                  <BattleField
                    player1Character={player1Character}
                    player2Character={player2Character}
                    player1Field={gameState.player1.field}
                    player2Field={gameState.player2.field}
                    onSlotClick={handleFieldSlotClick}
                    onSlotDoubleClick={handleFieldSlotDoubleClick}
                    selectedSlot={selectedSlot}
                    phase={gameState.phase}
                    combatSelection={gameState.combatSelection}
                    isSlotProtected={isSlotProtectedFor}
                    player2IsAi={isAi(2)}
                    player1IsAi={isAi(1)}
                    onCardDrop={handleCardDrop}
                    onMagicCardDrop={handleMagicCardDrop}
                    isMagicDropTarget={isMagicDropTarget}
                    onRemoveHorizontalCard={handleRemoveHorizontalCard}
                    monsterTargetSelection={pendingMonsterTarget}
                    effectFlashSlots={effectFlashSlots}
                    effectFlashCardIds={effectFlashCardIds}
                    player1Ready={gameState.player1.readyForNextPhase}
                    player2Ready={gameState.player2.readyForNextPhase}
                    activeMagicCaster={activeMagicCaster}
                    activeMagicLabel={activeMagicLabel}
                    shatteringSlot={shatteringSlot}
                    smokingSlot={smokingSlot}
                    burningSlots={burningSlots}
                    player1DoubledCardId={gameState.player1.combatModifiers.find((m) => m.kind === 'multiply')?.cardId}
                    player2DoubledCardId={gameState.player2.combatModifiers.find((m) => m.kind === 'multiply')?.cardId}
                    player1BoostedCardId={gameState.player1.combatModifiers.find((m) => m.kind === 'add')?.cardId}
                    player1BoostAmount={gameState.player1.combatModifiers.find((m) => m.kind === 'add')?.amount ?? 0}
                    player2BoostedCardId={gameState.player2.combatModifiers.find((m) => m.kind === 'add')?.cardId}
                    player2BoostAmount={gameState.player2.combatModifiers.find((m) => m.kind === 'add')?.amount ?? 0}
                    combatValueSpec={combatValueReveal}
                    spotlight={gameState.spotlight}
                    towersMode={gameConfig.towersMode}
                    selectedForTower={selectedForTower}
                    onFormTower={handleFormTower}
                    canFormTower={(playerNumber, slotIndex) => canFormOrReinforceTower(gameState, playerNumber, slotIndex, Array.from(selectedForTower))}
                    player1FireballValue={player1Character === 'piromante' ? gameState.player1.fireballValue : undefined}
                    player2FireballValue={player2Character === 'piromante' ? gameState.player2.fireballValue : undefined}
                    fireballCap={getFireballCap(gameConfig)}
                    player1SpreadArmed={gameState.player1.piromanteSpreadArmed}
                    player2SpreadArmed={gameState.player2.piromanteSpreadArmed}
                  />
                </div>
                <SpotlightSidebar spotlight={gameState.spotlight} />
              </div>

              <PlayerZone
                playerNumber={1}
                character={player1Character}
                phase={gameState.phase}
                playerState={showPhaseTransition && isGameStart ? { ...gameState.player1, hand: [] } : gameState.player1}
                selectedCardId={selectedCardId}
                onCardSelect={setSelectedCardId}
                onPlayCard={(cardId, slotIndex, asHorizontal) => handlePlayCard(1, cardId, slotIndex, asHorizontal)}
                selectedSlot={selectedSlot}
                onToggleReady={() => handleToggleReady(1)}
                selectedForDiscard={selectedForDiscard}
                onToggleDiscard={(cardId) => handleToggleDiscard(1, cardId)}
                onDiscardCards={() => handleDiscardCards(1)}
                towersMode={gameConfig.towersMode}
                spotlight={gameState.spotlight}
                pendingReaction={gameState.pendingReaction}
                onReactToMagic={(cardId) => handleReactToMagic(1, cardId)}
                selectedForTower={selectedForTower}
                onSelectCardForField={(cardId) => handleSelectCardForField(1, cardId)}
                fusionEnabled={gameConfig.fusion}
                fusionLimit={gameConfig.fusionLimit}
                discardLimit={gameConfig.discardLimit}
                drawLimitEnabled={gameConfig.drawLimitEnabled}
                drawLimit={gameConfig.drawLimit}
                monsterCardsEnabled={gameConfig.monsterCards}
                onFuseCards={(cardId1, cardId2) => handleFuseCards(1, cardId1, cardId2)}
                onDrawCards={(count) => handleDrawCards(1, count)}
                onTransformAce={(cardId) => handleTransformAce(1, cardId)}
                onAceTransformDrop={(aceCardId, targetCardId) => handleAceTransformDrop(1, aceCardId, targetCardId)}
                onActivateMagic={(cardId) => handleActivateMagicClick(1, cardId)}
                onSwapFieldCard={(cardId, slotIndex) => handleSwapFieldCard(1, cardId, slotIndex)}
                deckSize={gameState.deck.length}
                discardPileSize={gameState.discardPile.length}
                deck={gameState.deck}
                magicContext={getMagicActivationContext(gameState, 1)}
                isMagicCardDraggable={(card) => isMagicCardDraggable(1, card)}
                onActivateNumeralSpell={() => handleActivateNumeralSpell(1)}
                hasActiveNumeralSpell={gameState.activeNumeralSpells[1] !== undefined}
                isAiControlled={isAi(1)}
                hotseatPrivacyActive={hotseatPrivacyActive}
                effectFlashCardIds={effectFlashCardIds}
                rejectedCardIds={rejectedCardIds}
                selfEffectFlash={selfEffectFlashPlayer === 1}
                isVictoryGlow={victoryGlowPlayer === 1}
                isFirstPicker={gameState.phase === 'combat' && canSelectCombatSlot(gameState, 1)}
                activeMagicCaster={activeMagicCaster}
                activeMagicLabel={activeMagicLabel}
                aceTransformFlashCardId={aceTransformFlashCardId}
              />
            </div>

            {/* Direita - Informações do Jogo */}
            {/* FIX (item 6 da 4ª rodada): "o baralho e a pilha de descarte
                deviam estar centralizados, não alinhados ao jogador de cima" -
                esta coluna é um item de grid que, por padrão (align-items:
                stretch), já ocupa a altura inteira da linha (a mesma da
                coluna central, bem mais alta - 2 zonas de jogador + campo de
                batalha), mas seu CONTEÚDO ficava no topo (comportamento
                normal de um <div> sem flex), ficando visualmente "grudado" ao
                lado da zona do Jogador 2 (de cima) em vez de centralizado na
                altura toda do tabuleiro.
                FIX (item 2 da 5ª rodada): "coloque uma caixa de texto
                explicando os efeitos de cada magia do personagem que estão
                utilizando, acima (jogador de cima) e abaixo (jogador de
                baixo) da região do baralho/descarte" - trocado `justify-center`
                por `justify-between` com 3 blocos (referência de magias do
                Jogador 2 / Pontuação+Baralho / referência de magias do
                Jogador 1), o que empurra o 1º bloco pro topo, o 3º pro
                fundo, e mantém o do meio entre os dois - exatamente o
                "acima" e "abaixo" pedido. Sem overflow próprio nesta coluna:
                o tabuleiro inteiro (2 mãos de 8 cartas + campo de batalha) já
                é mais alto que telas comuns, e o contêiner pai logo acima
                (`overflow-auto`) já rola a página inteira quando isso
                acontece - LOG, campo e esta coluna se movem juntos. Um
                scroll PRÓPRIO só nesta coluna criaria uma armadilha de
                scroll aninhado, inconsistente com as outras duas colunas.
                FIX (item 1 da 8ª rodada): "SEPARAR do campo... NÃO É PRA
                FICAR NO CAMPO, é pra ficar onde estou marcando" - depois de
                3 tentativas mantendo a Zona Monstro dentro do card do campo
                de batalha (BattleField.tsx), o print anotado deixou claro
                que ela precisa morar NESTA coluna lateral: a zona do
                Jogador 2/IA fica no bloco de CIMA (junto com a referência de
                magias dele, acima de "Pontuação"), e a do Jogador 1 no
                bloco de BAIXO (junto com a referência de magias dele,
                abaixo de "Baralho & Descarte") - ver MonsterZone.tsx. */}
            <div className="h-full flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <MonsterZone
                  playerNumber={2}
                  character={player2Character}
                  monsterCard={gameState.player2.monsterCard}
                  phase={gameState.phase}
                  isAiField={isAi(2)}
                  monsterTargetSelection={pendingMonsterTarget}
                  onMonsterZoneClick={handleMonsterZoneClick}
                  onMonsterCardDrop={handleMonsterCardDrop}
                />
                <CharacterMagicReference character={player2Character} />
              </div>

              <div className="space-y-6">
              <div className="bg-[#1E1A16]/50 border border-[#C59E4F]/20 rounded-lg p-4">
                <p className="text-[12px] text-[#BFB6A6] mb-3">Pontuação</p>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px]" style={{ color: p1Theme.primary }}>
                        {p1Theme.name}
                      </p>
                      <div className="flex items-center gap-1">
                        {[...Array(3)].map((_, i) => (
                          <Heart
                            key={i}
                            className={`w-3 h-3 ${i < gameState.player1.lives ? 'fill-current' : 'opacity-20'}`}
                            style={{ color: p1Theme.primary }}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-[10px] text-[#BFB6A6]">
                      Vitórias: {gameState.player1.combatWins}/2
                    </p>
                  </div>

                  <div className="h-px bg-[#C59E4F]/20" />

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px]" style={{ color: p2Theme.primary }}>
                        {p2Theme.name}
                      </p>
                      <div className="flex items-center gap-1">
                        {[...Array(3)].map((_, i) => (
                          <Heart
                            key={i}
                            className={`w-3 h-3 ${i < gameState.player2.lives ? 'fill-current' : 'opacity-20'}`}
                            style={{ color: p2Theme.primary }}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-[10px] text-[#BFB6A6]">
                      Vitórias: {gameState.player2.combatWins}/2
                    </p>
                  </div>
                </div>
              </div>

              {/* Baralho e Cemitério (pedido do usuário: "overhaul completo
                  dessa região") - as duas pilhas agora leem como LUGARES
                  físicos com profundidade de verdade, não painéis de texto:
                  o Baralho é uma pilha real de costas empilhadas (a altura
                  visível encolhe com `gameState.deck.length`, então dá pra
                  perceber o baralho esvaziando batendo o olho, sem ler o
                  número) e o Cemitério é um nicho escuro à parte, onde as
                  cartas "afundam" em vez de só empilhar - preparando o
                  terreno visual pra um personagem futuro que manipula o
                  cemitério (pedido do usuário: "em preparação pra um
                  personagem futuro"), que ganha um lugar próprio pra atuar
                  em vez de dividir estilo com o baralho. */}
              <div className="bg-[#1E1A16]/50 border border-[#C59E4F]/20 rounded-lg p-4">
                <p className="text-[12px] text-[#BFB6A6] mb-3">Baralho & Cemitério</p>
                <div className="grid grid-cols-2 gap-3">
                  {/* Baralho: pilha de costas empilhadas, cursor-help (sem
                      diálogo - não há nada pra "abrir", o baralho é opaco por
                      design). A CONTAGEM de camadas visíveis (1-5) é
                      proporcional ao que resta (mín. 1 sempre que
                      deck.length > 0), então uma pilha AFINANDO é visível de
                      relance - o número exato continua no selo, pra quem
                      quiser precisão. */}
                  <div
                    className="border border-[#C59E4F]/30 rounded p-3 cursor-help hover:bg-[#C59E4F]/5 transition-colors flex flex-col items-center gap-2"
                    title={`${gameState.deck.length} carta(s) restantes de reembaralhar o cemitério`}
                  >
                    <div className="flex items-center gap-2 self-start">
                      <Layers3 className="w-4 h-4 text-[#C59E4F]" />
                      <p className="text-[11px] text-[#EFE7D6]">Baralho</p>
                    </div>
                    <div className="relative flex justify-center" style={{ height: 96, width: 68 }}>
                      {gameState.deck.length === 0 ? (
                        <PlayingCard slot className="w-16 h-24" />
                      ) : (
                        Array.from({ length: Math.min(5, Math.max(1, Math.ceil((gameState.deck.length / DECK_STACK_REFERENCE) * 5))) }).map((_, idx, arr) => {
                          const depthFromTop = arr.length - 1 - idx;
                          return (
                            <div
                              key={idx}
                              className="absolute"
                              style={{ zIndex: idx, transform: `translate(${depthFromTop * -3}px, ${depthFromTop * 3}px)` }}
                            >
                              <PlayingCard faceDown className="w-16 h-24" />
                            </div>
                          );
                        })
                      )}
                    </div>
                    <p className="text-[14px] text-[#C59E4F]">{gameState.deck.length}</p>
                  </div>

                  {/* FIX (pedido do usuário: "eu queria que a pilha de
                      descarte fosse visualmente semelhante aos campos, em
                      vez de só um botão", depois "overhaul completo... mude o
                      nome... em preparação pra um personagem futuro") - o
                      Cemitério deixou de ser uma variação clara do Baralho
                      (mesmo formato de painel, só cartas viradas pra cima) e
                      virou um NICHO próprio: fundo mais escuro/fosco (cinza
                      frio em vez do dourado do Baralho), cantos afundados
                      (`shadow-inner`), e as cartas empilhadas ficam voltadas
                      pra BAIXO (é um cemitério - o conteúdo já não importa
                      pra quem olha de fora, só a PRESENÇA das almas ali,
                      cada uma virada de vez em quando pelo diálogo). A
                      última carta descartada continua sendo a única virada
                      pra cima, no topo - é a única informação pública real
                      (o resto exige abrir o diálogo, igual antes).
                      `ref={discardPileRef}` continua marcando a posição real
                      deste painel para FlyingDiscardCard.tsx mirar nela. */}
                  <div
                    ref={discardPileRef}
                    onClick={() => setShowDiscardPile(true)}
                    className="border border-[#4A4640] rounded p-3 cursor-pointer bg-[#0F1113]/60 hover:bg-[#0F1113]/80 transition-colors shadow-inner flex flex-col items-center gap-2"
                  >
                    <div className="flex items-center gap-2 self-start">
                      <Skull className="w-4 h-4 text-[#8F6A30]" />
                      <p className="text-[11px] text-[#EFE7D6]">Cemitério</p>
                    </div>
                    <div className="relative flex justify-center" style={{ height: 96, width: 68 }}>
                      {gameState.discardPile.length === 0 ? (
                        <PlayingCard slot className="w-16 h-24" />
                      ) : (
                        gameState.discardPile.slice(-3).map((stackedCard, idx, arr) => {
                          // idx 0 = a mais antiga das 3 (fica atrás), última = topo real da pilha (fica na frente).
                          const depthFromTop = arr.length - 1 - idx;
                          const isTopOfPile = idx === arr.length - 1;
                          return (
                            <motion.div
                              key={stackedCard.id}
                              layout
                              className="absolute"
                              style={{ zIndex: idx }}
                              initial={{ opacity: 0, scale: 0.7, y: -14 }}
                              animate={{
                                opacity: 1,
                                scale: 1,
                                x: depthFromTop * 4,
                                y: depthFromTop * 4,
                                rotate: depthFromTop * 5,
                              }}
                              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                            >
                              {/* Só a carta do TOPO real (a última enterrada)
                                  vira pra cima - as demais ficam de costas,
                                  reforçando que o cemitério é opaco por fora
                                  (mesma ideia do Baralho), a menos que se
                                  abra o diálogo. */}
                              {isTopOfPile ? (
                                <PlayingCard value={stackedCard.value} suit={stackedCard.suit} card={stackedCard} className="w-16 h-24" />
                              ) : (
                                <PlayingCard faceDown className="w-16 h-24" />
                              )}
                            </motion.div>
                          );
                        })
                      )}
                    </div>
                    <p className="text-[14px] text-[#8F6A30]">{gameState.discardPile.length}</p>
                  </div>
                </div>
              </div>
              </div>

              {/* FIX (pedido do usuário: "quando uma carta fosse movida para
                  o descarte, pós combate ou pós utilização de algum efeito,
                  uma animação visual dela indo girando até o descarte") -
                  camada de cartas "fantasma" voando de onde estavam (campo,
                  mão ou zona própria) até o painel da pilha de descarte
                  acima - ver flyingDiscards/discardWatcherEffect. */}
              {flyingDiscards.map((spec) => (
                <FlyingDiscardCard key={spec.key} spec={spec} />
              ))}

              <div className="space-y-3">
                <CharacterMagicReference character={player1Character} />
                <MonsterZone
                  playerNumber={1}
                  character={player1Character}
                  monsterCard={gameState.player1.monsterCard}
                  phase={gameState.phase}
                  isAiField={isAi(1)}
                  monsterTargetSelection={pendingMonsterTarget}
                  onMonsterZoneClick={handleMonsterZoneClick}
                  onMonsterCardDrop={handleMonsterCardDrop}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Diálogo da Pilha de Descarte */}
      <Dialog open={showDiscardPile} onOpenChange={setShowDiscardPile}>
        <DialogContent className="bg-[#1E1A16] border-[#C59E4F] max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#EFE7D6] font-display text-[24px]">Cemitério</DialogTitle>
            <DialogDescription className="text-[#BFB6A6]">
              {gameState.discardPile.length} carta(s) descartada(s)
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[400px] pr-4">
            <div className="grid grid-cols-4 gap-3">
              {gameState.discardPile.map((card, index) => (
                <div key={`${card.id}-${index}`} className="flex flex-col items-center">
                  <div className="text-[#EFE7D6] text-center">
                    <span className={`text-[24px] ${['♥', '♦'].includes(card.suit) ? 'text-[#D45D4A]' : ''}`}>
                      {card.value}{card.suit}
                    </span>
                  </div>
                </div>
              ))}
              {gameState.discardPile.length === 0 && (
                <div className="col-span-4 text-center text-[#BFB6A6] py-8">
                  Nenhuma carta descartada ainda
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Vitória */}
      <Dialog open={showVictory} onOpenChange={setShowVictory}>
        <DialogContent className="bg-[#1E1A16] border-[#C59E4F] max-w-lg">
          <DialogHeader>
            <div className="flex flex-col items-center gap-4 py-6">
              <motion.div
                animate={settings.animations ? { scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] } : undefined}
                transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 0.5 }}
                className="w-24 h-24 rounded-full flex items-center justify-center"
                style={{
                  backgroundColor: gameState.gameOver ? (gameState.gameOver.winner === 1 ? p1Theme.primary : p2Theme.primary) : '#C59E4F',
                  boxShadow: `0 0 60px ${gameState.gameOver ? (gameState.gameOver.winner === 1 ? p1Theme.primary : p2Theme.primary) : '#C59E4F'}`,
                }}
              >
                <Trophy className="w-12 h-12 text-[#0F1113]" />
              </motion.div>

              {/* FIX (pedido do usuário, item 8: "nome do vencedor gigante e
                  animado"): título e nome saem de um "soco" de escala
                  gigante (3x -> assenta em 1x, tipo cartaz de luta) em vez
                  de só aparecer, e o nome do vencedor ganha um brilho
                  pulsante contínuo na cor do personagem, bem mais chamativo
                  que o texto estático de antes. */}
              <DialogTitle asChild>
                <motion.h2
                  className="text-[#EFE7D6] font-display text-[64px] text-center font-bold leading-none"
                  initial={{ opacity: 0, scale: 3, rotate: -6 }}
                  animate={{ opacity: 1, scale: [3, 0.85, 1.05, 1], rotate: [-6, 2, 0] }}
                  transition={{ duration: 0.9, ease: 'easeOut', times: [0, 0.55, 0.8, 1] }}
                  style={{
                    textShadow: `0 0 30px ${winnerVictoryColor}, 0 0 70px ${winnerVictoryColor}90`,
                  }}
                >
                  VITÓRIA!
                </motion.h2>
              </DialogTitle>

              <motion.p
                className="text-[44px] font-display text-center font-bold"
                initial={{ opacity: 0, y: 24, scale: 0.6 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: 1,
                  textShadow: [
                    `0 0 12px ${winnerVictoryColor}90`,
                    `0 0 34px ${winnerVictoryColor}`,
                    `0 0 12px ${winnerVictoryColor}90`,
                  ],
                }}
                transition={{
                  opacity: { duration: 0.5, delay: 0.4, ease: 'easeOut' },
                  y: { duration: 0.5, delay: 0.4, ease: 'easeOut' },
                  scale: { duration: 0.5, delay: 0.4, ease: 'easeOut' },
                  textShadow: { duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: 0.9 },
                }}
                style={{ color: winnerVictoryColor }}
              >
                {gameState.gameOver ? (gameState.gameOver.winner === 1 ? p1Theme.name : p2Theme.name) : ''}
              </motion.p>

              {/* FIX (pedido do usuário: "ao invés de falar jogador 1 e
                  jogador 2, troque para os respectivos nomes dos
                  personagens") - o nome do vencedor já aparece em destaque
                  logo acima; a legenda "Jogador N venceu" repetia a mesma
                  informação, então virou só "Venceu a partida!". */}
              <p className="text-[#BFB6A6] text-[18px]">
                Venceu a partida!
              </p>
            </div>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Revanche */}
      <Dialog open={showRematchDialog} onOpenChange={setShowRematchDialog}>
        <DialogContent className="bg-[#1E1A16] border-[#C59E4F]">
          <DialogHeader>
            <DialogTitle className="text-[#EFE7D6] font-display text-[24px]">Fim de Jogo</DialogTitle>
            <DialogDescription className="text-[#BFB6A6]">
              O que você gostaria de fazer?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Button
              onClick={handleRematch}
              className="bg-[#C59E4F] hover:bg-[#8F6A30] text-[#0F1113]"
            >
              Revanche
            </Button>
            <Button
              onClick={onBack}
              variant="outline"
              className="border-[#C59E4F] text-[#C59E4F]"
            >
              Escolher Personagens
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Interação com Magia */}
      <Dialog open={!!pendingMagic} onOpenChange={(open) => !open && setPendingMagic(null)}>
        <DialogContent className="bg-[#1E1A16] border-[#C59E4F] max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#EFE7D6] font-display text-[20px]">
              {pendingMagic && `Ativar Magia - ${getCharacterTheme(pendingMagic.character).name}`}
            </DialogTitle>
            <DialogDescription className="text-[#BFB6A6]">
              {pendingMagic && (() => {
                const { character, type } = pendingMagic;
                if (character === 'mago' && type === 'J') return 'Selecione uma carta da mão do oponente para revelar ou descartar';
                if (character === 'besta' && type === 'J') return 'Selecione até 2 cartas do descarte para pegar';
                if (character === 'mago' && type === 'Q') return 'Selecione um slot do campo e uma carta da mão para substituir';
                if (character === 'besta' && type === 'Q') return 'Selecione um slot do seu campo e uma carta do descarte';
                if (character === 'anjo' && type === 'Q') return 'Selecione uma carta do oponente para revelar';
                if (character === 'mago' && type === 'K') return 'Selecione uma carta horizontal do oponente (ainda não batalhada) para destruir';
                if (character === 'besta' && type === 'K') return 'Selecione seu slot e o do oponente (ambos ainda não revelados) para trocar';
                if (character === 'mosqueteiro' && type === 'J')
                  return gameState[playerKeyOf(pendingMagic.playerNumber)].mosqueteiroRedirectNextDiscard
                    ? 'Selecione (às cegas) 1 carta da mão do oponente para descartar'
                    : 'Selecione 1 carta da sua mão para descartar';
                if (character === 'mosqueteiro' && type === 'Q')
                  return gameState[playerKeyOf(pendingMagic.playerNumber)].mosqueteiroRedirectNextDiscard
                    ? 'Selecione (às cegas) até 3 cartas da mão do oponente para descartar, depois escolha o que revelar'
                    : 'Selecione até 3 cartas da sua mão para descartar, depois escolha o que revelar';
                if (character === 'mosqueteiro' && type === 'K') return 'Selecione uma carta do seu campo para reforçar';
                if (character === 'piromante') return 'Escolha entre o efeito próprio (alimentar a Bola de Fogo) ou lançar a Bola de Fogo já acumulada';
                return '';
              })()}
            </DialogDescription>
          </DialogHeader>

          {pendingMagic && (() => {
            const opponentNumber = opponentOf(pendingMagic.playerNumber);
            const opponentKey = opponentKeyOf(pendingMagic.playerNumber);
            const ownKey = playerKeyOf(pendingMagic.playerNumber);
            return (
              <div className="space-y-4">
                {/* Mago J - Selecionar carta da mão do oponente */}
                {pendingMagic.character === 'mago' && pendingMagic.type === 'J' && (() => {
                  // FIX (pedido do usuário: "você PODE descartar uma carta JÁ
                  // revelada, não só quando tiver todas") - toda carta da mão
                  // do oponente é sempre selecionável agora: uma ainda não
                  // revelada é revelada; uma JÁ revelada (de uma ativação
                  // anterior desta magia) é descartada - não depende mais do
                  // resto da mão estar toda revelada ou não (ver
                  // handleExecuteMagic em gameEngine.ts).
                  const selectedId = (pendingMagic.selectedCards || [])[0];
                  const selectedCard = gameState[opponentKey].hand.find((c) => c.id === selectedId);
                  return (
                    <div>
                      <p className="text-[#BFB6A6] text-[12px] mb-2">
                        Mão do Oponente (selecione 1 carta):
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {gameState[opponentKey].hand.map((card, idx) => {
                          const isRevealed = card.revealed;
                          return (
                            <button
                              key={card.id}
                              onClick={() => setPendingMagic({ ...pendingMagic, selectedCards: [card.id] })}
                              className={`w-16 h-24 border-2 rounded flex flex-col items-center justify-center ${
                                selectedId === card.id ? 'border-[#6CC47A] bg-[#6CC47A]/10' : 'border-[#C59E4F]/30 hover:border-[#C59E4F]'
                              } transition-all text-[10px] text-[#BFB6A6]`}
                            >
                              {isRevealed ? (
                                <>
                                  <span className="text-[14px]">{getDisplayValue(card)}{card.suit}</span>
                                  <span className="text-[8px] text-[#6CC47A]">Revelada</span>
                                </>
                              ) : (
                                <>
                                  <span className="text-[14px]">🃏</span>
                                  <span className="text-[8px]">Carta {idx + 1}</span>
                                </>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {selectedCard?.revealed && (
                        <p className="text-[#E2B84A] text-[11px] mt-2">⚠️ Essa carta já está revelada - será descartada.</p>
                      )}
                    </div>
                  );
                })()}

                {/* Besta J - Selecionar cartas do descarte */}
                {/* FIX (pedido do usuário): só cartas numerais puras (2-10,
                    sem Ás) podem ser recuperadas - magias, Monstro e Ás
                    aparecem esmaecidos e não clicáveis, em vez de deixar
                    selecionar algo que o motor (ver handleExecuteMagic em
                    gameEngine.ts) vai rejeitar de qualquer forma. */}
                {pendingMagic.character === 'besta' && pendingMagic.type === 'J' && (
                  <div>
                    <p className="text-[#BFB6A6] text-[12px] mb-2">Cemitério (selecione até 2 cartas numerais - Ás não incluído):</p>
                    <ScrollArea className="h-48 border border-[#C59E4F]/30 rounded p-2">
                      <div className="flex flex-wrap gap-2">
                        {gameState.discardPile.length === 0 ? (
                          <p className="text-[#BFB6A6] text-[11px]">Pilha vazia</p>
                        ) : (
                          gameState.discardPile.map((discardCard, discardIdx) => {
                            const eligible = isPlainNumeralCard(discardCard);
                            return (
                              <div
                                key={`discard-besta-j-${discardCard.id}-${discardIdx}`}
                                onClick={() => {
                                  if (!eligible) return;
                                  const selected = pendingMagic.selectedCards || [];
                                  if (selected.includes(discardCard.id)) {
                                    setPendingMagic({ ...pendingMagic, selectedCards: selected.filter((id) => id !== discardCard.id) });
                                  } else if (selected.length < 2) {
                                    setPendingMagic({ ...pendingMagic, selectedCards: [...selected, discardCard.id] });
                                  }
                                }}
                                className={`transition-all ${eligible ? 'cursor-pointer' : 'opacity-30 cursor-not-allowed grayscale'} ${
                                  (pendingMagic.selectedCards || []).includes(discardCard.id) ? 'ring-2 ring-[#6CC47A]' : ''
                                }`}
                              >
                                <PlayingCard value={discardCard.value} suit={discardCard.suit} />
                              </div>
                            );
                          })
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {/* Mago Q - Selecionar slot e carta */}
                {pendingMagic.character === 'mago' && pendingMagic.type === 'Q' && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-[#BFB6A6] text-[12px] mb-2">Selecione o slot do campo:</p>
                      <div className="flex gap-2">
                        {(['Seu Campo', 'Campo Oponente'] as const).map((label, playerIdx) => (
                          <div key={label} className="flex-1">
                            <p className="text-[10px] text-[#BFB6A6] mb-1">{label}</p>
                            <div className="flex gap-1">
                              {[0, 1, 2].map((slotIdx) => {
                                const targetPlayerNum = playerIdx === 0 ? pendingMagic.playerNumber : opponentNumber;
                                const targetKey = playerKeyOf(targetPlayerNum);
                                const slot = gameState[targetKey].field[slotIdx];
                                const isOwn = targetPlayerNum === pendingMagic.playerNumber;
                                const canSelect = Boolean(slot.faceDownCard) && (isOwn || slot.revealed) && !(!isOwn && isSlotProtected(gameState, targetPlayerNum, slotIdx));

                                return (
                                  <button
                                    key={slotIdx}
                                    onClick={() => canSelect && setPendingMagic({ ...pendingMagic, selectedSlot: slotIdx, selectedTargetPlayer: targetPlayerNum })}
                                    disabled={!canSelect}
                                    className={`flex-1 h-16 border-2 rounded ${
                                      pendingMagic.selectedSlot === slotIdx && pendingMagic.selectedTargetPlayer === targetPlayerNum
                                        ? 'border-[#6CC47A] bg-[#6CC47A]/10'
                                        : canSelect
                                        ? 'border-[#C59E4F]/30 hover:border-[#C59E4F]'
                                        : 'border-[#C59E4F]/10 opacity-30'
                                    } transition-all text-[10px] text-[#BFB6A6]`}
                                  >
                                    {slot.faceDownCard ? (slot.revealed || isOwn ? `${getDisplayValue(slot.faceDownCard)}${slot.faceDownCard.suit}` : '🃏') : 'Vazio'}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {pendingMagic.selectedSlot !== undefined && (
                      <div>
                        <p className="text-[#BFB6A6] text-[12px] mb-2">Selecione uma carta da sua mão (2-10):</p>
                        <div className="flex gap-2 flex-wrap">
                          {gameState[ownKey].hand
                            .filter((c) => isNumeralCard(c))
                            .map((handCard) => (
                              <div
                                key={handCard.id}
                                onClick={() => setPendingMagic({ ...pendingMagic, selectedCards: [handCard.id] })}
                                className={`cursor-pointer transition-all ${
                                  (pendingMagic.selectedCards || [])[0] === handCard.id ? 'ring-2 ring-[#6CC47A]' : ''
                                }`}
                              >
                                <PlayingCard value={handCard.value} suit={handCard.suit} card={handCard} />
                              </div>
                            ))}
                        </div>
                        {/* FIX (pedido do usuário): a carta numeral usada na troca também
                            pode vir da mão do OPONENTE, mas só se ela já estiver revelada -
                            o Mago só tem controle sobre informação que ele mesmo expôs (a
                            mesma regra "sua ou do oponente se revelada" já usada acima para
                            o slot do campo, ver handleExecuteMagic em gameEngine.ts). Antes
                            só a própria mão aparecia aqui, mesmo quando o oponente tinha
                            cartas reveladas disponíveis. */}
                        {gameState[opponentKey].hand.some((c) => isNumeralCard(c) && c.revealed) && (
                          <div className="mt-3">
                            <p className="text-[#BFB6A6] text-[12px] mb-2">Ou uma carta revelada da mão do oponente (2-10):</p>
                            <div className="flex gap-2 flex-wrap">
                              {gameState[opponentKey].hand
                                .filter((c) => isNumeralCard(c) && c.revealed)
                                .map((handCard) => (
                                  <div
                                    key={handCard.id}
                                    onClick={() => setPendingMagic({ ...pendingMagic, selectedCards: [handCard.id] })}
                                    className={`cursor-pointer transition-all ${
                                      (pendingMagic.selectedCards || [])[0] === handCard.id ? 'ring-2 ring-[#6CC47A]' : ''
                                    }`}
                                  >
                                    <PlayingCard value={handCard.value} suit={handCard.suit} card={handCard} />
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Besta Q - Selecionar slot (próprio ou do oponente se revelado) e carta do descarte */}
                {/* FIX (itens 12 e 18): antes só o próprio campo podia ser
                    escolhido como alvo, o que criava um beco sem saída quando
                    o próprio campo estava vazio (a magia podia ser ativada
                    porque o oponente tinha cartas em campo, mas o diálogo não
                    oferecia nenhum slot próprio válido). Agora, assim como a
                    Substituição Arcana do Mago, também é possível trocar uma
                    carta já REVELADA e desprotegida do campo do oponente. */}
                {pendingMagic.character === 'besta' && pendingMagic.type === 'Q' && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-[#BFB6A6] text-[12px] mb-2">Selecione o slot do campo:</p>
                      <div className="flex gap-2">
                        {(['Seu Campo', 'Campo Oponente'] as const).map((label, playerIdx) => (
                          <div key={label} className="flex-1">
                            <p className="text-[10px] text-[#BFB6A6] mb-1">{label}</p>
                            <div className="flex gap-1">
                              {[0, 1, 2].map((slotIdx) => {
                                const targetPlayerNum = playerIdx === 0 ? pendingMagic.playerNumber : opponentNumber;
                                const targetKey = playerKeyOf(targetPlayerNum);
                                const slot = gameState[targetKey].field[slotIdx];
                                const isOwn = targetPlayerNum === pendingMagic.playerNumber;
                                const canSelect = Boolean(slot.faceDownCard) && (isOwn || slot.revealed) && !(!isOwn && isSlotProtected(gameState, targetPlayerNum, slotIdx));

                                return (
                                  <button
                                    key={slotIdx}
                                    onClick={() => canSelect && setPendingMagic({ ...pendingMagic, selectedSlot: slotIdx, selectedTargetPlayer: targetPlayerNum })}
                                    disabled={!canSelect}
                                    className={`flex-1 h-16 border-2 rounded ${
                                      pendingMagic.selectedSlot === slotIdx && pendingMagic.selectedTargetPlayer === targetPlayerNum
                                        ? 'border-[#6CC47A] bg-[#6CC47A]/10'
                                        : canSelect
                                        ? 'border-[#C59E4F]/30 hover:border-[#C59E4F]'
                                        : 'border-[#C59E4F]/10 opacity-30'
                                    } transition-all text-[10px] text-[#BFB6A6]`}
                                  >
                                    {slot.faceDownCard ? (slot.revealed || isOwn ? `${getDisplayValue(slot.faceDownCard)}${slot.faceDownCard.suit}` : '🃏') : 'Vazio'}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {pendingMagic.selectedSlot !== undefined && (
                      <div>
                        <p className="text-[#BFB6A6] text-[12px] mb-2">Selecione uma carta do descarte (2-10):</p>
                        <ScrollArea className="h-32 border border-[#C59E4F]/30 rounded p-2">
                          <div className="flex flex-wrap gap-2">
                            {gameState.discardPile
                              .filter((c) => isNumeralCard(c))
                              .map((discardCard, discardIdx) => (
                                <div
                                  key={`discard-besta-q-${discardCard.id}-${discardIdx}`}
                                  onClick={() => setPendingMagic({ ...pendingMagic, selectedCards: [discardCard.id] })}
                                  className={`cursor-pointer transition-all ${
                                    (pendingMagic.selectedCards || [])[0] === discardCard.id ? 'ring-2 ring-[#6CC47A]' : ''
                                  }`}
                                >
                                  <PlayingCard value={discardCard.value} suit={discardCard.suit} />
                                </div>
                              ))}
                          </div>
                        </ScrollArea>
                      </div>
                    )}
                  </div>
                )}

                {/* Anjo Q - Selecionar carta ou slot do oponente */}
                {pendingMagic.character === 'anjo' && pendingMagic.type === 'Q' && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-[#BFB6A6] text-[12px] mb-2">Campo do Oponente:</p>
                      <div className="flex gap-2">
                        {[0, 1, 2].map((slotIdx) => {
                          const slot = gameState[opponentKey].field[slotIdx];
                          // FIX (pedido do usuário: "não permita que o
                          // jogador selecione cartas... que já estão
                          // reveladas") - revelar um slot já revelado não
                          // faz nada de útil.
                          const canSelect = Boolean(slot.faceDownCard) && !slot.revealed && !isSlotProtected(gameState, opponentNumber, slotIdx);

                          return (
                            <button
                              key={slotIdx}
                              onClick={() => canSelect && setPendingMagic({ ...pendingMagic, selectedSlot: slotIdx, selectedCards: undefined })}
                              disabled={!canSelect}
                              className={`flex-1 h-20 border-2 rounded ${
                                pendingMagic.selectedSlot === slotIdx
                                  ? 'border-[#6CC47A] bg-[#6CC47A]/10'
                                  : canSelect
                                  ? 'border-[#C59E4F]/30 hover:border-[#C59E4F]'
                                  : 'border-[#C59E4F]/10 opacity-30'
                              } transition-all text-[11px] text-[#BFB6A6]`}
                            >
                              Slot {slotIdx + 1}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="text-[#BFB6A6] text-[12px] mb-2">Ou Mão do Oponente:</p>
                      <div className="flex gap-2 flex-wrap">
                        {gameState[opponentKey].hand.map((card, idx) => {
                          // FIX (pedido do usuário): mesma restrição para
                          // cartas da mão do oponente já reveladas.
                          const canSelect = !card.revealed;
                          return (
                            <button
                              key={card.id}
                              onClick={() => canSelect && setPendingMagic({ ...pendingMagic, selectedCards: [card.id], selectedSlot: undefined })}
                              disabled={!canSelect}
                              className={`w-16 h-24 border-2 rounded ${
                                (pendingMagic.selectedCards || [])[0] === card.id
                                  ? 'border-[#6CC47A] bg-[#6CC47A]/10'
                                  : canSelect
                                  ? 'border-[#C59E4F]/30 hover:border-[#C59E4F]'
                                  : 'border-[#C59E4F]/10 opacity-30 cursor-not-allowed'
                              } transition-all text-[10px] text-[#BFB6A6]`}
                            >
                              Carta {idx + 1}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Mago K - Selecionar horizontal do oponente */}
                {pendingMagic.character === 'mago' && pendingMagic.type === 'K' && (
                  <div>
                    <p className="text-[#BFB6A6] text-[12px] mb-2">Selecione um slot com carta horizontal do oponente (ainda não batalhada):</p>
                    <div className="flex gap-2">
                      {[0, 1, 2].map((slotIdx) => {
                        const slot = gameState[opponentKey].field[slotIdx];
                        const canSelect = getUnbattledHorizontalSlots(gameState[opponentKey].field).includes(slotIdx) && !isSlotProtected(gameState, opponentNumber, slotIdx);

                        return (
                          <button
                            key={slotIdx}
                            onClick={() => canSelect && setPendingMagic({ ...pendingMagic, selectedSlot: slotIdx })}
                            disabled={!canSelect}
                            className={`flex-1 h-20 border-2 rounded ${
                              pendingMagic.selectedSlot === slotIdx
                                ? 'border-[#6CC47A] bg-[#6CC47A]/10'
                                : canSelect
                                ? 'border-[#C59E4F]/30 hover:border-[#C59E4F]'
                                : 'border-[#C59E4F]/10 opacity-30'
                            } transition-all text-[11px] text-[#BFB6A6]`}
                          >
                            {slot.horizontalCards.length > 0 ? `Reforço presente${slot.horizontalCards.length > 1 ? ' (x2)' : ''}` : 'Sem horizontal'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Besta K - Selecionar slots para trocar */}
                {pendingMagic.character === 'besta' && pendingMagic.type === 'K' && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-[#BFB6A6] text-[12px] mb-2">Selecione seu slot (ainda não revelado):</p>
                      <div className="flex gap-2">
                        {[0, 1, 2].map((slotIdx) => {
                          const canSelect = getUnrevealedFieldSlots(gameState[ownKey].field).includes(slotIdx);

                          return (
                            <button
                              key={slotIdx}
                              onClick={() => canSelect && setPendingMagic({ ...pendingMagic, selectedSlot: slotIdx })}
                              disabled={!canSelect}
                              className={`flex-1 h-20 border-2 rounded ${
                                pendingMagic.selectedSlot === slotIdx
                                  ? 'border-[#6CC47A] bg-[#6CC47A]/10'
                                  : canSelect
                                  ? 'border-[#C59E4F]/30 hover:border-[#C59E4F]'
                                  : 'border-[#C59E4F]/10 opacity-30'
                              } transition-all text-[11px] text-[#BFB6A6]`}
                            >
                              Slot {slotIdx + 1}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {pendingMagic.selectedSlot !== undefined && (
                      <div>
                        <p className="text-[#BFB6A6] text-[12px] mb-2">Selecione slot do oponente (ainda não revelado):</p>
                        <div className="flex gap-2">
                          {[0, 1, 2].map((slotIdx) => {
                            const canSelect = getUnrevealedFieldSlots(gameState[opponentKey].field).includes(slotIdx) && !isSlotProtected(gameState, opponentNumber, slotIdx);

                            return (
                              <button
                                key={slotIdx}
                                onClick={() => canSelect && setPendingMagic({ ...pendingMagic, selectedTargetSlot: slotIdx })}
                                disabled={!canSelect}
                                className={`flex-1 h-20 border-2 rounded ${
                                  pendingMagic.selectedTargetSlot === slotIdx
                                    ? 'border-[#6CC47A] bg-[#6CC47A]/10'
                                    : canSelect
                                    ? 'border-[#C59E4F]/30 hover:border-[#C59E4F]'
                                    : 'border-[#C59E4F]/10 opacity-30'
                                } transition-all text-[11px] text-[#BFB6A6]`}
                              >
                                Slot {slotIdx + 1}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Mosqueteiro J - Tiro de Cobertura: 1 carta pra descartar
                    (própria mão, ou do OPONENTE às cegas por posição se a
                    Recarga Rápida estiver ativa). */}
                {pendingMagic.character === 'mosqueteiro' && pendingMagic.type === 'J' && (() => {
                  const redirecting = gameState[ownKey].mosqueteiroRedirectNextDiscard;
                  const pool = redirecting ? gameState[opponentKey].hand : gameState[ownKey].hand.filter((c) => c.id !== pendingMagic.cardId);
                  const selectedId = (pendingMagic.selectedCards || [])[0];
                  return (
                    <div>
                      <p className="text-[#BFB6A6] text-[12px] mb-2">
                        {redirecting ? 'Mão do Oponente (às cegas - selecione 1 carta):' : 'Sua mão (selecione 1 carta para descartar):'}
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {pool.map((card, idx) => (
                          <button
                            key={card.id}
                            onClick={() => setPendingMagic({ ...pendingMagic, selectedCards: [card.id] })}
                            className={`w-16 h-24 border-2 rounded flex flex-col items-center justify-center ${
                              selectedId === card.id ? 'border-[#6CC47A] bg-[#6CC47A]/10' : 'border-[#C59E4F]/30 hover:border-[#C59E4F]'
                            } transition-all text-[10px] text-[#BFB6A6]`}
                          >
                            {redirecting ? (
                              <>
                                <span className="text-[14px]">🃏</span>
                                <span className="text-[8px]">Carta {idx + 1}</span>
                              </>
                            ) : (
                              <span className="text-[14px]">
                                {getDisplayValue(card)}
                                {card.suit}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Mosqueteiro Q - Rajada Reveladora: até 3 cartas pra
                    descartar (mesma fonte do Valete acima), depois essa
                    mesma quantidade de alvos do oponente (mão OU campo,
                    ainda ocultos) pra revelar às cegas por posição. */}
                {pendingMagic.character === 'mosqueteiro' && pendingMagic.type === 'Q' && (() => {
                  const redirecting = gameState[ownKey].mosqueteiroRedirectNextDiscard;
                  const discardPool = redirecting ? gameState[opponentKey].hand : gameState[ownKey].hand.filter((c) => c.id !== pendingMagic.cardId);
                  const selectedDiscardIds = pendingMagic.selectedCards || [];
                  const selectedRevealIds = pendingMagic.selectedRevealCardIds || [];

                  const revealHandTargets = gameState[opponentKey].hand.filter((c) => !c.revealed);
                  const revealFieldTargets: { id: string; label: string }[] = [];
                  gameState[opponentKey].field.forEach((slot, slotIdx) => {
                    if (slot.faceDownCard && !slot.faceDownCard.revealed) {
                      revealFieldTargets.push({ id: slot.faceDownCard.id, label: `Campo - Slot ${slotIdx + 1}` });
                    }
                    slot.horizontalCards.forEach((h, hIdx) => {
                      if (!h.revealed) revealFieldTargets.push({ id: h.id, label: `Campo - Slot ${slotIdx + 1} (horiz. ${hIdx + 1})` });
                    });
                  });

                  const toggleDiscard = (id: string) => {
                    const next = selectedDiscardIds.includes(id)
                      ? selectedDiscardIds.filter((x) => x !== id)
                      : selectedDiscardIds.length < 3
                      ? [...selectedDiscardIds, id]
                      : selectedDiscardIds;
                    setPendingMagic({ ...pendingMagic, selectedCards: next });
                  };
                  const toggleReveal = (id: string) => {
                    const next = selectedRevealIds.includes(id)
                      ? selectedRevealIds.filter((x) => x !== id)
                      : selectedRevealIds.length < selectedDiscardIds.length
                      ? [...selectedRevealIds, id]
                      : selectedRevealIds;
                    setPendingMagic({ ...pendingMagic, selectedRevealCardIds: next });
                  };

                  return (
                    <div className="space-y-4">
                      <div>
                        <p className="text-[#BFB6A6] text-[12px] mb-2">
                          {redirecting
                            ? 'Mão do Oponente (às cegas - selecione até 3 cartas para descartar):'
                            : 'Sua mão (selecione até 3 cartas para descartar):'}
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          {discardPool.map((card, idx) => {
                            const selected = selectedDiscardIds.includes(card.id);
                            return (
                              <button
                                key={card.id}
                                onClick={() => toggleDiscard(card.id)}
                                className={`w-16 h-24 border-2 rounded flex flex-col items-center justify-center ${
                                  selected ? 'border-[#6CC47A] bg-[#6CC47A]/10' : 'border-[#C59E4F]/30 hover:border-[#C59E4F]'
                                } transition-all text-[10px] text-[#BFB6A6]`}
                              >
                                {redirecting ? (
                                  <>
                                    <span className="text-[14px]">🃏</span>
                                    <span className="text-[8px]">Carta {idx + 1}</span>
                                  </>
                                ) : (
                                  <span className="text-[14px]">
                                    {getDisplayValue(card)}
                                    {card.suit}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {selectedDiscardIds.length > 0 && (
                        <div>
                          <p className="text-[#BFB6A6] text-[12px] mb-2">
                            Escolha até {selectedDiscardIds.length} carta(s) do oponente pra revelar às cegas (mão ou campo):
                          </p>
                          <div className="flex gap-2 flex-wrap">
                            {revealHandTargets.map((card, idx) => {
                              const selected = selectedRevealIds.includes(card.id);
                              return (
                                <button
                                  key={card.id}
                                  onClick={() => toggleReveal(card.id)}
                                  className={`w-16 h-24 border-2 rounded flex flex-col items-center justify-center ${
                                    selected ? 'border-[#6CC47A] bg-[#6CC47A]/10' : 'border-[#C59E4F]/30 hover:border-[#C59E4F]'
                                  } transition-all text-[10px] text-[#BFB6A6]`}
                                >
                                  <span className="text-[14px]">🃏</span>
                                  <span className="text-[8px]">Mão {idx + 1}</span>
                                </button>
                              );
                            })}
                            {revealFieldTargets.map((t) => {
                              const selected = selectedRevealIds.includes(t.id);
                              return (
                                <button
                                  key={t.id}
                                  onClick={() => toggleReveal(t.id)}
                                  className={`w-16 h-24 border-2 rounded flex flex-col items-center justify-center ${
                                    selected ? 'border-[#6CC47A] bg-[#6CC47A]/10' : 'border-[#C59E4F]/30 hover:border-[#C59E4F]'
                                  } transition-all text-[10px] text-[#BFB6A6]`}
                                >
                                  <span className="text-[14px]">🃏</span>
                                  <span className="text-[8px]">{t.label}</span>
                                </button>
                              );
                            })}
                            {revealHandTargets.length === 0 && revealFieldTargets.length === 0 && (
                              <p className="text-[#8A5A5A] text-[11px]">Oponente não tem cartas ocultas pra revelar agora.</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Mosqueteiro K - Tiro Certeiro: uma carta do PRÓPRIO campo
                    (principal ou horizontal, revelada ou não) recebe o
                    bônus. */}
                {pendingMagic.character === 'mosqueteiro' && pendingMagic.type === 'K' && (() => {
                  const candidates: { id: string; label: string; card: Card }[] = [];
                  gameState[ownKey].field.forEach((slot, slotIdx) => {
                    if (slot.faceDownCard) candidates.push({ id: slot.faceDownCard.id, label: `Slot ${slotIdx + 1}`, card: slot.faceDownCard });
                    slot.horizontalCards.forEach((h, hIdx) => candidates.push({ id: h.id, label: `Slot ${slotIdx + 1} (horiz. ${hIdx + 1})`, card: h }));
                  });
                  const selectedId = (pendingMagic.selectedCards || [])[0];
                  // FIX (pedido do usuário: "o valor extra também conta o
                  // turno anterior") - a prévia mostrada aqui precisa somar
                  // a MESMA janela de 2 turnos que handleExecuteMagic usa de
                  // verdade na ativação (gameEngine.ts), senão o número
                  // mostrado no diálogo diverge do que realmente é aplicado.
                  const boostAmount = gameState[ownKey].mosqueteiroDiscardsThisTurn + gameState[ownKey].mosqueteiroDiscardsTurnMinus1;
                  return (
                    <div className="space-y-3">
                      <p className="text-[#BFB6A6] text-[12px]">
                        Selecione a carta do seu campo que vai receber +{boostAmount} de valor no combate:
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {candidates.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => setPendingMagic({ ...pendingMagic, selectedCards: [c.id] })}
                            className={`w-16 h-24 border-2 rounded flex flex-col items-center justify-center ${
                              selectedId === c.id ? 'border-[#6CC47A] bg-[#6CC47A]/10' : 'border-[#C59E4F]/30 hover:border-[#C59E4F]'
                            } transition-all text-[10px] text-[#BFB6A6]`}
                          >
                            <span className="text-[14px]">
                              {c.card.revealed ? `${getDisplayValue(c.card)}${c.card.suit}` : '🂠'}
                            </span>
                            <span className="text-[8px]">{c.label}</span>
                          </button>
                        ))}
                      </div>
                      {candidates.length === 0 && <p className="text-[#8A5A5A] text-[11px]">Nenhuma carta no seu campo ainda.</p>}
                    </div>
                  );
                })()}

                {/* Piromante (personagem novo) - as 3 magias (J/Q/K) sempre
                    oferecem a MESMA escolha: fazer o efeito próprio de
                    alimentar a Bola de Fogo, OU lançar a Bola de Fogo já
                    acumulada contra o oponente (pedido explícito do usuário -
                    ver MagicSelection.fireballLaunch em gameEngine.ts). O
                    bloco de escolha é compartilhado pelas 3; só o texto/alvo
                    do efeito próprio muda por tipo. */}
                {pendingMagic.character === 'piromante' &&
                  (() => {
                    const ctx = getMagicActivationContext(gameState, pendingMagic.playerNumber);
                    const cap = getFireballCap(gameConfig);
                    const fireballValue = gameState[ownKey].fireballValue;
                    const spreadArmed = gameState[ownKey].piromanteSpreadArmed;
                    // O efeito próprio de cada magia continua preso à fase da
                    // própria carta (J na Compra, Q na Estratégia, K no
                    // Combate) - no Combate, uma J/Q só pode LANÇAR (ver
                    // canActivateMagic/handleExecuteMagic). Sem esta checagem
                    // de fase o botão aparecia habilitado e o Confirmar era
                    // recusado em silêncio pelo motor.
                    const ownEffectAvailable =
                      gameState.phase === getMagicCardInfo('piromante', pendingMagic.type).phase &&
                      (pendingMagic.type === 'J'
                        ? Boolean(ctx.hasFireFuelInHand)
                        : pendingMagic.type === 'Q'
                          ? Boolean(ctx.hasRevealedBurnableOpponentCard)
                          : Boolean(ctx.hasUnbattledHorizontalCardsInOpponentFieldForBurn));
                    const launchAvailable = Boolean(ctx.canLaunchFireball);
                    const isLaunch = Boolean(pendingMagic.fireballLaunch);

                    return (
                      <div className="space-y-3">
                        <div className="flex gap-2 flex-wrap">
                          <button
                            disabled={!ownEffectAvailable}
                            onClick={() => setPendingMagic({ ...pendingMagic, fireballLaunch: false, selectedTargetSlot: undefined, selectedCards: [] })}
                            className={`flex-1 min-w-[160px] px-3 py-2 rounded border-2 text-[11px] text-left transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                              !isLaunch ? 'border-[#6CC47A] bg-[#6CC47A]/10 text-[#EFE7D6]' : 'border-[#C59E4F]/30 hover:border-[#C59E4F] text-[#BFB6A6]'
                            }`}
                          >
                            {pendingMagic.type === 'J' && 'Combustão: queime as cartas <5 da mão'}
                            {pendingMagic.type === 'Q' && 'Roubo Flamejante: queime uma carta revelada do oponente'}
                            {pendingMagic.type === 'K' && 'Queima do Reforço: queime uma horizontal do oponente'}
                          </button>
                          <button
                            disabled={!launchAvailable}
                            onClick={() => setPendingMagic({ ...pendingMagic, fireballLaunch: true, selectedCards: undefined })}
                            className={`flex-1 min-w-[160px] px-3 py-2 rounded border-2 text-[11px] text-left transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                              isLaunch ? 'border-[#FF8033] bg-[#FF8033]/10 text-[#EFE7D6]' : 'border-[#C59E4F]/30 hover:border-[#C59E4F] text-[#BFB6A6]'
                            }`}
                          >
                            🔥 Lançar a Bola de Fogo ({fireballValue}/{cap}){spreadArmed && ' - Chama Repartida armada!'}
                          </button>
                        </div>

                        {isLaunch && !spreadArmed && (
                          <div className="space-y-2">
                            <p className="text-[#BFB6A6] text-[12px]">Selecione o slot do campo do oponente a atingir:</p>
                            <div className="flex gap-3">
                              {gameState[opponentKey].field.map((slot, slotIdx) => {
                                const protectedSlot = isSlotProtectedFor(opponentNumber, slotIdx);
                                return (
                                  <button
                                    key={slotIdx}
                                    disabled={protectedSlot}
                                    onClick={() => setPendingMagic({ ...pendingMagic, selectedTargetSlot: slotIdx })}
                                    className={`w-20 h-16 border-2 rounded flex flex-col items-center justify-center text-[10px] transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                                      pendingMagic.selectedTargetSlot === slotIdx
                                        ? 'border-[#FF8033] bg-[#FF8033]/15 text-[#EFE7D6]'
                                        : 'border-[#C59E4F]/30 hover:border-[#C59E4F] text-[#BFB6A6]'
                                    }`}
                                  >
                                    <span>Slot {slotIdx + 1}</span>
                                    {protectedSlot && <span className="text-[8px] text-[#7AA7C4]">Protegido</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {isLaunch && spreadArmed && (
                          <p className="text-[#BFB6A6] text-[11px]">
                            Chama Repartida armada: a Bola de Fogo vai se dividir e atingir os 3 slots do campo do oponente de uma vez, cada um recebendo 1/3 do valor.
                          </p>
                        )}

                        {!isLaunch && pendingMagic.type === 'J' && (
                          <p className="text-[#BFB6A6] text-[11px]">
                            Todas as cartas de valor menor que 5 na sua mão serão queimadas automaticamente e somadas à Bola de Fogo.
                          </p>
                        )}

                        {!isLaunch && pendingMagic.type === 'Q' && (
                          <div className="space-y-2">
                            <p className="text-[#BFB6A6] text-[12px]">Selecione uma carta revelada do oponente (mão ou horizontal, 2-10) para queimar:</p>
                            <div className="flex flex-wrap gap-2">
                              {[
                                ...gameState[opponentKey].hand.filter((c) => c.revealed && getEffectiveCardValue(c) >= 2 && getEffectiveCardValue(c) <= 10),
                                ...gameState[opponentKey].field.flatMap((slot) =>
                                  slot.horizontalCards.filter((c) => c.revealed && getEffectiveCardValue(c) >= 2 && getEffectiveCardValue(c) <= 10)
                                ),
                              ].map((c) => (
                                <div
                                  key={c.id}
                                  onClick={() => setPendingMagic({ ...pendingMagic, selectedCards: [c.id] })}
                                  className={`cursor-pointer transition-all hover:scale-105 rounded ${
                                    (pendingMagic.selectedCards || [])[0] === c.id ? 'ring-2 ring-[#FF8033]' : ''
                                  }`}
                                >
                                  <PlayingCard value={c.value} suit={c.suit} card={c} />
                                </div>
                              ))}
                            </div>
                            {!ownEffectAvailable && <p className="text-[#8A5A5A] text-[11px]">Nenhuma carta revelada disponível para queimar agora.</p>}
                          </div>
                        )}

                        {!isLaunch && pendingMagic.type === 'K' && (
                          <div className="space-y-2">
                            <p className="text-[#BFB6A6] text-[12px]">Selecione uma carta horizontal (não combatida) do campo do oponente para queimar:</p>
                            <div className="flex flex-wrap gap-2">
                              {gameState[opponentKey].field.flatMap((slot, slotIdx) =>
                                slot.horizontalCards
                                  .filter((c) => !c.battled)
                                  .map((c) => (
                                    <div
                                      key={c.id}
                                      onClick={() => !isSlotProtectedFor(opponentNumber, slotIdx) && setPendingMagic({ ...pendingMagic, selectedCards: [c.id] })}
                                      className={`cursor-pointer transition-all hover:scale-105 rounded ${
                                        (pendingMagic.selectedCards || [])[0] === c.id ? 'ring-2 ring-[#FF8033]' : ''
                                      } ${isSlotProtectedFor(opponentNumber, slotIdx) ? 'opacity-30 pointer-events-none' : ''}`}
                                    >
                                      <PlayingCard value={c.value} suit={c.suit} card={c} />
                                    </div>
                                  ))
                              )}
                            </div>
                            {!ownEffectAvailable && <p className="text-[#8A5A5A] text-[11px]">Nenhuma horizontal disponível para queimar agora.</p>}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                {/* Druida (personagem novo) - Simbiose (Rainha) e Urtiga
                    (Rei) sempre oferecem a MESMA escolha (mesmo espírito do
                    Piromante acima): reduzir o Broto pela metade pra marcar
                    uma carta em combate, OU aumentar o Broto em 2. O bloco é
                    compartilhado pelas 2; só o alvo (próprio campo na
                    Rainha, campo do oponente no Rei) e a cor do marcador
                    (positivo/negativo) mudam. */}
                {pendingMagic.character === 'druida' &&
                  (() => {
                    const brotoSlot = gameState[ownKey].field.find(isBrotoSlot);
                    const brotoValue = brotoSlot?.faceDownCard?.transformedValue ?? 1;
                    const level = gameState[ownKey].druidaPhotosynthesisLevel;
                    const growAmount = 2 + level;
                    const halved = Math.floor(brotoValue / 2);
                    const isGrow = Boolean(pendingMagic.druidaGrowBroto);
                    const isUrtiga = pendingMagic.type === 'K';

                    const ownTargets = gameState[ownKey].field.flatMap((slot, slotIdx) =>
                      [
                        ...(slot.faceDownCard && slot.faceDownCard.id !== brotoSlot?.faceDownCard?.id ? [slot.faceDownCard] : []),
                        ...slot.horizontalCards,
                      ].map((c) => ({ card: c, slotIdx }))
                    );
                    const opponentTargets = gameState[opponentKey].field.flatMap((slot, slotIdx) =>
                      isSlotProtectedFor(opponentNumber, slotIdx)
                        ? []
                        : [...(slot.faceDownCard ? [slot.faceDownCard] : []), ...slot.horizontalCards].map((c) => ({ card: c, slotIdx }))
                    );
                    const targets = isUrtiga ? opponentTargets : ownTargets;

                    return (
                      <div className="space-y-3">
                        <div className="flex gap-2 flex-wrap">
                          <button
                            disabled={halved <= 0}
                            onClick={() => setPendingMagic({ ...pendingMagic, druidaGrowBroto: false, selectedCards: [] })}
                            className={`flex-1 min-w-[180px] px-3 py-2 rounded border-2 text-[11px] text-left transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                              !isGrow ? 'border-[#6CC47A] bg-[#6CC47A]/10 text-[#EFE7D6]' : 'border-[#C59E4F]/30 hover:border-[#C59E4F] text-[#BFB6A6]'
                            }`}
                          >
                            Reduzir o Broto para {halved} e marcar uma carta {isUrtiga ? 'do oponente' : 'sua'} com {isUrtiga ? '-' : '+'}
                            {halved + level}
                          </button>
                          <button
                            onClick={() => setPendingMagic({ ...pendingMagic, druidaGrowBroto: true, selectedCards: undefined })}
                            className={`flex-1 min-w-[180px] px-3 py-2 rounded border-2 text-[11px] text-left transition-all ${
                              isGrow ? 'border-[#0F8A19] bg-[#0F8A19]/10 text-[#EFE7D6]' : 'border-[#C59E4F]/30 hover:border-[#C59E4F] text-[#BFB6A6]'
                            }`}
                          >
                            🌱 Aumentar o Broto em {growAmount} (agora vale {brotoValue}, ficaria {brotoValue + growAmount})
                          </button>
                        </div>

                        {!isGrow && (
                          <div className="space-y-2">
                            <p className="text-[#BFB6A6] text-[12px]">
                              Selecione a carta {isUrtiga ? 'do campo do oponente' : 'do seu campo'} que vai receber o marcador:
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {targets.map(({ card: c }) => (
                                <div
                                  key={c.id}
                                  onClick={() => setPendingMagic({ ...pendingMagic, selectedCards: [c.id] })}
                                  className={`cursor-pointer transition-all hover:scale-105 rounded ${
                                    (pendingMagic.selectedCards || [])[0] === c.id ? 'ring-2 ring-[#0F8A19]' : ''
                                  }`}
                                >
                                  {c.revealed ? <PlayingCard value={c.value} suit={c.suit} card={c} /> : <div className="w-16 h-24 rounded bg-[#1E1A16] border-2 border-[#C59E4F]/30 flex items-center justify-center text-[20px]">🂠</div>}
                                </div>
                              ))}
                            </div>
                            {targets.length === 0 && <p className="text-[#8A5A5A] text-[11px]">Nenhuma carta {isUrtiga ? 'no campo do oponente' : 'no seu campo'} disponível agora.</p>}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={() => executeMagicEffect()}
                    disabled={(() => {
                      const { character, type, selectedCards, selectedSlot: pSlot, selectedTargetSlot } = pendingMagic;
                      if (character === 'mago' && type === 'J') return !selectedCards || selectedCards.length === 0;
                      if (character === 'besta' && type === 'J') return !selectedCards || selectedCards.length === 0;
                      if (character === 'mago' && type === 'Q') return pSlot === undefined || !selectedCards || selectedCards.length === 0;
                      if (character === 'besta' && type === 'Q') return pSlot === undefined || !selectedCards || selectedCards.length === 0;
                      if (character === 'anjo' && type === 'Q') return pSlot === undefined && (!selectedCards || selectedCards.length === 0);
                      if (character === 'mago' && type === 'K') return pSlot === undefined;
                      if (character === 'besta' && type === 'K') return pSlot === undefined || selectedTargetSlot === undefined;
                      if (character === 'mosqueteiro' && type === 'J') return !selectedCards || selectedCards.length === 0;
                      if (character === 'mosqueteiro' && type === 'Q') return !selectedCards || selectedCards.length === 0;
                      if (character === 'mosqueteiro' && type === 'K') return !selectedCards || selectedCards.length === 0;
                      if (character === 'piromante') {
                        if (pendingMagic.fireballLaunch) {
                          const spreadArmed = gameState[playerKeyOf(pendingMagic.playerNumber)].piromanteSpreadArmed;
                          return !spreadArmed && selectedTargetSlot === undefined;
                        }
                        // FIX (bug real relatado pelo usuário: "não dá pra
                        // clicar em confirmar mesmo tendo 2 três na mão") -
                        // `fireballLaunch` pode estar `false` (clicou em
                        // "efeito próprio" explicitamente) OU ainda
                        // `undefined` (nunca clicou em nenhum dos dois
                        // botões) - os dois precisam se comportar IGUAL
                        // aqui, porque o botão "efeito próprio" já nasce
                        // visualmente destacado por padrão (ver o estilo
                        // `!isLaunch` dele, mais abaixo) mesmo sem clique
                        // nenhum. Exigir um clique EXPLÍCITO só pra "confirmar
                        // a opção que já está selecionada na tela" travava o
                        // Confirmar mesmo com cartas <5 elegíveis visíveis na
                        // mão - o usuário via a Combustão "escolhida" mas não
                        // conseguia avançar.
                        if (type === 'J') return false; // Combustão própria não exige seleção (junta tudo automaticamente)
                        return !selectedCards || selectedCards.length === 0;
                      }
                      if (character === 'druida') {
                        if (pendingMagic.druidaGrowBroto) return false;
                        return !selectedCards || selectedCards.length === 0;
                      }
                      return false;
                    })()}
                    className="flex-1 bg-[#6CC47A] hover:bg-[#4A8A5A] text-[#0F1113] disabled:opacity-30"
                  >
                    Confirmar
                  </Button>
                  <Button
                    onClick={() => setPendingMagic(null)}
                    variant="outline"
                    className="flex-1 border-[#C59E4F] text-[#C59E4F]"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Diálogo de Transformação do Ás */}
      <Dialog open={!!pendingAceTransform} onOpenChange={(open) => !open && setPendingAceTransform(null)}>
        <DialogContent className="bg-[#1E1A16] border-[#C59E4F] max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#EFE7D6] font-display text-[20px]">
              {pendingAceTransform && `Transformar Ás - ${pendingAceTransform.playerNumber === 1 ? p1Theme.name : p2Theme.name}`}
            </DialogTitle>
            <DialogDescription className="text-[#BFB6A6]">
              Selecione uma carta da sua mão ou já posicionada no seu campo. O Ás assumirá o valor dessa carta e ambas ficarão reveladas.
            </DialogDescription>
          </DialogHeader>

          {pendingAceTransform && (
            <div className="space-y-4">
              <p className="text-[#BFB6A6] text-[12px]">Selecione uma carta da mão (2-10):</p>
              <ScrollArea className="h-40">
                <div className="flex flex-wrap gap-3">
                  {gameState[playerKeyOf(pendingAceTransform.playerNumber)].hand
                    // FIX (checagem extensa por bugs - consolidação de regra
                    // duplicada): usa `isValidAceTransformTarget` (cardUtils.ts),
                    // a MESMA função que handleTransformAce (gameEngine.ts) e
                    // decideAceTransform (aiPlayer.ts) usam - antes esta lista
                    // reescrevia a regra pela 3ª vez à mão, um lugar a mais
                    // onde ela podia divergir silenciosamente no futuro.
                    .filter((c) => c.id !== pendingAceTransform.aceCardId && isValidAceTransformTarget(c))
                    .map((card) => (
                      <div
                        key={card.id}
                        onClick={() => executeAceTransform(card.id)}
                        className="cursor-pointer transition-all hover:scale-105"
                      >
                        <PlayingCard value={card.value} suit={card.suit} card={card} />
                      </div>
                    ))}
                </div>
              </ScrollArea>

              {/* FIX (item 19): antes só cartas na mão podiam ser alvo da
                  transformação - agora cartas já posicionadas no próprio
                  campo (faceDownCard) também podem, então um Ás já em campo
                  não fica sem opção de transformação caso a mão não tenha
                  mais nenhuma carta numeral disponível. */}
              <p className="text-[#BFB6A6] text-[12px]">Ou uma carta já posicionada no seu campo:</p>
              <ScrollArea className="h-40">
                <div className="flex flex-wrap gap-3">
                  {gameState[playerKeyOf(pendingAceTransform.playerNumber)].field
                    // Mesma consolidação acima: `isValidAceTransformTarget`.
                    .filter(
                      (s) => s.faceDownCard && s.faceDownCard.id !== pendingAceTransform.aceCardId && isValidAceTransformTarget(s.faceDownCard)
                    )
                    .map((s) => (
                      <div
                        key={s.faceDownCard!.id}
                        onClick={() => executeAceTransform(s.faceDownCard!.id)}
                        className="cursor-pointer transition-all hover:scale-105"
                      >
                        <PlayingCard value={s.faceDownCard!.value} suit={s.faceDownCard!.suit} card={s.faceDownCard} />
                      </div>
                    ))}
                </div>
              </ScrollArea>

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => setPendingAceTransform(null)}
                  variant="outline"
                  className="flex-1 border-[#C59E4F] text-[#C59E4F]"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo de Efeito de Monstro (Mago - Ilusão Arcana) */}
      <Dialog open={!!pendingMonsterEffect} onOpenChange={(open) => !open && setPendingMonsterEffect(null)}>
        <DialogContent className="bg-[#1E1A16] border-[#C59E4F] max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#EFE7D6] font-display text-[20px]">
              🃏 Ilusão Arcana
            </DialogTitle>
            <DialogDescription className="text-[#BFB6A6]">
              {/* FIX (item 7): agora o valor copiado vai para uma carta do
                  PRÓPRIO campo (slot já escolhido antes de abrir este
                  diálogo), não mais para o Coringa em si (que nunca mais
                  entra em combate). */}
              {pendingMonsterEffect && `Selecione uma carta revelada no campo para copiar seu valor para o slot ${pendingMonsterEffect.targetSlotIndex + 1} do seu campo`}
            </DialogDescription>
          </DialogHeader>

          {pendingMonsterEffect && (
            <div>
              <p className="text-[#BFB6A6] text-[12px] mb-2">Cartas reveladas disponíveis:</p>
              <ScrollArea className="h-48 border border-[#C59E4F]/30 rounded p-2">
                <div className="flex flex-wrap gap-2">
                  {[...gameState.player1.field, ...gameState.player2.field]
                    .filter((slot) => slot.faceDownCard && slot.revealed)
                    .map((slot) => (
                      <div
                        key={slot.faceDownCard!.id}
                        onClick={() => executeMonsterEffect(slot.faceDownCard!.id)}
                        className="cursor-pointer transition-all hover:scale-105"
                      >
                        <PlayingCard value={slot.faceDownCard!.value} suit={slot.faceDownCard!.suit} card={slot.faceDownCard} />
                      </div>
                    ))}
                  {[...gameState.player1.field, ...gameState.player2.field].every((slot) => !slot.faceDownCard || !slot.revealed) && (
                    <p className="text-[#BFB6A6] text-[11px]">Nenhuma carta revelada no campo ainda.</p>
                  )}
                </div>
              </ScrollArea>

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => setPendingMonsterEffect(null)}
                  variant="outline"
                  className="flex-1 border-[#C59E4F] text-[#C59E4F]"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo de Efeito de Monstro (Besta - Fúria Selvagem): escolher QUAL
          carta do slot (principal ou horizontal) dobrar - só aparece quando o
          slot escolhido tem mais de 1 carta (ver handleFieldSlotClick). */}
      <Dialog open={!!pendingBestaMonsterTarget} onOpenChange={(open) => !open && setPendingBestaMonsterTarget(null)}>
        <DialogContent className="bg-[#1E1A16] border-[#C59E4F] max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#EFE7D6] font-display text-[20px]">
              🃏 Fúria Selvagem
            </DialogTitle>
            <DialogDescription className="text-[#BFB6A6]">
              {pendingBestaMonsterTarget && `Selecione qual carta do slot ${pendingBestaMonsterTarget.targetSlotIndex + 1} terá o valor dobrado`}
            </DialogDescription>
          </DialogHeader>

          {pendingBestaMonsterTarget && (
            <div>
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const slot = gameState[playerKeyOf(pendingBestaMonsterTarget.playerNumber)].field[pendingBestaMonsterTarget.targetSlotIndex];
                  const candidates = [slot.faceDownCard, ...slot.horizontalCards].filter((c): c is Card => Boolean(c));
                  return candidates.map((c) => (
                    <div key={c.id} onClick={() => executeBestaMonsterEffect(c.id)} className="cursor-pointer transition-all hover:scale-105">
                      <PlayingCard value={c.value} suit={c.suit} card={c} />
                    </div>
                  ));
                })()}
              </div>

              <div className="flex gap-3 pt-3">
                <Button
                  onClick={() => setPendingBestaMonsterTarget(null)}
                  variant="outline"
                  className="flex-1 border-[#C59E4F] text-[#C59E4F]"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo da Rainha armadilha do Coringa, revelada em Combate (ver
          pendingCoringaQChoice/executeCoringaQChoice): escolhe qual carta
          REVELADA do campo do OPONENTE a Rainha vai copiar. Só aparece
          quando os 2 slots de combate já foram selecionados e um deles
          contém a Rainha - ver o useEffect que detecta os dois slots. */}
      <Dialog open={!!pendingCoringaQChoice} onOpenChange={(open) => !open && executeCoringaQChoice(undefined)}>
        <DialogContent className="bg-[#1E1A16] border-[#C59E4F] max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#EFE7D6] font-display text-[20px]">
              🎭 Rainha Armadilha Revelada
            </DialogTitle>
            <DialogDescription className="text-[#BFB6A6]">
              Escolha uma carta revelada do campo do oponente - a Rainha vai copiar o valor dela nesta disputa.
            </DialogDescription>
          </DialogHeader>

          {pendingCoringaQChoice && (() => {
            const opponentKeyForQ = playerKeyOf(opponentOf(pendingCoringaQChoice.qOwner));
            const candidates = gameState[opponentKeyForQ].field.flatMap((slot) => [
              ...(slot.faceDownCard?.revealed ? [slot.faceDownCard] : []),
              ...slot.horizontalCards.filter((c) => c.revealed),
            ]);
            return (
              <div>
                <div className="flex flex-wrap gap-2">
                  {candidates.map((c) => (
                    <div key={c.id} onClick={() => executeCoringaQChoice(c.id)} className="cursor-pointer transition-all hover:scale-105">
                      <PlayingCard value={c.value} suit={c.suit} card={c} />
                    </div>
                  ))}
                  {candidates.length === 0 && (
                    <p className="text-[#8A5A5A] text-[11px]">Oponente não tem nenhuma carta revelada agora - a Rainha vale 1 nesta disputa.</p>
                  )}
                </div>

                <div className="flex gap-3 pt-3">
                  <Button
                    onClick={() => executeCoringaQChoice(undefined)}
                    variant="outline"
                    className="flex-1 border-[#C59E4F] text-[#C59E4F]"
                  >
                    {candidates.length === 0 ? 'Continuar' : 'Não copiar (vale 1)'}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Popup de Ativação da Magia Numeral */}
      <Dialog open={showNumeralSpellPopup} onOpenChange={setShowNumeralSpellPopup}>
        <DialogContent className="bg-[#1E1A16] border-[#C59E4F] max-w-lg">
          <DialogHeader>
            {gameState.numeralSpellPending && (() => {
              const theme = getCharacterTheme(gameState.numeralSpellPending.character);
              const spellInfo = getNumeralSpellInfo(gameState.numeralSpellPending.character);
              return (
                <div className="flex flex-col items-center gap-4 py-4">
                  <motion.div
                    animate={settings.animations ? { scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] } : undefined}
                    transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 0.3 }}
                    className="w-20 h-20 rounded-full flex items-center justify-center text-[48px]"
                    style={{
                      backgroundColor: `${theme.primary}20`,
                      boxShadow: `0 0 40px ${theme.primary}80`,
                    }}
                  >
                    ✨
                  </motion.div>

                  <DialogTitle
                    className="text-[#EFE7D6] font-display text-[32px] text-center"
                    style={{ color: theme.primary }}
                  >
                    Magia Numeral Ativada!
                  </DialogTitle>

                  <p className="text-[#EFE7D6] text-[20px] text-center">
                    {theme.name}
                  </p>

                  <div
                    className="border-2 rounded-lg p-4 w-full"
                    style={{
                      backgroundColor: `${theme.dark}40`,
                      borderColor: theme.primary,
                    }}
                  >
                    <p
                      className="text-[14px] mb-2 text-center"
                      style={{ color: theme.primary }}
                    >
                      {spellInfo.name}
                    </p>
                    <p className="text-[12px] text-[#BFB6A6] text-center">
                      {spellInfo.description}
                    </p>
                  </div>
                </div>
              );
            })()}
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Pausa - FIX (pedido do usuário: "criar mais
          configurações durante o jogo no menu de pause... reduzir
          efeitos, mutar sons ou reduzir/aumentar som, remover shaking") -
          antes só tinha "Retomar"/"Sair do Jogo"; agora também os ajustes
          rápidos mais relevantes NO MEIO de uma partida, sem precisar sair
          (o que destruiria o estado da partida - ver comentário em
          App.tsx sobre GameBoard não ficar montado fora da tela 'game').
          Reaproveita o MESMO `settings`/`updateSetting` de Settings.tsx
          (useSettings() já estava importado aqui) - mudar aqui reflete lá
          e vice-versa, é a mesma preferência persistida. */}
      {/* FIX (pedido do usuário: "atalho de Configurações direto no topo...
          sem passar pelo 'Jogo Pausado'") - `open` agora reage aos DOIS
          motivos independentes (ver `showQuickSettings` acima); fechar por
          QUALQUER via (Esc, clique fora, botão) limpa os dois - se estava
          pausado de verdade, despausa também, nunca deixa a partida presa
          pausada por causa do atalho de configurações. */}
      <Dialog
        open={gameState.paused || showQuickSettings}
        onOpenChange={(open) => {
          if (!open) {
            setShowQuickSettings(false);
            if (gameState.paused) dispatch({ type: 'TOGGLE_PAUSE' });
          }
        }}
      >
        <DialogContent className="bg-[#1E1A16] border-[#C59E4F] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#EFE7D6] font-display text-[24px]">
              {gameState.paused ? 'Jogo Pausado' : 'Configurações Rápidas'}
            </DialogTitle>
            <DialogDescription className="text-[#BFB6A6]">
              {gameState.paused ? 'O jogo está pausado. Clique em retomar para continuar.' : 'A partida continua rodando por trás.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 border-t border-[#C59E4F]/20 pt-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="pauseSoundEffects" className="text-[#BFB6A6]">
                Efeitos Sonoros
              </Label>
              <Switch
                id="pauseSoundEffects"
                checked={settings.soundEffects}
                onCheckedChange={(checked) => updateSetting('soundEffects', checked)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pauseVolume" className="text-[#BFB6A6]">
                Volume: {settings.volume}%
              </Label>
              <Slider
                id="pauseVolume"
                value={[settings.volume]}
                onValueChange={([value]) => updateSetting('volume', value)}
                max={100}
                step={1}
                disabled={!settings.soundEffects}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="pauseParticleEffects" className="text-[#BFB6A6]">
                Efeitos de Partículas
              </Label>
              <Switch
                id="pauseParticleEffects"
                checked={settings.particleEffects}
                onCheckedChange={(checked) => updateSetting('particleEffects', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="pauseAnimations" className="text-[#BFB6A6]">
                Animações
              </Label>
              <Switch
                id="pauseAnimations"
                checked={settings.animations}
                onCheckedChange={(checked) => updateSetting('animations', checked)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pauseAnimationSpeed" className="text-[#BFB6A6]">
                Velocidade de Animação: {settings.animationSpeed}%
              </Label>
              <Slider
                id="pauseAnimationSpeed"
                value={[settings.animationSpeed]}
                onValueChange={([value]) => updateSetting('animationSpeed', value)}
                min={50}
                max={200}
                step={10}
                disabled={!settings.animations}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="pauseScreenShake" className="text-[#BFB6A6]">
                  Tremor de Tela
                </Label>
                <p className="text-[11px] text-[#BFB6A6]/70">Golpe decisivo de combate e Magia Numeral</p>
              </div>
              <Switch
                id="pauseScreenShake"
                checked={settings.screenShakeEnabled}
                onCheckedChange={(checked) => updateSetting('screenShakeEnabled', checked)}
                disabled={!settings.animations}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="pauseScreenFlash" className="text-[#BFB6A6]">
                Flash de Tela
              </Label>
              <Switch
                id="pauseScreenFlash"
                checked={settings.screenFlashEnabled}
                onCheckedChange={(checked) => updateSetting('screenFlashEnabled', checked)}
                disabled={!settings.animations}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="pauseHighContrast" className="text-[#BFB6A6]">
                Alto Contraste
              </Label>
              <Switch
                id="pauseHighContrast"
                checked={settings.highContrast}
                onCheckedChange={(checked) => updateSetting('highContrast', checked)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pauseInterfaceZoom" className="text-[#BFB6A6]">
                Tamanho da Interface: {settings.interfaceZoom}%
              </Label>
              <Slider
                id="pauseInterfaceZoom"
                value={[settings.interfaceZoom]}
                onValueChange={([value]) => updateSetting('interfaceZoom', value)}
                min={60}
                max={100}
                step={5}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="pauseShowActionLog" className="text-[#BFB6A6]">
                Log de Ações
              </Label>
              <Switch
                id="pauseShowActionLog"
                checked={settings.showActionLog}
                onCheckedChange={(checked) => updateSetting('showActionLog', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="pauseConfirmDiscard" className="text-[#BFB6A6]">
                Confirmar Antes de Descartar
              </Label>
              <Switch
                id="pauseConfirmDiscard"
                checked={settings.confirmBeforeDiscard}
                onCheckedChange={(checked) => updateSetting('confirmBeforeDiscard', checked)}
              />
            </div>
            {/* FIX (pedido do usuário: "ocultar mão do oponente
                automaticamente" no Hotseat) - só faz sentido nesse modo (ver
                comentário completo em hotseatPrivacyMode, settings.ts). */}
            {gameConfig.mode === 'hotseat' && (
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="pauseHotseatPrivacy" className="text-[#BFB6A6]">
                    Ocultar Mão ao Passar o Dispositivo
                  </Label>
                  <p className="text-[11px] text-[#BFB6A6]/70">Cada jogador revela a própria mão com um botão</p>
                </div>
                <Switch
                  id="pauseHotseatPrivacy"
                  checked={settings.hotseatPrivacyMode}
                  onCheckedChange={(checked) => updateSetting('hotseatPrivacyMode', checked)}
                />
              </div>
            )}
          </div>

          <div className="flex gap-4 pt-2">
            <Button
              onClick={() => {
                setShowQuickSettings(false);
                if (gameState.paused) dispatch({ type: 'TOGGLE_PAUSE' });
              }}
              className="flex-1 bg-[#C59E4F] hover:bg-[#8F6A30] text-[#0F1113]"
            >
              {gameState.paused ? 'Retomar' : 'Fechar'}
            </Button>
            <Button
              onClick={onBack}
              variant="outline"
              className="flex-1 border-[#C59E4F] text-[#C59E4F]"
            >
              Sair do Jogo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ZoomContainerContext.Provider>
    </div>
    {/* FIX (bug "a carta sempre fica pra esquerda/cima do mouse ao arrastar"
        - causa raiz real, achada só agora): este componente vivia DENTRO da
        div de `zoom: 0.85` acima. `zoom` (diferente de `transform: scale`)
        reescala o próprio SISTEMA DE UNIDADES `px` pra tudo que está dentro
        dele, incluindo elementos `position: fixed` - então o
        `translate(${mouseX}px, ...)` de CardDragLayer.tsx (calculado com a
        posição REAL do mouse, em px de tela de verdade) era interpretado
        como px NESSA escala reduzida e desenhado a só 85% da distância real
        percorrida a partir do canto superior esquerdo - o preview da carta
        ficava sistematicamente pra esquerda/cima do cursor real, tanto mais
        quanto mais longe do canto (mesmo bug de raiz já corrigido em
        ui/tooltip.tsx, ui/select.tsx e ui/dialog.tsx, só que lá era via
        Portal do Radix - aqui é porque este componente nunca usou Portal,
        só nasce onde é colocado no JSX). Movido pra FORA da árvore zoomada,
        como irmão dela - `renderX`/`renderY` (px reais) agora batem 1:1 com
        a tela de verdade. Ver CardDragLayer.tsx para a compensação visual
        de tamanho (senão a carta arrastada ficaria ~18% maior que o resto
        do tabuleiro, que continua encolhido). */}
    <CardDragLayer />
    {/* FIX ("projéteis não aparecem disparando"): mesma causa raiz e mesma
        correção do CardDragLayer.tsx acima - estes dois viviam DENTRO da
        árvore com `zoom: 0.85`, então seus `position: fixed` calculados a
        partir de `getBoundingClientRect()` (px de tela REAL) eram
        reinterpretados nessa escala reduzida e desenhados bem fora do lugar
        (perto do canto superior esquerdo da tela, não perto da origem/alvo
        de verdade) - o projétil TÉCNICAMENTE disparava (o dispatch/som/dano
        aconteciam certinho) mas o efeito visual em si nunca aparecia no
        lugar certo. Movidos pra FORA da árvore zoomada, como irmãos dela. */}
    <BulletImpactBurst specs={bulletImpacts} />
    {fireballProjectiles.map((spec) => (
      <FireballProjectile key={spec.key} spec={spec} />
    ))}
    </>
  );
}
