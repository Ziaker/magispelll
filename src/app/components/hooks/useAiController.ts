import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { playerKeyOf, opponentOf } from '../../lib/gameSelectors';
import { decideAiAction, decideReactionToMagic } from '../../lib/aiPlayer';
import { canMagicTriggerReactionAnnouncement } from '../../lib/gameEngine';
import { evaluateAction } from '../../lib/actionValidation';
import { getAiThinkTimeScale, type Settings } from '../../lib/settings';
import type { GameState } from '../../lib/gameStateTypes';
import type { GameAction } from '../../lib/gameActionTypes';
import type { PlayerNumber } from '../../lib/gameTypes';

export interface UseAiControllerParams {
  gameState: GameState;
  /** Quais jogadores são controlados pela IA nesta partida (GameBoard.tsx, `useMemo` sobre `gameConfig.mode`) - continua definido lá porque código humano (ex.: `saveRecentCharacter`, o inspetor de IA) também precisa dele bem antes de `dispatchWithMagicPause`/`triggerAiActionEffects` existirem, o que impede chamar este hook cedo o bastante. */
  aiPlayers: PlayerNumber[];
  settings: Settings;
  /** O `dispatch` "seguro" de GameBoard.tsx (respeita showPhaseTransition/postMagicPause/cardInspection) - continua definido lá, só consumido aqui. */
  dispatch: (action: GameAction) => void;
  dispatchWithMagicPause: (action: GameAction, dispatchFn: () => void) => void;
  dispatchMagicAction: (action: GameAction) => void;
  triggerAiActionEffects: (action: GameAction) => void;
  handleReactToMagic: (player: PlayerNumber, cardId: string) => void;
  /** `Math.max(150, Math.round(baseMs * animScale))` - mesmo helper de GameBoard.tsx, reaproveitado aqui sem duplicar a fórmula. */
  delay: (baseMs: number) => number;
  showPhaseTransition: boolean;
  /**
   * Os campos abaixo (`postMagicPause`...`pendingUnfreeze`) só entram no loop
   * de decisão da IA como guards de PRESENÇA (`if (x) return;`) - o hook
   * nunca lê o conteúdo de nenhum deles, só se é `null`/`undefined` ou não.
   * `unknown` de propósito: os tipos reais (`PendingMagic`, `PendingUnfreeze`
   * etc.) são interfaces locais de GameBoard.tsx, não exportadas - exportá-las
   * só para esta assinatura seria acoplamento sem benefício real.
   */
  postMagicPause: unknown;
  cardInspection: unknown;
  pendingMagic: unknown;
  pendingAceTransform: unknown;
  pendingMonsterEffect: unknown;
  pendingMonsterTarget: unknown;
  pendingBestaMonsterTarget: unknown;
  pendingCoringaQChoice: unknown;
  pendingUnfreeze: unknown;
}

export interface UseAiControllerResult {
  /**
   * Modo Espectador: botão "Congelar IAs" (BattleField.tsx) - pausa
   * INTENCIONAL do espectador, distinta de `gameState.paused`. GameBoard.tsx
   * repassa como prop pra BattleField sem mudança nenhuma na assinatura.
   */
  spectatorFrozen: boolean;
  setSpectatorFrozen: Dispatch<SetStateAction<boolean>>;
  /** Botão "Acelerar IA" (JSX continua em GameBoard.tsx) - acelera só a partida atual, nunca grava em `settings`. */
  aiSpeedBoost: boolean;
  setAiSpeedBoost: Dispatch<SetStateAction<boolean>>;
}

