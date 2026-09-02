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
import { enumerateLegalActions } from './actionSpace';
import { checkInvariants } from './invariants';
import { random } from './rng';

export interface RejectedAiAction {
  step: number;
  player: PlayerNumber;
  action: GameAction;
  /**
   * `'ai'` (padrão implícito em `simulateSteps`, que nunca substitui nada) =
   * a IA heurística (`decideAiAction`) propôs isto e o motor recusou - SEMPRE
   * um sinal de bug real (a IA nunca deveria propor algo inválido). `'substitute'`
   * (só em `fuzzSteps`) = a ação veio de `enumerateLegalActions` no lugar da
   * escolha da IA - rejeição aqui é ESPERADA às vezes (o modo "legal" do
   * enumerador não é 100% preciso por design, ver actionSpace.ts), nunca por
   * si só um sinal de bug. Quem consome esta lista (ex.: scripts/fuzz.ts)
   * precisa filtrar por isso antes de tratar `rejectedActions.length > 0`
   * como falha.
   */
  source?: 'ai' | 'substitute';
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

export interface FuzzViolation {
  step: number;
  action: GameAction;
  violations: string[];
}

export interface FuzzStepsResult {
  state: GameState;
  steps: number;
  stuck: boolean;
  rejectedActions: RejectedAiAction[];
  /** `null` = nenhuma violação encontrada nos passos rodados. */
  violation: FuzzViolation | null;
}

/**
 * `fuzzSteps` - mesmo formato de `simulateSteps`, mas em cada decisão da IA
 * (nunca nas transições automáticas - FINALIZE_NUMERAL_SPELL, FINALIZE_COMBAT,
 * RESOLVE_COMBAT etc., essas continuam determinísticas) tem `substituteProbability` de chance de trocar a escolha
 * da IA heurística por uma ação ALEATÓRIA de `enumerateLegalActions` (modo
 * "legal", rápido - ver actionSpace.ts) - explora estado que a IA heurística
 * sozinha nunca visitaria. Roda `checkInvariants` depois de CADA ação
 * despachada e para na primeira violação, devolvendo o passo/ação exatos.
 *
 * ARMADILHA EVITADA (documentada em rng.ts): a MOEDA de decisão "substituo
 * ou não" também vem de `random()` (item 2, com seed) - se fosse
 * `Math.random()` cru aqui, `setSeed` sozinho não bastaria pra reproduzir
 * uma corrida de fuzzing específica, porque sobraria uma fonte de
 * aleatoriedade fora do seed. `enumerateLegalActions` também às vezes
 * escolhe entre múltiplos candidatos - isso usa `random()` também.
 */
export function fuzzSteps(
  state: GameState,
  opts: { maxSteps?: number; substituteProbability?: number; expectedCardTotal?: number } = {}
): FuzzStepsResult {
  const maxSteps = Math.min(Math.max(1, opts.maxSteps ?? 200), 5000);
  const substituteProbability = Math.min(1, Math.max(0, opts.substituteProbability ?? 0.15));
  let current = state;
  let steps = 0;
  let stuck = false;
  const rejectedActions: RejectedAiAction[] = [];
  let violation: FuzzViolation | null = null;

  const dispatchAndCheck = (action: GameAction): boolean => {
    const prevState = current;
    current = gameReducer(current, action);
    if (current === prevState) return false;
    // `countAllCards` (invariants.ts) já pesa cartas fundidas vivas pelo
    // número de cartas físicas que elas representam - `expectedCardTotal`
    // fica CONSTANTE a partida inteira, mesmo com Fusão ligada (ver o
    // comentário de `countAllCards` pra como isso foi descoberto).
    const found = checkInvariants(current, opts.expectedCardTotal);
    if (found.length > 0) {
      violation = { step: steps, action, violations: found };
      return true;
    }
    return false;
  };

  while (!current.gameOver && steps < maxSteps && !violation) {
    steps++;

    if (current.numeralSpellPending) {
      if (dispatchAndCheck({ type: 'FINALIZE_NUMERAL_SPELL' })) break;
      continue;
    }
    if (current.pendingReaction) {
      const reactor = opponentOf(current.pendingReaction.casterPlayer);
      const reaction = decideReactionToMagic(current, reactor);
      if (dispatchAndCheck(reaction ?? { type: 'RESOLVE_PENDING_REACTION' })) break;
      continue;
    }
    if (current.combatResolution) {
      if (dispatchAndCheck({ type: 'FINALIZE_COMBAT' })) break;
      continue;
    }
    if (current.combatSelection.player1 !== undefined && current.combatSelection.player2 !== undefined) {
      if (dispatchAndCheck({ type: 'RESOLVE_COMBAT' })) break;
      continue;
    }

    const order: PlayerNumber[] = steps % 2 === 0 ? [1, 2] : [2, 1];
    let actedThisStep = false;

    for (const p of order) {
      const decision = decideAiAction(current, p);
      if (decision.type === 'action') {
        let action = decision.action;
        let source: 'ai' | 'substitute' = 'ai';
        if (random() < substituteProbability) {
          const legal = enumerateLegalActions(current, p);
          if (legal.length > 0) {
            action = legal[Math.floor(random() * legal.length)];
            source = 'substitute';
          }
        }
        const prevState = current;
        if (dispatchAndCheck(action)) { actedThisStep = true; break; }
        if (current === prevState) rejectedActions.push({ step: steps, player: p, action, source });
        actedThisStep = true;
        break;
      } else if (decision.type === 'ready') {
        if (!current[playerKeyOf(p)].readyForNextPhase) {
          if (dispatchAndCheck({ type: 'TOGGLE_READY', player: p })) { actedThisStep = true; break; }
          actedThisStep = true;
          break;
        }
      }
    }

    if (!actedThisStep) {
      stuck = true;
      break;
    }
  }

  return { state: current, steps, stuck, rejectedActions, violation };
}
