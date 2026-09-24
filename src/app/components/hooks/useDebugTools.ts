import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { createInitialState } from '../../lib/gameStateFactory';
import { gameReducer } from '../../lib/gameEngine';
import { decideAiActionTraced } from '../../lib/aiPlayer';
import { simulateSteps, fuzzSteps } from '../../lib/simulateGame';
import { enumerateLegalActions, checkActionDivergence } from '../../lib/actionSpace';
import { checkInvariants } from '../../lib/invariants';
import { setSeed, getSeed, clearSeed } from '../../lib/rng';
import { useSettings } from '../../context/SettingsContext';
import type { GameState } from '../../lib/gameStateTypes';
import type { GameAction } from '../../lib/gameActionTypes';
import type { PlayerNumber } from '../../lib/gameTypes';
import type { GameConfig } from '../../lib/gameConfig';
import type { CharacterId } from '../../lib/characterRegistry';

interface ReplayLog {
  initialState: GameState;
  actions: GameAction[];
}

export interface UseDebugToolsParams {
  gameState: GameState;
  /** O `dispatch` "seguro" de GameBoard.tsx (respeita showPhaseTransition/postMagicPause/cardInspection) - continua definido lá, só consumido aqui. */
  dispatch: (action: GameAction) => void;
  /** O `dispatch` cru de GameBoard.tsx (grava em recordedActionsRef, único ponto de estrangulamento de toda ação real) - continua definido lá, só consumido aqui. */
  rawDispatch: (action: GameAction) => void;
  initialStateRef: MutableRefObject<GameState | null>;
  recordedActionsRef: MutableRefObject<GameAction[]>;
  loadedReplayRef: MutableRefObject<ReplayLog | null>;
  player1Character: CharacterId;
  player2Character: CharacterId;
  gameConfig: GameConfig;
  initialCardTotal: number;
  setDebugGameConfigOverride: Dispatch<SetStateAction<Partial<GameConfig> | null>>;
}

