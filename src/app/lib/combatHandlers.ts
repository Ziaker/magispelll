/**
 * combatHandlers.ts - transições de estado da fase de Combate.
 *
 * Começa pela seleção de slot. Resolução/finalização continuam no
 * motor até suas dependências de domínio estarem suficientemente isoladas.
 */
import { canSelectCombatSlot } from './combatRules';
import { appendLog } from './gameLog';
import { playerKeyOf } from './gameSelectors';
import type { GameState } from './gameStateTypes';
import type { PlayerNumber } from './gameTypes';
export function handleSelectCombatSlot(state: GameState, player: PlayerNumber, slotIndex: number): GameState {
  if (!canSelectCombatSlot(state, player)) return state;
  const playerKey = playerKeyOf(player);
  const selection = { ...state.combatSelection, [playerKey]: slotIndex };
  const log = appendLog(state, state.log, 'combat', `Jogador ${player} selecionou slot ${slotIndex + 1} para combate`, { player });
  return { ...state, combatSelection: selection, log };
}