/**
 * useAiController - GameBoard Overhaul (item 6 do roadmap arquitetural,
 * continuação de `useDebugTools.ts`): extração COMPORTAMENTALMENTE NEUTRA de
 * toda a orquestração de decisão da IA (loop principal por fase, decisão de
 * Modo Reações, e o watchdog de 10s do Modo Espectador) pra um hook dedicado
 * - zero mudança em QUANDO ou O QUE a IA decide, só ONDE o código mora.
 * Nenhuma lógica de `decideAiAction`/`decideReactionToMagic` foi tocada.
 *
 * Deliberadamente NÃO incluído aqui (ver auditoria completa antes desta
 * extração):
 * - `dispatchWithMagicPause`/`dispatchMagicAction`/`triggerAiActionEffects` -
 *   infraestrutura COMPARTILHADA com handlers de clique humano (mesmas
 *   funções, não cópias) - continuam em GameBoard.tsx, só consumidas aqui via
 *   parâmetro, igual `dispatch`/`rawDispatch` em `useDebugTools.ts`.
 * - `handleReactToMagic` - mesmo motivo (um humano clicando "reagir" chama a
 *   MESMA função que a decisão automática da IA usa aqui).
 * - O ramo de IA dentro do efeito de resolução de combate (`decideCoringaQCopyTarget`,
 *   GameBoard.tsx) - esse efeito também abre um diálogo pro jogador HUMANO no
 *   ramo não-IA; extrair só o ramo de IA fatiaria um efeito genuinamente
 *   compartilhado, risco maior que o ganho.
 * - `aiPlayers`/`isAi` (GameBoard.tsx) - não computados aqui de propósito:
 *   código humano (`saveRecentCharacter`, o inspetor de IA) já precisa deles
 *   bem ANTES do ponto do arquivo onde `dispatchWithMagicPause` etc. existem,
 *   o que impediria chamar este hook cedo o bastante. Continuam em
 *   GameBoard.tsx, só passados pra cá como parâmetro read-only.
 * - `aiInspectorTraces`/`decideAiActionTraced` - puramente um painel de
 *   depuração (settings.showAiInspector), nunca decide uma ação de verdade.
 *
 * Precisa ser chamado em GameBoard.tsx DEPOIS de `dispatchWithMagicPause`/
 * `dispatchMagicAction`/`triggerAiActionEffects` estarem definidos (essas 3
 * funções são passadas por referência - a posição do `useAiController(...)`
 * no arquivo importa).
 */