/**
 * useDebugTools - GameBoard Overhaul (item 6 do roadmap arquitetural de
 * overhaul): primeira extração de orquestração do GameBoard.tsx monolítico
 * pra um hook dedicado, sem mexer em NENHUMA regra de jogo. Escolhido como
 * primeiro corte por ser o mais seguro possível: só roda em DEV
 * (`import.meta.env.DEV`, eliminado do bundle de produção pelo Vite), não
 * decide NADA de jogo (só expõe/inspeciona `gameState` e os mesmos
 * `dispatch`/`rawDispatch` que o resto de GameBoard.tsx já usa pra agir de
 * verdade) e não retorna JSX nem estado que outra parte do componente
 * precise consumir - um `useEffect` extraído palavra por palavra do bloco
 * que já existia dentro de GameBoard.tsx, só trocando fechamento sobre
 * variáveis locais por parâmetros explícitos.
 *
 * `dispatch` continua em GameBoard.tsx (depende de showPhaseTransition/
 * postMagicPause/cardInspection - estado de UI espalhado pelo componente,
 * "único ponto de estrangulamento" usado por TODO handler de interação real,
 * não só por debug) - só é CONSUMIDO aqui como valor já pronto, nunca
 * redefinido. O mesmo vale pra `rawDispatch` e as 3 refs de replay
 * (initialStateRef/recordedActionsRef/loadedReplayRef): GameBoard.tsx
 * continua sendo o dono de todas elas (o botão "exportar replay" na UI,
 * fora do escopo `import.meta.env.DEV`, também precisa das mesmas refs).
 *
 * window.__debug.state              -> GameState atual (sempre em dia)
 * window.__debug.dispatch(action)   -> despacha qualquer GameAction, MESMO
 *   caminho de uma ação real (respeita o guard de showPhaseTransition)
 * window.__debug.forceState(state)  -> substitui o estado INTEIRO na hora
 *   (via a ação 'DEBUG_FORCE_STATE', ver o topo de gameReducer em
 *   gameEngine.ts) - ignora até o guard de transição de fase, pra nunca
 *   ficar preso esperando um popup fechar. Ideal pra montar cenários exatos
 *   sem depender de RNG - pegue window.__debug.state, edite os campos que
 *   precisar (imutável - construa um objeto novo) e chame forceState com o
 *   resultado.
 * window.__debug.fastForward(maxSteps?, opts?) -> roda até maxSteps (padrão
 *   200, teto de segurança 5000) decisões de IA PURAMENTE em memória (mesmo
 *   laço de scripts/sanity-test.ts/simulateAiVsAiGame, sem nenhum timer real
 *   nem efeito visual no meio do caminho) e só então aplica o resultado
 *   final via forceState de uma vez. Devolve
 *   { steps, stuck, rejectedActions, gameOver } - rejectedActions.length > 0
 *   sinaliza a IA propondo algo que o motor recusou em silêncio. PAUSA a
 *   partida ao terminar por padrão (opts.stayRunning: true pra não pausar).
 * window.__debug.pause() / .resume() -> força paused pro valor exato (não é
 *   um toggle).
 * window.__debug.restart()          -> reembaralha uma partida NOVA (mesmos
 *   personagens/config desta) instantaneamente, sem passar pelo Menu
 *   Principal/DebugPanel de novo.
 * window.__debug.setAnimationsEnabled(bool) -> atalho pro switch
 *   "Animações" de Configurações - desligado, todo popup/transição vira
 *   efetivamente instantâneo, o que também acelera o "pensando..." de cada
 *   ação real da IA.
 * window.__debug.characters         -> { player1, player2 } desta partida
 * window.__debug.setGameConfig(partial | null) -> sobrescreve na hora
 *   qualquer campo de ritmo/pacing de gameConfig (ex.: { postMagicPauseMs:
 *   3000 }, { aiThinkScale: 0 }) sem precisar navegar a tela de
 *   Configuração nem recriar o useReducer - mescla por cima (null limpa
 *   tudo). Nunca afeta gameState.gameConfig (a cópia congelada usada pelo
 *   reducer para regras determinísticas).
 * window.__debug.enumerateActions(player?) / (state, player?) -> lista TODA
 *   ação legal pro player (padrão 1), no estado atual OU num `state`
 *   explícito passado como 1º argumento (dispatch por tipo - ver FIX no
 *   corpo da função) - reaproveita os predicados canX do motor
 *   (actionSpace.ts, modo "legal"). Não despacha nada, só lista.
 * window.__debug.tryEveryAction(player?) / (state, player?) -> roda o modo
 *   EXAUSTIVO (actionSpace.ts) contra uma cópia local do estado (atual, ou o
 *   `state` explícito passado) - despacha toda ação sintaticamente plausível
 *   direto contra gameReducer (NUNCA via rawDispatch/dispatch, então NUNCA
 *   muda a partida ao vivo). Pode ser lento - comando manual de console,
 *   nunca chame num loop/useEffect.
 * window.__debug.checkInvariants()  -> checagem de saúde (conservação de
 *   cartas + ids duplicados, invariants.ts) contra o estado atual.
 * window.__debug.fuzz(steps?, opts?) -> versão interativa do fuzzer
 *   (fuzzSteps, simulateGame.ts) - substitui a escolha da IA heurística por
 *   uma ação aleatória opts.substituteProbability (padrão 0.15) das vezes,
 *   verificando invariantes a cada passo. Aplica o resultado e PAUSA. Pra
 *   reproduzir uma falha achada aqui, anote getSeed() ANTES e use setSeed
 *   de novo com o mesmo número.
 * window.__debug.setSeed(n) / getSeed() / clearSeed() -> troca/lê/limpa a
 *   semente do RNG (rng.ts) - a MESMA semente reproduz a MESMA sequência de
 *   decisões aleatórias daqui em diante.
 * window.__debug.getReplayLog()     -> { initialState, actions } gravados
 *   desde o início desta partida (ou desde o último restart()) - toda ação
 *   que passou pelo reducer. JSON.stringify isso salva um relato de bug
 *   reproduzível de verdade (ver Replay/Bug Capsule -
 *   scripts/generate-replay-fixture.ts/replay-regression-test.ts).
 * window.__debug.loadReplayLog(log) -> troca a fonte usada por
 *   replayToStep pra um log EXTERNO, sem mexer na partida atual.
 * window.__debug.replayToStep(n?)   -> redespacha o log carregado (ou o
 *   desta sessão) do zero até o passo n e aplica via forceState, sempre
 *   pausado.
 * window.__debug.decideAiActionTraced(player?) / (state, player?) -> mesma
 *   função usada pelo painel visual de inspeção de IA, exposta aqui pra
 *   inspecionar via console/script sem abrir o painel. Aceita o atalho de
 *   console (só `player`, usa o estado atual) OU a assinatura real espelhada
 *   1:1 (`state` explícito primeiro - dispatch por tipo do 1º argumento, ver
 *   FIX no corpo da função). Ver AiDecisionTrace em aiPlayer.ts.
 */
