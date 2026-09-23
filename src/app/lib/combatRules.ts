/**
 * combatRules.ts - guards e consultas puras da fase de Combate.
 *
 * Não resolve disputas nem muta estado; apenas valida ordem e disponibilidade.
 */
import type { PlayerNumber } from './gameTypes';
import type { GameState } from './gameStateTypes';
import { opponentKeyOf, playerKeyOf } from './gameSelectors';
// ---------------------------------------------------------------------------
// Combate
// ---------------------------------------------------------------------------

/**
 * Verdadeiro se `player` pode escolher um slot de combate AGORA - a mesma
 * regra que handleSelectCombatSlot usa pra aceitar/rejeitar de verdade,
 * extraída aqui pra ser a ÚNICA fonte da verdade (checagem extensa por bugs,
 * pedido do usuário: "consolide as regras duplicadas... 2 por 2"). Antes
 * desta extração, aiPlayer.ts (decideCombatSlotSelection) e a UI
 * (GameBoard.tsx, seleção automática quando só resta 1 carta) cada um tinha
 * sua PRÓPRIA cópia desta mesma expressão (`firstToFlip === player ?
 * theirSelection === undefined : theirSelection !== undefined`) - por
 * enquanto sempre em sincronia (foi conferido linha a linha nesta rodada),
 * mas 3 cópias independentes da mesma regra é exatamente o padrão que já
 * causou bugs reais neste projeto (ver getUnbattledHorizontalSlots, auditoria
 * anterior) assim que uma delas mudasse sem as outras acompanharem.
 *
 * FIX (item 10 da 2ª rodada, preservado aqui): um slot SEM carta nenhuma
 * ainda pode ser selecionado para combate normalmente - ele vale 1 (ver
 * handleResolveCombat) em vez de ser um "buraco" inutilizável quando um
 * jogador posiciona menos de 3 cartas - por isso esta função não olha
 * `field` nenhum, só a ordem de seleção (`firstToFlip`/`combatSelection`).
 */
export function canSelectCombatSlot(state: GameState, player: PlayerNumber): boolean {
  if (state.phase !== 'combat' || state.combatResolution) return false;
  const playerKey = playerKeyOf(player);
  if (state.combatSelection[playerKey] !== undefined) return false; // já escolheu nesta rodada
  const otherKey = opponentKeyOf(player);
  const theirSelection = state.combatSelection[otherKey];
  if (state.firstToFlip === player) return theirSelection === undefined;
  return theirSelection !== undefined;
}
