/**
 * playerPhaseLifecycle.ts - estado temporário do jogador entre fases.
 *
 * Concentra expiração de status, crescimento do Broto e os resets que
 * acontecem a cada transição ou apenas quando uma nova fase de Compra
 * inicia. Não conhece reducer, logs, IA ou UI.
 */
import { growDruidaBrotoField } from './druidaLifecycle';
import { keepPersistentFieldSlots } from './fieldLifecycle';
import {
  getStatusMagnitude,
  tickEntityStatuses,
  tickFieldStatuses,
  tickStatuses,
} from './statusEffects';
import type { Phase } from './gameTypes';
import type { PlayerState } from './gameStateTypes';

export interface PlayerPhaseTransitionContext {
  newTurn: number;
  newPhase: Phase;
  towersMode: boolean;
}

/**
 * Aplica a parte da transição de fase que pertence a um único jogador.
 *
 * Algumas regras rodam em TODA transição (tick de status, reset de
 * vitórias da fase de combate, crescimento do Broto); outras só na
 * entrada em Compra, que representa a virada real de turno.
 */
export function resetPlayerForPhaseTransition(
  player: PlayerState,
  monsterKept: PlayerState['monsterCard'],
  context: PlayerPhaseTransitionContext
): PlayerState {
  const { newTurn, newPhase, towersMode } = context;
  const tickContext = { newTurn, newPhase };
  const tickedPlayerStatuses = tickStatuses(player.statusEffects ?? [], tickContext);
  const handLimitBonus = getStatusMagnitude(
    { statusEffects: tickedPlayerStatuses },
    'handLimitBonus',
    { source: 'mosqueteiro' }
  );

  return {
    ...player,
    statusEffects: tickedPlayerStatuses,
    hand: player.hand.map((card) => tickEntityStatuses(card, tickContext)),
    handLimit: 8 + player.permanentDrawBonus + (towersMode ? 1 : 0) + handLimitBonus,
    horizontalStackBonus: 0,
    combatWins: 0,
    field: growDruidaBrotoField(
      tickFieldStatuses(
        newPhase === 'draw' ? keepPersistentFieldSlots(player.field) : player.field,
        tickContext
      ),
      player.druidaPhotosynthesisLevel
    ),
    monsterCard: newPhase === 'draw' ? monsterKept : player.monsterCard,
    monsterTargetSlot: newPhase === 'draw' ? undefined : player.monsterTargetSlot,
    monsterProtectedSlots: newPhase === 'draw' ? [] : player.monsterProtectedSlots,
    discardsThisTurn: newPhase === 'draw' ? 0 : player.discardsThisTurn,
    drawsThisTurn: newPhase === 'draw' ? 0 : player.drawsThisTurn,
    fusesThisTurn: newPhase === 'draw' ? 0 : player.fusesThisTurn,
    mosqueteiroDiscardsTurnMinus2:
      newPhase === 'draw' ? player.mosqueteiroDiscardsTurnMinus1 : player.mosqueteiroDiscardsTurnMinus2,
    mosqueteiroDiscardsTurnMinus1:
      newPhase === 'draw' ? player.mosqueteiroDiscardsThisTurn : player.mosqueteiroDiscardsTurnMinus1,
    mosqueteiroDiscardsThisTurn:
      newPhase === 'draw' ? 0 : player.mosqueteiroDiscardsThisTurn,
  };
}