export function useDebugTools({
  gameState,
  dispatch,
  rawDispatch,
  initialStateRef,
  recordedActionsRef,
  loadedReplayRef,
  player1Character,
  player2Character,
  gameConfig,
  initialCardTotal,
  setDebugGameConfigOverride,
}: UseDebugToolsParams): void {
  const { updateSetting } = useSettings();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const fastForward = (maxSteps = 200, options?: { stayRunning?: boolean }) => {
      const { state, steps, stuck, rejectedActions } = simulateSteps(gameState, { maxSteps });
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
      return {
        steps: result.steps,
        stuck: result.stuck,
        rejectedActions: result.rejectedActions,
        violation: result.violation,
        gameOver: result.state.gameOver,
      };
    };

    const getReplayLog = (): ReplayLog => ({ initialState: initialStateRef.current!, actions: [...recordedActionsRef.current] });
    const loadReplayLog = (log: ReplayLog) => {
      loadedReplayRef.current = log;
    };
    const replayToStep = (step: number = Infinity) => {
      const log = loadedReplayRef.current ?? getReplayLog();
      const targetStep = Math.max(0, Math.min(step, log.actions.length));
      let replayState = log.initialState;
      for (let i = 0; i < targetStep; i++) {
        replayState = gameReducer(replayState, log.actions[i]);
      }
      rawDispatch({ type: 'DEBUG_FORCE_STATE', state: { ...replayState, paused: true } });
      return { step: targetStep, totalSteps: log.actions.length, gameOver: replayState.gameOver };
    };

    (window as unknown as { __debug: unknown }).__debug = {
      state: gameState,
      dispatch,
      forceState: (state: GameState) => rawDispatch({ type: 'DEBUG_FORCE_STATE', state }),
      fastForward,
      pause: () => rawDispatch({ type: 'DEBUG_FORCE_STATE', state: { ...gameState, paused: true } }),
      resume: () => rawDispatch({ type: 'DEBUG_FORCE_STATE', state: { ...gameState, paused: false } }),
      restart: () => {
        const freshState = createInitialState(player1Character, player2Character, gameConfig);
        initialStateRef.current = freshState;
        recordedActionsRef.current = [];
        loadedReplayRef.current = null;
        rawDispatch({ type: 'DEBUG_FORCE_STATE', state: freshState });
      },
      setAnimationsEnabled: (enabled: boolean) => updateSetting('animations', enabled),
      setGameConfig: (partial: Partial<GameConfig> | null) =>
        setDebugGameConfigOverride((prev) => (partial === null ? null : { ...prev, ...partial })),
      // FIX (bug relatado ao vivo, achado testando os 3 wrappers abaixo:
      // window.__debug.decideAiActionTraced(window.__debug.state, 1) e (...,
      // 2) sempre devolviam o character do player2): as 3 funções abaixo
      // tinham assinatura `(player = 1)` - UM parâmetro só - enquanto as
      // funções reais que envolvem (enumerateLegalActions/checkActionDivergence
      // em actionSpace.ts, decideAiActionTraced em aiPlayer.ts) são todas
      // `(state, player)`, DOIS. Chamar do jeito mais óbvio, espelhando o
      // nome e a função real, fazia `state` (um objeto) cair na posição de
      // `player`, e o número real virar um 3º argumento IGNORADO -
      // `player === 1` então dava sempre `false` (objeto !== número).
      // Corrigido aceitando as DUAS formas de chamada (dispatch por tipo do
      // 1º argumento): `fn(player?)` (atalho de console, usa o estado
      // atual) e `fn(state, player?)` (assinatura real, espelhada 1:1).
      enumerateActions: (stateOrPlayer: GameState | PlayerNumber = gameState, player?: PlayerNumber) => {
        const [state, p]: [GameState, PlayerNumber] =
          typeof stateOrPlayer === 'number' ? [gameState, stateOrPlayer] : [stateOrPlayer, player ?? 1];
        return enumerateLegalActions(state, p);
      },
      tryEveryAction: (stateOrPlayer: GameState | PlayerNumber = gameState, player?: PlayerNumber) => {
        const [state, p]: [GameState, PlayerNumber] =
          typeof stateOrPlayer === 'number' ? [gameState, stateOrPlayer] : [stateOrPlayer, player ?? 1];
        return checkActionDivergence(state, p);
      },
      checkInvariants: () => checkInvariants(gameState, initialCardTotal),
      fuzz,
      setSeed,
      getSeed,
      clearSeed,
      characters: { player1: player1Character, player2: player2Character },
      getReplayLog,
      loadReplayLog,
      replayToStep,
      decideAiActionTraced: (stateOrAi: GameState | PlayerNumber = gameState, ai?: PlayerNumber) => {
        const [state, player]: [GameState, PlayerNumber] =
          typeof stateOrAi === 'number' ? [gameState, stateOrAi] : [stateOrAi, ai ?? 1];
        return decideAiActionTraced(state, player);
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);
}
