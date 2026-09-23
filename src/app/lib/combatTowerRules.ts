/**
 * combatTowerRules.ts - regras puras de Torre específicas da entrada em Combate.
 *
 * Não resolve combate nem muta estado; apenas deriva metadados do campo atual.
 */
import { isTowerSlot } from './fieldLifecycle';
import type { PlayerNumber } from './gameTypes';
import type { FieldSlot, GameState } from './gameStateTypes';
/**
 * Modo Towers - "torre solitária" (pedido do usuário, ver comentário
 * completo de `combatLoneTower` em GameState): identifica se EXATAMENTE UM
 * dos dois jogadores tem uma torre, E ela é o ÚNICO conteúdo do campo dele
 * (os outros 2 slots totalmente vazios - sem carta principal nem
 * horizontal), E o oponente não tem NENHUMA torre em nenhum slot. Chamado
 * uma única vez, na entrada da fase de Combate (ver advancePhaseState) -
 * nunca recalculado depois, porque a própria torre encolhe a cada disputa.
 */
export function computeLoneTowerForCombat(state: GameState): { towerOwner: PlayerNumber; slotIndex: number } | null {
  const findLoneTower = (field: [FieldSlot, FieldSlot, FieldSlot]): number | null => {
    const towerIndex = field.findIndex((slot) => isTowerSlot(slot));
    if (towerIndex === -1) return null;
    const othersEmpty = field.every((slot, i) => i === towerIndex || (!slot.faceDownCard && slot.horizontalCards.length === 0));
    return othersEmpty ? towerIndex : null;
  };
  const p1HasAnyTower = state.player1.field.some((slot) => isTowerSlot(slot));
  const p2HasAnyTower = state.player2.field.some((slot) => isTowerSlot(slot));
  if (p1HasAnyTower && !p2HasAnyTower) {
    const slotIndex = findLoneTower(state.player1.field);
    return slotIndex !== null ? { towerOwner: 1, slotIndex } : null;
  }
  if (p2HasAnyTower && !p1HasAnyTower) {
    const slotIndex = findLoneTower(state.player2.field);
    return slotIndex !== null ? { towerOwner: 2, slotIndex } : null;
  }
  return null;
}
