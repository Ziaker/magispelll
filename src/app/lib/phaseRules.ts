/**
 * phaseRules.ts - regras puras de progressão entre fases.
 *
 * Este módulo decide somente a progressão estrutural do relógio do jogo:
 * draw -> strategy -> combat -> draw, alternância de firstToFlip e avanço
 * do contador de turnos. Efeitos de entrada/saída de fase (status, campo,
 * Monstro, Spotlight etc.) continuam coordenados pelo motor.
 */
import type { Phase, PlayerNumber } from './gameTypes';

export interface PhaseTransitionState {
  phase: Phase;
  firstToFlip: PlayerNumber;
  turn: number;
}

export function getNextPhaseTransition(state: PhaseTransitionState): PhaseTransitionState {
  if (state.phase === 'draw') {
    return { phase: 'strategy', firstToFlip: state.firstToFlip, turn: state.turn };
  }
  if (state.phase === 'strategy') {
    return { phase: 'combat', firstToFlip: state.firstToFlip, turn: state.turn };
  }
  return {
    phase: 'draw',
    firstToFlip: state.firstToFlip === 1 ? 2 : 1,
    turn: state.turn + 1,
  };
}
