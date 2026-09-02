/**
 * simulateGame.ts - laço de simulação IA-vs-IA compartilhado (item 3 do
 * plano de melhoria do debug mode).
 *
 * Antes desta peça, o MESMO laço existia duas vezes, quase idêntico:
 * `scripts/sanity-test.ts` (`simulateAiVsAiGame`) e dentro de
 * `window.__debug.fastForward` (`GameBoard.tsx`) - uma correção no
 * comportamento de um deles nunca se propagava pro outro automaticamente.
 *
 * `simulateSteps` recebe um `GameState` PRONTO e devolve um resultado plano -
 * de propósito, sem `createInitialState` nem nenhum efeito colateral (nunca
 * despacha `DEBUG_FORCE_STATE`, nunca mexe em React) - cada chamador monta o
 * estado inicial e aplica o resultado do jeito que fizer sentido pra ele
 * (`scripts/sanity-test.ts` só usa o objeto devolvido; `GameBoard.tsx`
 * aplica via `forceState` + pausa, ver o comentário de `fastForward` lá).
 */
import {
  gameReducer,
  playerKeyOf,
  opponentOf,
  type GameAction,
  type GameState,
  type PlayerNumber,
} from './gameEngine';
import { decideAiAction, decideReactionToMagic } from './aiPlayer';

export interface RejectedAiAction {
  step: number;
  player: PlayerNumber;
  action: GameAction;
}

export interface SimulateStepsResult {
  state: GameState;
  steps: number;
  stuck: boolean;
  rejectedActions: RejectedAiAction[];
}

export function simulateSteps(state: GameState, opts: { maxSteps?: number } = {}): SimulateStepsResult {
  const maxSteps = Math.min(Math.max(1, opts.maxSteps ?? 200), 5000);
  let current = state;
  let steps = 0;
  let stuck = false;
  const rejectedActions: RejectedAiAction[] = [];

  while (!current.gameOver && steps < maxSteps) {
    steps++;

    if (current.numeralSpellPending) {
      current = gameReducer(current, { type: 'FINALIZE_NUMERAL_SPELL' });
      continue;
    }
    // Modo Reações: a simulação não tem timer real de 3s - decide agora
    // mesmo (decideReactionToMagic) se reage ou avança direto pra
    // RESOLVE_PENDING_REACTION, mesmo padrão de auto-avanço já usado acima
    // pra numeralSpellPending/combatResolution.
    if (current.pendingReaction) {
      const reactor = opponentOf(current.pendingReaction.casterPlayer);
      const reaction = decideReactionToMagic(current, reactor);
      current = gameReducer(current, reaction ?? { type: 'RESOLVE_PENDING_REACTION' });
      continue;
    }
    if (current.combatResolution) {
      current = gameReducer(current, { type: 'FINALIZE_COMBAT' });
      continue;
    }
    if (current.combatSelection.player1 !== undefined && current.combatSelection.player2 !== undefined) {
      current = gameReducer(current, { type: 'RESOLVE_COMBAT' });
      continue;
    }

    // Alterna quem "age primeiro" a cada passo, para não enviesar o teste
    // sempre a favor do mesmo lado.
    const order: PlayerNumber[] = steps % 2 === 0 ? [1, 2] : [2, 1];
    let actedThisStep = false;

    for (const p of order) {
      const decision = decideAiAction(current, p);
      if (decision.type === 'action') {
        const prevState = current;
        current = gameReducer(current, decision.action);
        if (current === prevState) {
          rejectedActions.push({ step: steps, player: p, action: decision.action });
        }
        actedThisStep = true;
        break;
      } else if (decision.type === 'ready') {
        if (!current[playerKeyOf(p)].readyForNextPhase) {
          const prevState = current;
          current = gameReducer(current, { type: 'TOGGLE_READY', player: p });
          if (current === prevState) {
            rejectedActions.push({ step: steps, player: p, action: { type: 'TOGGLE_READY', player: p } });
          }
          actedThisStep = true;
          break;
        }
      }
      // 'wait' -> tenta o outro jogador neste mesmo passo
    }

    if (!actedThisStep) {
      stuck = true;
      break;
    }
  }

  return { state: current, steps, stuck, rejectedActions };
}
