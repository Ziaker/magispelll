/**
 * gameStateFactory.ts - construção de estruturas-base do estado.
 *
 * Mantém defaults estruturais fora do reducer sem conhecer fases globais,
 * baralho, Spotlight, logs, IA ou UI.
 */
import type { Card } from './cardUtils';
import type { FieldSlot, PlayerState } from './gameStateTypes';
// ============================================================================
// Helpers puros
// ============================================================================

export function emptyField(): [FieldSlot, FieldSlot, FieldSlot] {
  return [
    { revealed: false, horizontalCards: [] },
    { revealed: false, horizontalCards: [] },
    { revealed: false, horizontalCards: [] },
  ];
}

export function createPlayerState(hand: Card[], handLimit: number): PlayerState {
  return {
    hand,
    field: emptyField(),
    readyForNextPhase: false,
    lives: 3,
    combatWins: 0,
    handLimit,
    horizontalStackBonus: 0,
    permanentDrawBonus: 0,
    discardsThisTurn: 0,
    drawsThisTurn: 0,
    fusesThisTurn: 0,
    monsterCard: undefined,
    monsterTargetSlot: undefined,
    monsterProtectedSlots: [],
    mosqueteiroDiscardsThisTurn: 0,
    mosqueteiroDiscardsTurnMinus1: 0,
    mosqueteiroDiscardsTurnMinus2: 0,
    fireballValue: 0,
    druidaPhotosynthesisLevel: 0,
  };
}
