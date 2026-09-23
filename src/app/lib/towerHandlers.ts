/**
 * towerHandlers.ts - transições de estado próprias do Modo Towers.
 *
 * Validação de elegibilidade continua em towerRules; este módulo aplica
 * a transformação da mão/campo depois que a ação foi aceita.
 */
import { getEffectiveCardValue } from './cardUtils';
import { isTowerSlot } from './fieldLifecycle';
import { appendLog } from './gameLog';
import { playerKeyOf } from './gameSelectors';
import { canFormOrReinforceTower } from './towerRules';
import type { FieldSlot, GameState } from './gameStateTypes';
import type { PlayerNumber } from './gameTypes';
export function handleFormOrReinforceTower(state: GameState, player: PlayerNumber, slotIndex: number, cardIds: string[]): GameState {
  if (!canFormOrReinforceTower(state, player, slotIndex, cardIds)) return state;

  const playerKey = playerKeyOf(player);
  const playerState = state[playerKey];
  const slot = playerState.field[slotIndex];
  const selectedSet = new Set(cardIds);
  const selectedCards = playerState.hand.filter((c) => selectedSet.has(c.id));
  const newHand = playerState.hand.filter((c) => !selectedSet.has(c.id));

  // Junta tudo que vai compor a torre: o que já estava no slot (reserva +
  // topo, se já era torre; ou só o topo, se era uma carta comum absorvida) +
  // as cartas recém-selecionadas - sempre reveladas (uma torre nasce e
  // permanece sempre revelada). O ÚLTIMO elemento vira o novo topo
  // (`faceDownCard`); todo o resto vira a reserva por baixo dele - a ordem
  // entre cartas de mesmo valor não importa em nada (todas são
  // intercambiáveis pro valor de combate).
  // FIX (pedido do usuário, interface de inspeção: "mostre o turno em que a
  // carta foi posicionada") - só as cartas que estão CHEGANDO agora
  // (`selectedCards`, vindas da mão) recebem um carimbo novo de
  // `placedOnTurn`; as que já estavam no slot (reserva + topo antigo) mantêm
  // o carimbo que já tinham - `handleFormOrReinforceTower` não é o
  // "nascimento" delas, só uma reorganização da pilha.
  const combined = [
    ...(slot.towerReserve ?? []).map((c) => ({ ...c, revealed: true })),
    ...(slot.faceDownCard ? [{ ...slot.faceDownCard, revealed: true }] : []),
    ...selectedCards.map((c) => ({ ...c, revealed: true, placedOnTurn: state.turn })),
  ];
  const newTop = combined[combined.length - 1];
  const newReserve = combined.slice(0, -1);

  const newField = [...playerState.field] as [FieldSlot, FieldSlot, FieldSlot];
  newField[slotIndex] = { ...slot, faceDownCard: newTop, towerReserve: newReserve, revealed: true };

  const isNewTower = !isTowerSlot(slot);
  const totalValue = combined.reduce((sum, c) => sum + getEffectiveCardValue(c), 0);
  const log = appendLog(
    state,
    state.log,
    'field',
    isNewTower
      ? `Jogador ${player} formou uma torre no slot ${slotIndex + 1} (${combined.length} cartas, valor ${totalValue})`
      : `Jogador ${player} reforçou a torre do slot ${slotIndex + 1} (${combined.length} cartas, valor ${totalValue})`,
    { player }
  );

  return {
    ...state,
    log,
    [playerKey]: {
      ...playerState,
      hand: newHand,
      field: newField,
    },
  };
}