export function useAiController({
  gameState,
  aiPlayers,
  settings,
  dispatch,
  dispatchWithMagicPause,
  dispatchMagicAction,
  triggerAiActionEffects,
  handleReactToMagic,
  delay,
  showPhaseTransition,
  postMagicPause,
  cardInspection,
  pendingMagic,
  pendingAceTransform,
  pendingMonsterEffect,
  pendingMonsterTarget,
  pendingBestaMonsterTarget,
  pendingCoringaQChoice,
  pendingUnfreeze,
}: UseAiControllerParams): UseAiControllerResult {
  const [spectatorFrozen, setSpectatorFrozen] = useState(false);
  // FIX (pedido do usuário, QoL: "botão de acelerar pontual durante a vez da
  // IA, sem mexer na preferência global") - `getAiThinkTimeScale(settings)`
  // sozinho é a preferência PERSISTIDA (Configurações -> "Velocidade de
  // Pensamento da IA"), vale a partida inteira. `aiSpeedBoost` é só desta
  // sessão de jogo (nunca gravado em `settings`) - `true` reescala pra 0
  // (ainda passa pelo piso de 150ms de `delay()`, nunca literalmente
  // instantâneo) só enquanto o botão "Acelerar" está ligado.
  const [aiSpeedBoost, setAiSpeedBoost] = useState(false);
  const aiThinkScale = aiSpeedBoost ? 0 : getAiThinkTimeScale(settings);

  const isAi = (player: PlayerNumber) => aiPlayers.includes(player);

  // Rede de segurança GENÉRICA contra a IA propor uma ação que o motor
  // (gameEngine.ts) REJEITA sem nenhum efeito real - ver o comentário
  // completo (histórico de falso-positivo com o Anjo revelando armadilha do
  // Coringa) na versão anterior deste código em GameBoard.tsx antes desta
  // extração. Detecta isso via `evaluateAction`, a mesma autoridade
  // compartilhada de `actionValidation.ts` usada por simuladores e
  // action-space.
  const isNoOpAiAction = (action: GameAction): boolean => !evaluateAction(gameState, action).accepted;

  // A IA (quando é ELA quem pode reagir) decide sozinha, com um "tempo de
  // pensar" aleatório dentro da janela de 3s de Modo Reações -
  // decideReactionToMagic (aiPlayer.ts, "aleatório" por pedido do usuário) só
  // devolve uma ação quando decide reagir; quando não, simplesmente não faz
  // nada e deixa o timer da janela (GameBoard.tsx) expirar normalmente.
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
  // para não competir por atenção com esses fluxos. `decideAiAction` já é uma
  // função pura parametrizada por `player` (nunca assumiu que o outro lado
  // fosse humano), então chamá-la uma vez por IA em `aiPlayers` já basta.
  //
  // FIX (softlock real encontrado ao vivo - "a IA trava na fase de
  // estratégia/combate no modo Espectador"): `showPhaseTransition` precisa
  // estar tanto no guard quanto na lista de dependências - só checar não
  // bastava (o efeito nunca reavaliava depois do popup fechar). Ver
  // feedback_review_blocking_timer_useeffect_deps na memória - a MESMA classe
  // de bug (dependência larga cancelando um timer sem reagendar) quase se
  // repetiu aqui na direção oposta (dependência FALTANDO impedia reagendar).
  useEffect(() => {
    if (aiPlayers.length === 0) return;
    if (gameState.paused || gameState.gameOver) return;
    if (gameState.combatResolution || gameState.numeralSpellPending) return;
    // Modo Reações: enquanto uma magia está anunciada, a decisão da IA (se
    // ela for quem pode reagir) já tem seu PRÓPRIO efeito acima - este loop
    // geral de decideAiAction precisa ficar de fora completamente, senão
    // pediria uma decisão de FASE pra um estado que o motor está bloqueando.
    if (gameState.pendingReaction) return;
    if (pendingMagic || pendingAceTransform || pendingMonsterEffect || pendingMonsterTarget || pendingBestaMonsterTarget || pendingCoringaQChoice || pendingUnfreeze) return;
    if (showPhaseTransition) return;
    if (postMagicPause) return;
    if (cardInspection) return;
    if (spectatorFrozen) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const ai of aiPlayers) {
      const decision = decideAiAction(gameState, ai);
      if (decision.type === 'wait') continue;
      if (decision.type === 'ready' && gameState[playerKeyOf(ai)].readyForNextPhase) continue;

      if (decision.type === 'action' && isNoOpAiAction(decision.action)) {
        const t = setTimeout(() => dispatch({ type: 'TOGGLE_READY', player: ai }), delay(450 * aiThinkScale));
        timers.push(t);
        continue;
      }

      // `aiThinkScale` (settings.ts) reescala TODO atraso de "pensando..."
      // aqui, no único ponto que os despacha de verdade.
      const baseMs = (decision.type === 'action' ? decision.thinkTimeMs ?? 700 + Math.random() * 500 : 450) * aiThinkScale;
      const t = setTimeout(() => {
        if (decision.type === 'action') {
          // Dispara a mesma apresentação (flash/som/estilhaço/roleta) que o
          // clique humano equivalente dispararia, ANTES do dispatch (mesma
          // ordem já usada pelos handlers humanos). Se esta ação da IA for só
          // um ANÚNCIO de Modo Reações, a apresentação NÃO toca aqui, só
          // depois via o timer de 3s de GameBoard.tsx.
          const isAnnouncement =
            (decision.action.type === 'EXECUTE_MAGIC' || decision.action.type === 'ACTIVATE_SIMPLE_MAGIC') &&
            canMagicTriggerReactionAnnouncement(gameState, decision.action.player, decision.action.cardId);
          if (!isAnnouncement) {
            triggerAiActionEffects(decision.action);
            dispatchWithMagicPause(decision.action, () => dispatchMagicAction(decision.action));
          } else {
            dispatchMagicAction(decision.action);
          }
        } else {
          dispatch({ type: 'TOGGLE_READY', player: ai });
        }
      }, delay(baseMs));
      timers.push(t);
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, aiPlayers, pendingMagic, pendingAceTransform, pendingMonsterEffect, pendingMonsterTarget, pendingBestaMonsterTarget, pendingCoringaQChoice, pendingUnfreeze, showPhaseTransition, postMagicPause, cardInspection, spectatorFrozen]);

  // FIX (pedido do usuário: "ainda ocorre softlocks no espectador... adicione
  // um timer de 10 segundos pra IA rever o que está ou deveria fazer, caso
  // passe estes 10, a IA avisa prontidão para troca de fase imediatamente") -
  // rede de segurança GENÉRICA contra qualquer softlock da IA no Modo
  // Espectador, mesmo uma causa ainda não identificada/corrigida - esta rede
  // não depende de conhecer a causa: só garante que o jogo nunca fique
  // parado pra sempre. Tempo REAL de parede, de propósito SEM usar `delay()`
  // - a escala de velocidade de animação não deve mudar quanto tempo o jogo
  // espera antes de decidir que travou.
  //
  // Restrito a `aiPlayers.length === 2` (só o Modo Espectador) DE PROPÓSITO:
  // no modo "Contra a IA" o jogador humano pode ficar mais de 10s parado só
  // pensando (perfeitamente normal).
  useEffect(() => {
    if (aiPlayers.length !== 2) return;
    if (gameState.paused || gameState.gameOver) return;
    // Interface de Inspeção de Carta: uma partida IA vs IA parada porque o
    // ESPECTADOR está inspecionando uma carta não é um travamento.
    if (cardInspection) return;
    // Botão "Congelar IAs" - pausa INTENCIONAL do espectador, não travamento.
    if (spectatorFrozen) return;

    const t = setTimeout(() => {
      for (const ai of aiPlayers) {
        if (!gameState[playerKeyOf(ai)].readyForNextPhase) {
          dispatch({ type: 'TOGGLE_READY', player: ai });
        }
      }
    }, 10000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, aiPlayers, cardInspection, spectatorFrozen]);

  return { spectatorFrozen, setSpectatorFrozen, aiSpeedBoost, setAiSpeedBoost };
}
